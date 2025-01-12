import { $Enums } from "@prisma/client";
import { Sema } from "async-sema";
import { prisma } from '@/utils/db';
import { BlockfrostProvider } from "@meshsdk/core";
import { logger } from "@/utils/logger";
import { cardanoRefundHandlerService } from "../cardano-refund-handler/cardano-collection-refund.service";
import { cardanoSubmitResultHandlerService } from "../cardano-submit-result-handler/cardano-submit-result-handler.service";

const updateMutex = new Sema(1);

export async function updateWalletTransactionHash() {

    const acquiredMutex = await updateMutex.tryAcquire();
    //if we are already performing an update, we wait for it to finish and return
    if (!acquiredMutex)
        return await updateMutex.acquire();

    try {

        const lockedPurchaseWallets = await prisma.purchasingWallet.findMany({
            where: {
                pendingTransaction: {
                    hash: { not: null, },
                    //if the transaction has been checked in the last 30 seconds, we skip it
                    lastCheckedAt: { lte: new Date(Date.now() - 1000 * 30) }

                }
            },
            include: { pendingTransaction: true, networkHandler: true },

        });

        await Promise.allSettled(lockedPurchaseWallets.map(async (wallet) => {
            try {
                const txHash = wallet.pendingTransaction!.hash!;

                const blockfrostKey = wallet.networkHandler.blockfrostApiKey;
                const provider = new BlockfrostProvider(blockfrostKey);
                const txInfo = await provider.fetchTxInfo(txHash);
                if (txInfo) {
                    await prisma.purchasingWallet.update({
                        where: { id: wallet.id },
                        data: { pendingTransaction: { delete: true } }
                    });
                } else {
                    await prisma.transaction.update({
                        where: { id: wallet.pendingTransaction?.id },
                        data: { lastCheckedAt: new Date() }
                    });
                }
            } catch (error) {
                logger.error(`Error updating wallet transaction hash: ${error}`);
            }

        }));

        const timedOutLockedPurchaseWallets = await prisma.purchasingWallet.findMany({
            where: {
                pendingTransaction: {

                    updatedAt: {
                        //wallets that have not been updated in the last 20 minutes
                        lt: new Date(Date.now() - 1000 * 60 * 20)
                    }
                }
            },
            include: { pendingTransaction: true }
        })
        await Promise.allSettled(timedOutLockedPurchaseWallets.map(async (wallet) => {
            try {
                const txHash = wallet.pendingTransaction?.hash;
                if (txHash) {
                    await prisma.purchaseRequest.updateMany({
                        where: {
                            potentialTxHash: txHash
                        },
                        data: { errorRequiresManualReview: true, errorNote: "Transaction timeout", errorType: $Enums.PaymentRequestErrorType.UNKNOWN }
                    })
                }
                await prisma.purchasingWallet.update({
                    where: { id: wallet.id },
                    data: { pendingTransaction: { delete: true } }
                });
            } catch (error) {
                logger.error(`Error updating timed out wallet: ${error}`);
            }

        }));
        if (timedOutLockedPurchaseWallets.length > 0 || lockedPurchaseWallets.length > 0) {
            //TODO run all possible services that can profit from a wallet unlock
            try {
                await cardanoRefundHandlerService.collectRefundV1()
            } catch (error) {
                logger.error(`Error initiating refunds: ${error}`);
            }
            try {
                await cardanoSubmitResultHandlerService.submitResultV1()
            } catch (error) {
                logger.error(`Error initiating refunds: ${error}`);
            }
        }

        const lockedSellingWallets = await prisma.sellingWallet.findMany({
            where: {
                pendingTransaction: {
                    hash: { not: null },
                    lastCheckedAt: { lt: new Date(Date.now() - 1000 * 60 * 20) }
                }
            },
            include: { pendingTransaction: true, networkHandler: true }
        })
        await Promise.allSettled(lockedSellingWallets.map(async (wallet) => {
            try {
                const txHash = wallet.pendingTransaction!.hash!;
                const blockfrostKey = wallet.networkHandler.blockfrostApiKey;
                const provider = new BlockfrostProvider(blockfrostKey);
                const txInfo = await provider.fetchTxInfo(txHash);
                if (txInfo) {
                    await prisma.sellingWallet.update({
                        where: { id: wallet.id },
                        data: { pendingTransaction: { delete: true } }
                    });
                } else {
                    await prisma.transaction.update({
                        where: { id: wallet.pendingTransaction?.id },
                        data: { lastCheckedAt: new Date() }
                    });
                }
            } catch (error) {
                logger.error(`Error updating selling wallet: ${error}`);
            }
        }));

        const timedOutLockedSellingWallets = await prisma.sellingWallet.findMany({
            where: {
                pendingTransaction: {
                    updatedAt: { lt: new Date(Date.now() - 1000 * 60 * 20) }
                }
            },
            include: { pendingTransaction: true }
        })
        await Promise.allSettled(timedOutLockedSellingWallets.map(async (wallet) => {
            try {
                const txHash = wallet.pendingTransaction?.hash;
                if (txHash) {
                    await prisma.paymentRequest.updateMany({
                        where: { potentialTxHash: txHash }, data: {
                            errorRequiresManualReview: true, errorNote: "Transaction timeout", errorType: $Enums.PaymentRequestErrorType.UNKNOWN
                        }
                    })
                }
                await prisma.sellingWallet.update({
                    where: { id: wallet.id },
                    data: { pendingTransaction: { delete: true } }
                });
            } catch (error) {
                logger.error(`Error updating timed out selling wallet: ${error}`);
            }
        }));

        if (timedOutLockedSellingWallets.length > 0 || lockedSellingWallets.length > 0) {
            //TODO run all possible services that can profit from a wallet unlock
        }
    } finally {
        //library is strange as we can release from any non-acquired semaphore
        updateMutex.release()
    }
}

export const updateWalletTransactionHashHandlerService = { updateWalletTransactionHash }