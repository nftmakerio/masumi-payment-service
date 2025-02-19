import { HotWallet, HotWalletType, PurchaseErrorType, PurchasingAction, TransactionStatus } from "@prisma/client";
import { Sema } from "async-sema";
import { prisma } from '@/utils/db';
import { Transaction, mBool, resolvePaymentKeyHash } from "@meshsdk/core";
import { logger } from "@/utils/logger";
import { generateWalletExtended } from "@/utils/generator/wallet-generator";
import { delayErrorResolver, advancedRetry } from "advanced-retry";
import { SmartContractState } from "@/utils/generator/contract-generator";
import { getSmartContractStateDatum } from "@/utils/generator/contract-generator";

const updateMutex = new Sema(1);



export async function batchLatestPaymentEntriesV1() {

    const maxBatchSize = 10;
    const minTransactionCalculation = 1952430n;

    const acquiredMutex = await updateMutex.tryAcquire();
    //if we are already performing an update, we wait for it to finish and return
    if (!acquiredMutex)
        return await updateMutex.acquire();

    try {
        const paymentContractsWithWalletLocked = await prisma.$transaction(async (prisma) => {
            const paymentContracts = await prisma.paymentSource.findMany({
                where: {
                    HotWallets: {
                        some: {
                            PendingTransaction: null,
                            type: HotWalletType.Purchasing
                        }
                    }
                },
                include: {
                    PurchaseRequests: {
                        where: {
                            NextAction: {
                                requestedAction: PurchasingAction.FundsLockingRequested,
                                errorType: null,
                            },
                            CurrentTransaction: { isNot: null }
                        },
                        include: {
                            Amounts: true,
                            SellerWallet: true,
                            SmartContractWallet: true,
                            NextAction: true,
                            CurrentTransaction: true,
                        }
                    },
                    PaymentSourceConfig: true,
                    HotWallets: {
                        where: {
                            PendingTransaction: null,
                            lockedAt: null,
                            type: HotWalletType.Purchasing
                        },
                        include: {
                            Secret: true
                        }
                    }
                }
            })

            const walletsToLock: HotWallet[] = []
            const paymentContractsToUse = []
            for (const paymentContract of paymentContracts) {
                const purchaseRequests = []
                for (const purchaseRequest of paymentContract.PurchaseRequests) {

                    //if the purchase request times out in less than 5 minutes, we ignore it
                    const maxSubmitResultTime = Date.now() - 1000 * 60 * 5
                    if (purchaseRequest.submitResultTime < maxSubmitResultTime) {
                        logger.info("Purchase request times out in less than 5 minutes, ignoring", { purchaseRequest: purchaseRequest })
                        await prisma.purchaseRequest.update({
                            where: { id: purchaseRequest.id },
                            data: {
                                NextAction: {
                                    create: { requestedAction: PurchasingAction.FundsLockingRequested, errorType: PurchaseErrorType.Unknown, errorNote: "Transaction timeout before sending", }
                                },
                            }
                        })
                        continue;
                    }
                    purchaseRequests.push(purchaseRequest)
                }
                if (purchaseRequests.length == 0) {
                    continue;
                }
                paymentContract.PurchaseRequests = purchaseRequests;
                for (const wallet of paymentContract.HotWallets) {
                    if (!walletsToLock.some(w => w.id === wallet.id)) {
                        walletsToLock.push(wallet);
                        await prisma.hotWallet.update({
                            where: { id: wallet.id },
                            data: { lockedAt: new Date() }
                        })
                    }
                }
                paymentContractsToUse.push(paymentContract)
            }
            return paymentContractsToUse;
        }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 10000 })

        await Promise.allSettled(paymentContractsWithWalletLocked.map(async (paymentContract) => {
            const paymentRequests = paymentContract.PurchaseRequests;
            if (paymentRequests.length == 0) {
                logger.info("no payment requests found for network " + paymentContract.network + " " + paymentContract.smartContractAddress)
                return;
            }

            const potentialWallets = paymentContract.HotWallets;

            const walletAmounts = await Promise.all(potentialWallets.map(async (wallet) => {
                const { wallet: meshWallet, } = await generateWalletExtended(paymentContract.network, paymentContract.PaymentSourceConfig.rpcProviderApiKey, wallet.Secret.encryptedMnemonic)
                const amounts = await meshWallet.getBalance();
                return {
                    wallet: meshWallet,
                    walletId: wallet.id,
                    scriptAddress: paymentContract.smartContractAddress,
                    amounts: amounts.map((amount) => ({ unit: amount.unit, quantity: BigInt(amount.quantity) }))
                }
            }))
            const paymentRequestsRemaining = [...paymentRequests];
            const walletPairings = [];
            let maxBatchSizeReached = false;

            for (const walletData of walletAmounts) {
                const wallet = walletData.wallet;
                const amounts = walletData.amounts;
                const batchedPaymentRequests = [];

                let index = 0;
                while (paymentRequestsRemaining.length > 0 && index < paymentRequestsRemaining.length) {
                    if (batchedPaymentRequests.length >= maxBatchSize) {
                        maxBatchSizeReached = true;
                        break;
                    }
                    const paymentRequest = paymentRequestsRemaining[index];


                    //set min ada required;
                    const lovelaceRequired = paymentRequest.Amounts.findIndex((amount) => amount.unit.toLowerCase() == "lovelace");
                    if (lovelaceRequired == -1) {
                        paymentRequest.Amounts.push({ unit: "lovelace", amount: minTransactionCalculation, id: "", createdAt: new Date(), updatedAt: new Date(), paymentRequestId: null, purchaseRequestId: null })
                    } else {
                        const result = paymentRequest.Amounts.splice(lovelaceRequired, 1);
                        paymentRequest.Amounts.push({ unit: "lovelace", amount: minTransactionCalculation > result[0].amount ? minTransactionCalculation : result[0].amount, id: "", createdAt: new Date(), updatedAt: new Date(), paymentRequestId: null, purchaseRequestId: null })
                    }
                    let isFulfilled = true;
                    for (const paymentAmount of paymentRequest.Amounts) {
                        const walletAmount = amounts.find((amount) => amount.unit == paymentAmount.unit);
                        if (walletAmount == null || paymentAmount.amount > walletAmount.quantity) {
                            isFulfilled = false;
                            break;
                        }
                    }
                    if (isFulfilled) {
                        batchedPaymentRequests.push(paymentRequest);
                        //deduct amounts from wallet
                        for (const paymentAmount of paymentRequest.Amounts) {
                            const walletAmount = amounts.find((amount) => amount.unit == paymentAmount.unit);
                            walletAmount!.quantity -= paymentAmount.amount;
                        }
                        paymentRequestsRemaining.splice(index, 1);

                    } else {
                        index++;
                    }
                }

                walletPairings.push({ wallet: wallet, scriptAddress: walletData.scriptAddress, walletId: walletData.walletId, batchedRequests: batchedPaymentRequests });
            }
            //only go into error state if we did not reach max batch size, as otherwise we might have enough funds in other wallets
            if (paymentRequestsRemaining.length > 0 && maxBatchSizeReached == false)
                await Promise.allSettled(paymentRequestsRemaining.map(async (paymentRequest) => {
                    await prisma.purchaseRequest.update({
                        where: { id: paymentRequest.id }, data: {
                            NextAction: {
                                create: {
                                    requestedAction: PurchasingAction.WaitingForManualAction,
                                    errorType: PurchaseErrorType.InsufficientFunds,
                                    errorNote: "Not enough funds in wallets",
                                }
                            }
                        }
                    })
                }))
            await Promise.allSettled(walletPairings.map(async (walletPairing) => {
                try {

                    const wallet = walletPairing.wallet;
                    const walletId = walletPairing.walletId;
                    const batchedRequests = walletPairing.batchedRequests;
                    //batch payments
                    const unsignedTx = await new Transaction({ initiator: wallet, }).setMetadata(674, {
                        msg: ["Masumi", "PaymentBatched"],
                    })
                    for (const paymentRequest of batchedRequests) {
                        const buyerVerificationKeyHash = resolvePaymentKeyHash(wallet.getUsedAddress().toBech32())
                        const sellerVerificationKeyHash = paymentRequest.SellerWallet.walletVkey;
                        const submitResultTime = paymentRequest.submitResultTime
                        const unlockTime = paymentRequest.unlockTime
                        const refundTime = paymentRequest.refundTime

                        const datum = {
                            value: {
                                alternative: 0,
                                fields: [
                                    Buffer.from(buyerVerificationKeyHash).toString("hex"),
                                    Buffer.from(sellerVerificationKeyHash).toString("hex"),
                                    Buffer.from(paymentRequest.blockchainIdentifier).toString("hex"),
                                    Buffer.from("").toString("hex"),
                                    submitResultTime,
                                    unlockTime,
                                    refundTime,
                                    //is converted to false
                                    mBool(false),
                                    0,
                                    0,
                                    getSmartContractStateDatum(SmartContractState.FundsLocked)
                                ],
                            },
                            inline: true,
                        };
                        unsignedTx.sendAssets({
                            address: walletPairing.scriptAddress,
                            datum,
                        },
                            paymentRequest.Amounts.map((amount) => ({ unit: amount.unit, quantity: amount.amount.toString() }))
                        )
                    }

                    const purchaseRequests = await Promise.allSettled(batchedRequests.map(async (request) => {
                        await prisma.purchaseRequest.update({
                            where: { id: request.id }, data: {
                                NextAction: {
                                    update: {
                                        requestedAction: PurchasingAction.FundsLockingInitiated,
                                    },
                                },
                                SmartContractWallet: {
                                    connect: {
                                        id: walletId
                                    }
                                },

                            }
                        })
                    }))
                    const failedPurchaseRequests = purchaseRequests.filter(x => x.status != "fulfilled")
                    if (failedPurchaseRequests.length > 0) {
                        logger.error("Error updating payment status, before submitting tx ", failedPurchaseRequests);
                        throw new Error("Error updating payment status, before submitting tx ");
                    }

                    const completeTx = await unsignedTx.build();
                    const signedTx = await wallet.signTx(completeTx);
                    //submit the transaction to the blockchain


                    await advancedRetry({
                        operation: async () => {
                            const txHash = await wallet.submitTx(signedTx);
                            //update purchase requests
                            const purchaseRequests = await Promise.allSettled(batchedRequests.map(async (request) => {
                                await prisma.purchaseRequest.update({
                                    where: { id: request.id }, data: {
                                        CurrentTransaction: {
                                            create: {
                                                txHash: txHash,
                                                status: TransactionStatus.Pending,
                                                BlocksWallet: {
                                                    connect: {
                                                        id: walletId
                                                    }
                                                }
                                            }
                                        },
                                        TransactionHistory: request.CurrentTransaction ? {
                                            connect: {
                                                id: request.CurrentTransaction.id
                                            }
                                        } : undefined
                                    }
                                })
                            }))
                            const failedPurchaseRequests = purchaseRequests.filter(x => x.status != "fulfilled")
                            if (failedPurchaseRequests.length > 0) {
                                throw new Error("Error updating payment status " + failedPurchaseRequests);
                            }
                        },
                        errorResolvers: [delayErrorResolver({
                            configuration: {
                                maxRetries: 3,
                                backoffMultiplier: 2,
                                initialDelayMs: 1000,
                                maxDelayMs: 10000
                            },
                        })],
                        throwOnUnrecoveredError: true
                    });

                } catch (error) {
                    logger.error("Error batching payments", error);
                }
            }))

        }))
    }
    catch (error) {
        logger.error("Error batching payments", error);
    }
    finally {
        //library is strange as we can release from any non-acquired semaphore
        updateMutex.release()
    }
}

export const cardanoPaymentBatcherService = { batchLatestPaymentEntriesV1 }
