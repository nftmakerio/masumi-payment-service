import { $Enums } from "@prisma/client";
import { Sema } from "async-sema";
import { prisma } from '@/utils/db';
import { BlockfrostProvider, MeshWallet, Transaction, mBool, resolvePaymentKeyHash } from "@meshsdk/core";
import { decrypt } from "@/utils/encryption";
import { logger } from "@/utils/logger";


const updateMutex = new Sema(1);



export async function batchLatestPaymentEntriesV1() {

    const maxBatchSize = 10;
    const minTransactionCalculation = 300000n;

    const acquiredMutex = await updateMutex.tryAcquire();
    //if we are already performing an update, we wait for it to finish and return
    if (!acquiredMutex)
        return await updateMutex.acquire();

    try {
        const networkChecks = await prisma.networkHandler.findMany({ where: { paymentType: "WEB3_CARDANO_V1" }, include: { PurchaseRequests: { where: { status: $Enums.PurchasingRequestStatus.PurchaseRequested }, include: { amounts: { select: { amount: true, unit: true } }, sellerWallet: { select: { walletVkey: true } } } }, PurchasingWallets: { include: { walletSecret: true } } } })
        await Promise.all(networkChecks.map(async (networkCheck) => {
            const network = networkCheck.network == "MAINNET" ? "mainnet" : networkCheck.network == "PREPROD" ? "preprod" : networkCheck.network == "PREVIEW" ? "preview" : null;
            if (!network)
                throw new Error("Invalid network")

            const blockchainHandler = new BlockfrostProvider(networkCheck.blockfrostApiKey, 0);
            const paymentRequests = networkCheck.PurchaseRequests;
            if (paymentRequests.length == 0) {
                logger.info("no payment requests found for network " + networkCheck.network + " " + networkCheck.addressToCheck)
                return;
            }

            const potentialWallets = networkCheck.PurchasingWallets;

            const walletAmounts = await Promise.all(potentialWallets.map(async (wallet) => {
                const secretEncrypted = wallet.walletSecret.secret;
                const secretDecrypted = decrypt(secretEncrypted);
                const meshWallet = new MeshWallet({
                    networkId: networkCheck.network == "MAINNET" ? 1 : 0,
                    fetcher: blockchainHandler,
                    submitter: blockchainHandler,
                    key: {
                        type: 'mnemonic',
                        words: secretDecrypted.split(' '),
                    },
                });
                const amounts = await meshWallet.getBalance();

                //TODO check if conversion to float fails
                return {
                    wallet: meshWallet,
                    scriptAddress: networkCheck.addressToCheck,
                    amounts: amounts.map((amount) => ({ unit: amount.unit, quantity: parseFloat(amount.quantity) }))
                }
            }))
            const paymentRequestsRemaining = [...paymentRequests];
            const walletPairings: { wallet: MeshWallet, scriptAddress: string, batchedRequests: { amounts: { unit: string, amount: bigint }[], identifier: string, resultHash: string | null, id: string, sellerWallet: { walletVkey: string }, refundTime: bigint, unlockTime: bigint }[] }[] = [];
            let maxBatchSizeReached = false;
            //TODO: greedy search?
            for (const walletData of walletAmounts) {
                const wallet = walletData.wallet;
                const amounts = walletData.amounts;
                const batchedPaymentRequests = [];


                while (paymentRequestsRemaining.length > 0) {
                    if (batchedPaymentRequests.length >= maxBatchSize) {
                        maxBatchSizeReached = true;
                        break;
                    }
                    const paymentRequest = paymentRequestsRemaining[0];


                    //set min ada required;
                    const lovelaceRequired = paymentRequest.amounts.findIndex((amount) => amount.unit.toLowerCase() == "lovelace");
                    if (lovelaceRequired == -1) {
                        paymentRequest.amounts.push({ unit: "lovelace", amount: minTransactionCalculation })
                    } else {
                        const result = paymentRequest.amounts.splice(lovelaceRequired, 1);
                        paymentRequest.amounts.push({ unit: "lovelace", amount: minTransactionCalculation + result[0].amount })
                    }
                    let isFulfilled = true;
                    for (const paymentAmount of paymentRequest.amounts) {
                        const walletAmount = amounts.find((amount) => amount.unit == paymentAmount.unit);
                        if (walletAmount == null || paymentAmount.amount > walletAmount.quantity) {
                            isFulfilled = false;
                            break;
                        }
                    }
                    if (isFulfilled) {
                        batchedPaymentRequests.push(paymentRequest);
                        //deduct amounts from wallet
                        for (const paymentAmount of paymentRequest.amounts) {
                            const walletAmount = amounts.find((amount) => amount.unit == paymentAmount.unit);
                            walletAmount!.quantity -= parseInt(paymentAmount.amount.toString());
                        }
                        paymentRequestsRemaining.splice(0, 1);
                    }
                }

                walletPairings.push({ wallet: wallet, scriptAddress: walletData.scriptAddress, batchedRequests: batchedPaymentRequests });
                //TODO create tx
            }
            //only go into error state if we did not reach max batch size, as otherwise we might have enough funds in other wallets
            if (paymentRequestsRemaining.length > 0 && maxBatchSizeReached == false)
                await Promise.all(paymentRequestsRemaining.map(async (paymentRequest) => {
                    //TODO create tx
                    await prisma.purchaseRequest.update({
                        where: { id: paymentRequest.id }, data: {
                            status: $Enums.PurchasingRequestStatus.Error,
                            errorRequiresManualReview: true, errorNote: "Not enough funds in wallets", errorType: $Enums.PurchaseRequestErrorType.INSUFFICIENT_FUNDS
                        }
                    })
                }))
            await Promise.all(walletPairings.map(async (walletPairing) => {
                try {

                    const wallet = walletPairing.wallet;
                    const batchedRequests = walletPairing.batchedRequests;
                    //batch payments
                    const unsignedTx = await new Transaction({ initiator: wallet })
                    for (const paymentRequest of batchedRequests) {
                        const buyerVerificationKeyHash = resolvePaymentKeyHash(wallet.getUsedAddress().toBech32())
                        const sellerVerificationKeyHash = paymentRequest.sellerWallet.walletVkey;
                        const unlockTime = parseInt(paymentRequest.unlockTime.toString());
                        const refundTime = parseInt(paymentRequest.refundTime.toString());
                        const correctedPaymentAmounts = paymentRequest.amounts;
                        const lovelaceIndex = correctedPaymentAmounts.findIndex((amount) => amount.unit.toLowerCase() == "lovelace");
                        if (lovelaceIndex != -1) {
                            const removedLovelace = correctedPaymentAmounts.splice(lovelaceIndex, 1);
                            if (removedLovelace[0].amount > minTransactionCalculation) {
                                correctedPaymentAmounts.push({ unit: "lovelace", amount: removedLovelace[0].amount - minTransactionCalculation })
                            }
                        }

                        const datum = {
                            value: {
                                alternative: 0,
                                fields: [
                                    buyerVerificationKeyHash,
                                    sellerVerificationKeyHash,
                                    paymentRequest.identifier,
                                    paymentRequest.resultHash ?? '',
                                    unlockTime,
                                    refundTime,
                                    //is converted to false
                                    mBool(false),
                                    //is converted to false
                                    mBool(false),
                                ],
                            },
                            inline: true,
                        };

                        unsignedTx.sendAssets({
                            address: walletPairing.scriptAddress,
                            datum,
                        },
                            paymentRequest.amounts.map((amount) => ({ unit: amount.unit, quantity: amount.amount.toString() }))
                        )
                    }

                    const completeTx = await unsignedTx.build();
                    const signedTx = await wallet.signTx(completeTx);
                    //submit the transaction to the blockchain
                    const txHash = await wallet.submitTx(signedTx);
                    //TODO maybe add alternative submitter
                    try {
                        //update purchase requests
                        await prisma.purchaseRequest.updateMany({ where: { id: { in: batchedRequests.map((request) => request.id) } }, data: { potentialTxHash: txHash, status: $Enums.PurchasingRequestStatus.PurchaseInitiated } })
                    } catch (error) {
                        //TODO handle this error
                        logger.error(error);
                    }
                } catch (error) {
                    logger.error(error);
                }
            }))

        }))
    }
    finally {
        //library is strange as we can release from any non-acquired semaphore
        updateMutex.release()
    }
}

export const cardanoTxHandlerService = { batchLatestPaymentEntriesV1 }