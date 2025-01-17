import { $Enums } from "@prisma/client";
import { Sema } from "async-sema";
import { prisma } from '@/utils/db';
import { BlockfrostProvider, MeshWallet, SLOT_CONFIG_NETWORK, Transaction, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { decrypt } from "@/utils/encryption";
import { logger } from "@/utils/logger";
import * as cbor from "cbor";
import { getPaymentScriptFromNetworkHandlerV1 } from "@/utils/contractResolver";

const updateMutex = new Sema(1);

export async function collectTimeoutRefundsV1() {
    const acquiredMutex = await updateMutex.tryAcquire();
    //if we are already performing an update, we wait for it to finish and return
    if (!acquiredMutex)
        return await updateMutex.acquire();

    try {
        const networkChecksWithWalletLocked = await prisma.$transaction(async (prisma) => {
            const networkChecks = await prisma.networkHandler.findMany({
                where: {
                    paymentType: "WEB3_CARDANO_V1",
                }, include: {
                    PurchaseRequests: {
                        where: {
                            submitResultTime: {
                                lte: Date.now() + 1000 * 60 * 25 //add 25 minutes for block time
                            }, status: "PurchaseConfirmed", resultHash: null,
                            errorType: null,
                            smartContractWallet: { pendingTransaction: null }
                        },
                        include: { purchaserWallet: true, smartContractWallet: { include: { walletSecret: true } } }
                    },
                    AdminWallets: true,
                    FeeReceiverNetworkWallet: true,
                    CollectionWallet: true
                }
            })
            const purchaserWalletIds: string[] = []
            for (const networkCheck of networkChecks) {
                for (const purchaseRequest of networkCheck.PurchaseRequests) {
                    if (purchaseRequest.purchaserWallet?.id) {
                        purchaserWalletIds.push(purchaseRequest.purchaserWallet?.id)
                    } else {
                        logger.warn("No purchaser wallet found for purchase request", { purchaseRequest: purchaseRequest })
                    }
                }
            }
            for (const purchaserWalletId of purchaserWalletIds) {
                await prisma.purchasingWallet.update({
                    where: { id: purchaserWalletId },
                    data: { pendingTransaction: { create: { hash: null } } }
                })
            }
            return networkChecks;
        }, { isolationLevel: "Serializable" });

        await Promise.allSettled(networkChecksWithWalletLocked.map(async (networkCheck) => {

            if (networkCheck.PurchaseRequests.length == 0 || networkCheck.CollectionWallet == null)
                return;

            const network = networkCheck.network == "MAINNET" ? "mainnet" : networkCheck.network == "PREPROD" ? "preprod" : networkCheck.network == "PREVIEW" ? "preview" : null;
            if (!network)
                throw new Error("Invalid network")

            const networkId = networkCheck.network == "MAINNET" ? 0 : networkCheck.network == "PREPROD" ? 1 : networkCheck.network == "PREVIEW" ? 2 : null;
            if (!networkId)
                throw new Error("Invalid network")

            const blockchainProvider = new BlockfrostProvider(networkCheck.blockfrostApiKey, undefined);


            const purchaseRequests = networkCheck.PurchaseRequests;

            if (purchaseRequests.length == 0)
                return;
            //we can only allow one transaction per wallet
            const deDuplicatedRequests: ({ purchaserWallet: { id: string; createdAt: Date; updatedAt: Date; walletVkey: string; walletSecretId: string; pendingTransactionId: string | null; networkHandlerId: string; note: string | null; } | null; smartContractWallet: ({ walletSecret: { id: string; createdAt: Date; updatedAt: Date; secret: string; }; } & { id: string; createdAt: Date; updatedAt: Date; walletVkey: string; walletSecretId: string; pendingTransactionId: string | null; networkHandlerId: string; note: string | null; }) | null; } & { id: string; createdAt: Date; updatedAt: Date; lastCheckedAt: Date | null; status: $Enums.PurchasingRequestStatus; resultHash: string | null; errorType: $Enums.PurchaseRequestErrorType | null; networkHandlerId: string; sellerWalletId: string; purchasingWalletId: string | null; smartContractWalletId: string | null; identifier: string; submitResultTime: bigint; unlockTime: bigint; refundTime: bigint; utxo: string | null; txHash: string | null; potentialTxHash: string | null; errorRetries: number; errorNote: string | null; errorRequiresManualReview: boolean | null; triggeredById: string; })[] = []
            for (const request of purchaseRequests) {
                if (deDuplicatedRequests.some(r => r.smartContractWalletId == request.smartContractWalletId))
                    continue;

                deDuplicatedRequests.push(request);
            }

            await Promise.allSettled(deDuplicatedRequests.map(async (request) => {
                try {
                    const purchasingWallet = request.smartContractWallet;
                    if (purchasingWallet == null)
                        throw new Error("Purchasing wallet not found");
                    const encryptedSecret = purchasingWallet.walletSecret.secret;

                    const wallet = new MeshWallet({
                        networkId: 0,
                        fetcher: blockchainProvider,
                        submitter: blockchainProvider,
                        key: {
                            type: 'mnemonic',
                            words: decrypt(encryptedSecret).split(" "),
                        },
                    });

                    const address = (await wallet.getUsedAddresses())[0];

                    const { script, smartContractAddress } = await getPaymentScriptFromNetworkHandlerV1(networkCheck)

                    const utxos = await wallet.getUtxos();
                    if (utxos.length === 0) {
                        //this is if the seller wallet is empty
                        throw new Error('No UTXOs found in the wallet. Wallet is empty.');
                    }


                    const utxoByHash = await blockchainProvider.fetchUTxOs(
                        request.txHash!,
                    );

                    const utxo = utxoByHash.find((utxo) => utxo.input.txHash == request.txHash);

                    if (!utxo) {
                        throw new Error('UTXO not found');
                    }


                    const utxoDatum = utxo.output.plutusData;
                    if (!utxoDatum) {
                        throw new Error('No datum found in UTXO');
                    }

                    const decodedDatum = cbor.decode(Buffer.from(utxoDatum, 'hex'));
                    if (typeof decodedDatum.value[4] !== 'number') {
                        throw new Error('Invalid datum at position 4');
                    }
                    if (typeof decodedDatum.value[5] !== 'number') {
                        throw new Error('Invalid datum at position 5');
                    }

                    const redeemer = {
                        data: {
                            alternative: 3,
                            fields: [],
                        },
                    };
                    const invalidBefore =
                        unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK[network]) - 1;

                    const invalidAfter =
                        unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK[network]) + 1;

                    const unsignedTx = new Transaction({ initiator: wallet })
                        .redeemValue({
                            value: utxo,
                            script: script,
                            redeemer: redeemer,
                        }).setMetadata(674, {
                            msg: ["Masumi", "RefundCollectionAfterTimeout"],
                        })
                        .sendAssets(
                            {
                                address: address,
                            },
                            utxo.output.amount
                        )
                        .setChangeAddress(address)
                        .setRequiredSigners([address]);

                    unsignedTx.txBuilder.invalidBefore(invalidBefore);
                    unsignedTx.txBuilder.invalidHereafter(invalidAfter);

                    const buildTransaction = await unsignedTx.build();
                    const signedTx = await wallet.signTx(buildTransaction);

                    //submit the transaction to the blockchain
                    const txHash = await wallet.submitTx(signedTx);

                    await prisma.purchaseRequest.update({
                        where: { id: request.id }, data: { potentialTxHash: txHash, status: $Enums.PurchasingRequestStatus.RefundInitiated, smartContractWallet: { update: { pendingTransaction: { update: { hash: txHash } } } } }
                    })

                    logger.info(`Created withdrawal transaction:
                  Tx ID: ${txHash}
                  View (after a bit) on https://${network === 'preview'
                            ? 'preview.'
                            : network === 'preprod'
                                ? 'preprod.'
                                : ''
                        }cardanoscan.io/transaction/${txHash}
                  Smart Contract Address: ${smartContractAddress}
              `);
                } catch (error) {
                    logger.error(`Error creating refund transaction: ${error}`);
                    if (request.errorRetries == null || request.errorRetries < networkCheck.maxRefundRetries) {
                        await prisma.paymentRequest.update({
                            where: { id: request.id }, data: { errorRetries: { increment: 1 } }
                        })
                    } else {
                        const errorMessage = "Error creating refund transaction: " + (error instanceof Error ? error.message :
                            (typeof error === 'object' && error ? error.toString() : "Unknown Error"));
                        await prisma.paymentRequest.update({
                            where: { id: request.id },
                            data: {
                                errorType: "UNKNOWN",
                                errorRequiresManualReview: true,
                                errorNote: errorMessage
                            }
                        })
                    }
                }
            }))
        }))


    }
    finally {
        //library is strange as we can release from any non-acquired semaphore
        updateMutex.release()
    }
}

export const cardanoRefundHandlerService = { collectTimeoutRefundsV1 }
