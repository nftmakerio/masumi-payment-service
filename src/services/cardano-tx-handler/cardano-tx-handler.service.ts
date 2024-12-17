import { $Enums, Prisma } from "@prisma/client";
import { Sema } from "async-sema";
import { prisma } from '@/utils/db';
import { logger } from "@/utils/logger";
import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import { mBool } from "@meshsdk/core";
import { PlutusDatumSchema, Transaction } from "@emurgo/cardano-serialization-lib-nodejs";
import { Data } from 'lucid-cardano';



const updateMutex = new Sema(1);
export async function checkLatestPaymentEntries() {


    const acquiredMutex = await updateMutex.tryAcquire();
    //if we are already performing an update, we wait for it to finish and return
    if (!acquiredMutex)
        return await updateMutex.acquire();

    try {
        //only support web3 cardano v1 for now
        const networkChecks = await prisma.$transaction(async (prisma) => {
            const networkChecks = await prisma.networkHandler.findMany({
                where: {
                    paymentType: $Enums.PaymentType.WEB3_CARDANO_V1,
                    //isSyncing: false
                },
                include: {
                    SellingWallet: true,
                    CollectionWallet: true
                }
            })

            if (networkChecks.length == 0)
                return null;

            await prisma.networkHandler.updateMany({
                where: { id: { in: networkChecks.map(x => x.id) } },
                data: { isSyncing: true }
            })
            return networkChecks.map((x) => { return { ...x, isSyncing: true } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000, maxWait: 10000 })
        if (networkChecks == null)
            return;
        try {
            await Promise.all(networkChecks.map(async (networkCheck) => {
                let latestPage = networkCheck.page;
                let latestIdentifier = networkCheck.latestIdentifier;
                const blockfrost = new BlockFrostAPI({
                    projectId: networkCheck.blockfrostApiKey,
                    network: networkCheck.network == $Enums.Network.MAINNET ? "mainnet" : networkCheck.network == $Enums.Network.PREVIEW ? "preview" : "preprod"
                });

                let latestTx = await blockfrost.addressesTransactions(networkCheck.addressToCheck, { count: 25, page: networkCheck.page })

                while (latestTx.length > 0) {
                    try {
                        const foundTxIndex = latestTx.findIndex(tx => tx.tx_hash == latestIdentifier)
                        if (foundTxIndex == latestTx.length - 1)
                            break;
                        if (foundTxIndex != -1)
                            latestTx = latestTx.slice(foundTxIndex)

                        const txData = await Promise.all(latestTx.map(async (tx) => {
                            try {
                                const cbor = await blockfrost.txsCbor(tx.tx_hash)
                                const utxos = await blockfrost.txsUtxos(tx.tx_hash)
                                const transaction = Transaction.from_bytes(Buffer.from(cbor.cbor, "hex"))
                                return { tx: tx, utxos: utxos, transaction: transaction }
                            } catch (error) {
                                //Todo handle error transactions
                                logger.error("error getting tx metadata", { error: error, tx: tx })
                                return null;
                            }
                        }))

                        const filteredTxData = txData.filter(x => x != null)

                        for (const tx of filteredTxData) {

                            const utxos = tx.utxos
                            const inputs = utxos.inputs;
                            const outputs = utxos.outputs;

                            const valueInputs = inputs.filter((x) => { return x.address == networkCheck.addressToCheck })
                            const valueOutputs = outputs.filter((x) => { return x.address == networkCheck.addressToCheck })

                            const redeemers = tx.transaction.witness_set().redeemers();

                            if (redeemers == null) {
                                //payment transaction
                                if (valueInputs.length != 0) {
                                    //invalid transaction
                                    continue;
                                }

                                for (const output of valueOutputs) {
                                    const outputDatum = output.inline_datum
                                    if (outputDatum == null) {
                                        //invalid transaction
                                        continue;
                                    }
                                    const decodedOutputDatum: unknown = Data.from(outputDatum);
                                    const decodedNewContract = decodeV1ContractDatum(decodedOutputDatum)
                                    if (decodedNewContract == null) {
                                        //invalid transaction
                                        continue;
                                    }
                                    await prisma.$transaction(async (prisma) => {

                                        const databaseEntry = await prisma.purchaseRequest.findMany({
                                            where: {
                                                identifier: decodedNewContract.referenceId,
                                                networkHandlerId: networkCheck.id,
                                                status: $Enums.PurchasingRequestStatus.PurchaseInitiated,
                                            },

                                        })
                                        if (databaseEntry.length == 0) {
                                            //transaction is not registered with us or duplicated (therefore invalid)
                                            return;
                                        }
                                        if (databaseEntry.length > 1) {
                                            //this should not be possible as uniqueness constraints are present on the database
                                            for (const entry of databaseEntry) {
                                                await prisma.purchaseRequest.update({
                                                    where: { id: entry.id },
                                                    data: { status: $Enums.PurchasingRequestStatus.Error, errorNote: "Duplicate purchase transaction", errorType: $Enums.PaymentRequestErrorType.UNKNOWN }
                                                })
                                            }
                                            return;
                                        }
                                        await prisma.purchaseRequest.update({
                                            where: { id: databaseEntry[0].id },
                                            data: { status: $Enums.PurchasingRequestStatus.PurchaseConfirmed, txHash: tx.tx.tx_hash, utxo: tx.utxos.hash, potentialTxHash: null }
                                        })

                                    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000, maxWait: 10000 })
                                    await prisma.$transaction(async (prisma) => {

                                        const databaseEntry = await prisma.paymentRequest.findMany({
                                            where: {
                                                identifier: decodedNewContract.referenceId,
                                                checkedById: networkCheck.id,
                                                status: $Enums.PaymentRequestStatus.PaymentRequested,

                                            },
                                            include: {
                                                amounts: true
                                            }
                                        })
                                        if (databaseEntry.length == 0) {
                                            //transaction is not registered with us or duplicated (therefore invalid)
                                            return;
                                        }

                                        if (databaseEntry.length > 1) {
                                            //this should not be possible as uniqueness constraints are present on the database
                                            for (const entry of databaseEntry) {

                                                await prisma.paymentRequest.update({
                                                    where: { id: entry.id },
                                                    data: {
                                                        status: $Enums.PaymentRequestStatus.Error,
                                                        errorNote: "Duplicate payment transaction",
                                                        errorType: $Enums.PaymentRequestErrorType.UNKNOWN
                                                    }
                                                })
                                            }
                                            return;
                                        }

                                        const valueMatches = databaseEntry[0].amounts.every((x) => {
                                            const existingAmount = output.amount.find((y) => y.unit == x.unit)
                                            if (existingAmount == null)
                                                return false;
                                            //convert to string to avoid large number issues
                                            return x.amount.toString() == existingAmount.quantity
                                        })

                                        let newStatus: $Enums.PaymentRequestStatus = $Enums.PaymentRequestStatus.PaymentInvalid;
                                        if (valueMatches == true) {
                                            newStatus = $Enums.PaymentRequestStatus.PaymentConfirmed
                                        }

                                        await prisma.paymentRequest.update({
                                            where: { id: databaseEntry[0].id },
                                            data: {
                                                status: newStatus,
                                                txHash: tx.tx.tx_hash,
                                                utxo: tx.utxos.hash,
                                                potentialTxHash: null,
                                                buyerWallet: {
                                                    connectOrCreate: {
                                                        where: { networkHandlerId_walletVkey: { networkHandlerId: networkCheck.id, walletVkey: decodedNewContract.buyer } },
                                                        create: { walletVkey: decodedNewContract.buyer, networkHandler: { connect: { id: networkCheck.id } } }
                                                    }
                                                }
                                            }
                                        })
                                    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 100000, maxWait: 10000 }
                                    )

                                }
                                await prisma.networkHandler.update({
                                    where: { id: networkCheck.id },
                                    data: { latestIdentifier: tx.tx.tx_hash, page: latestPage }
                                })
                                latestIdentifier = tx.tx.tx_hash;
                            } else {

                                if (redeemers.len() != 1) {
                                    //invalid transaction
                                    continue;
                                }

                                const redeemer = redeemers.get(0)
                                /*
                                    Withdraw
                                    RequestRefund
                                    CancelRefundRequest
                                    WithdrawRefund
                                    DenyRefund
                                    WithdrawDisputed
                                    WithdrawFee
                                */

                                const redeemerVersion = JSON.parse(redeemer.data().to_json(PlutusDatumSchema.BasicConversions))[
                                    "constructor"
                                ]

                                let newStatus: $Enums.PaymentRequestStatus;
                                let newPurchasingStatus: $Enums.PurchasingRequestStatus;

                                if (redeemerVersion == 0) {
                                    //Withdraw
                                    newStatus = $Enums.PaymentRequestStatus.WithdrawConfirmed
                                    newPurchasingStatus = $Enums.PurchasingRequestStatus.Withdrawn
                                }
                                else if (redeemerVersion == 1) {
                                    //RequestRefund
                                    newStatus = $Enums.PaymentRequestStatus.RefundRequested
                                    newPurchasingStatus = $Enums.PurchasingRequestStatus.RefundRequestConfirmed
                                }
                                else if (redeemerVersion == 2) {
                                    //CancelRefundRequest
                                    newStatus = $Enums.PaymentRequestStatus.RefundRequestCanceled
                                    newPurchasingStatus = $Enums.PurchasingRequestStatus.RefundRequestCanceledConfirmed
                                }
                                else if (redeemerVersion == 3) {
                                    //WithdrawRefund
                                    newStatus = $Enums.PaymentRequestStatus.Refunded
                                    newPurchasingStatus = $Enums.PurchasingRequestStatus.RefundConfirmed
                                }
                                else if (redeemerVersion == 4) {
                                    //DenyRefund
                                    newStatus = $Enums.PaymentRequestStatus.RefundDeniedConfirmed
                                    newPurchasingStatus = $Enums.PurchasingRequestStatus.RefundDenied
                                }
                                else if (redeemerVersion == 5) {
                                    //WithdrawDisputed
                                    newStatus = $Enums.PaymentRequestStatus.DisputedWithdrawn
                                    newPurchasingStatus = $Enums.PurchasingRequestStatus.DisputedWithdrawn
                                }
                                else if (redeemerVersion == 6) {
                                    //WithdrawFee
                                    newStatus = $Enums.PaymentRequestStatus.FeesWithdrawn
                                    newPurchasingStatus = $Enums.PurchasingRequestStatus.FeesWithdrawn
                                }
                                else {
                                    //invalid transaction  
                                    //TODO handle unknown redeemer 
                                    continue;
                                }

                                const inputDatum = inputs[0].inline_datum
                                if (inputDatum == null) {
                                    //invalid transaction
                                    continue;
                                }

                                const decodedInputDatum: unknown = Data.from(inputDatum);
                                const decodedOldContract = decodeV1ContractDatum(decodedInputDatum)
                                if (decodedOldContract == null) {
                                    //invalid transaction
                                    continue;
                                }
                                await Promise.all([
                                    handlePaymentTransactionCardanoV1(tx.tx.tx_hash, tx.utxos.hash, newStatus, networkCheck.id, decodedOldContract.seller, decodedOldContract.referenceId),
                                    handlePurchasingTransactionCardanoV1(tx.tx.tx_hash, tx.utxos.hash, newPurchasingStatus, networkCheck.id, decodedOldContract.seller, decodedOldContract.referenceId)
                                ])

                            }
                            const lastTx = filteredTxData[filteredTxData.length - 1];
                            await prisma.networkHandler.update({
                                where: { id: networkCheck.id },
                                data: { latestIdentifier: lastTx.tx.tx_hash, page: latestPage }
                            })
                            latestIdentifier = lastTx.tx.tx_hash;
                        }

                    }
                    catch (error) {
                        logger.error("error updating database", { error: error, networkCheck: networkCheck.id })
                        return null;
                    } finally {
                        if (latestTx.length >= 25) {

                            latestPage++;
                            latestTx = await blockfrost.addressesTransactions(networkCheck.addressToCheck, { count: 25, page: latestPage })

                        } else {
                            latestTx = []
                        }
                    }
                }

            }))

        }
        finally {
            try {


                await prisma.networkHandler.updateMany({
                    where: { id: { in: networkChecks.map(x => x.id) } },
                    data: { isSyncing: false }
                })
            } catch (error) {
                logger.error("error updating network checks", { error: error, networkChecks: networkChecks })
                //TODO very bad, maybe add a retry mechanism?
            }
        }
    }
    finally {
        //library is strange as we can release from any non-acquired semaphore
        updateMutex.release()
    }
}

async function handlePaymentTransactionCardanoV1(tx_hash: string, utxo_hash: string, newStatus: $Enums.PaymentRequestStatus, networkCheckId: string, sellerVkey: string, referenceId: string) {
    await prisma.$transaction(async (prisma) => {
        //we dont need to do sanity checks as the tx hash is unique
        const paymentRequest = await prisma.paymentRequest.findUnique({
            where: { checkedById_identifier: { checkedById: networkCheckId, identifier: referenceId } },
        })

        if (paymentRequest == null) {
            //transaction is not registered with us or a payment transaction
            return;
        }


        await prisma.paymentRequest.update({
            where: { id: paymentRequest.id },
            data: { status: newStatus, txHash: tx_hash, utxo: utxo_hash, potentialTxHash: null }
        })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000, maxWait: 10000 })
}

async function handlePurchasingTransactionCardanoV1(tx_hash: string, utxo_hash: string, newStatus: $Enums.PurchasingRequestStatus, networkCheckId: string, sellerVkey: string, referenceId: string) {
    await prisma.$transaction(async (prisma) => {
        //we dont need to do sanity checks as the tx hash is unique
        const purchasingRequest = await prisma.paymentRequest.findUnique({
            where: { checkedById_identifier: { checkedById: networkCheckId, identifier: referenceId } },
        })

        if (purchasingRequest == null) {
            //transaction is not registered with us as a purchasing transaction
            return;
        }

        await prisma.purchaseRequest.update({
            where: { id: purchasingRequest.id },
            data: { status: newStatus, txHash: tx_hash, utxo: utxo_hash, potentialTxHash: null }
        })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000, maxWait: 10000 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeV1ContractDatum(decodedDatum: any) {
    /*
        buyer: VerificationKeyHash,
        seller: VerificationKeyHash,
        referenceId: ByteArray,
        resultHash: ByteArray,
        unlock_time: POSIXTime,
        refund_time: POSIXTime,
        refund_requested: Bool,
        refund_denied: Bool,
    */
    if (decodedDatum == null) {
        //invalid transaction
        return null;
    }

    if (decodedDatum.fields?.length != 8) {
        //invalid transaction
        return null;
    }
    if (typeof decodedDatum.fields[0] !== "string") {
        //invalid transaction
        return null;
    }
    const buyer = decodedDatum.fields[0]
    if (typeof decodedDatum.fields[1] !== "string") {
        //invalid transaction
        return null;
    }
    const seller = decodedDatum.fields[1]
    if (typeof decodedDatum.fields[2] !== "string") {
        //invalid transaction
        return null;
    }
    const referenceId = Buffer.from(decodedDatum.fields[2], "hex").toString("utf-8")
    if (typeof decodedDatum.fields[3] !== "string") {
        //invalid transaction
        return null;
    }
    const resultHash = Buffer.from(decodedDatum.fields[3], "hex").toString("utf-8")

    if (typeof decodedDatum.fields[4] !== "number" && typeof decodedDatum.fields[4] !== "bigint") {
        //invalid transaction
        return null;
    }
    if (typeof decodedDatum.fields[5] !== "number" && typeof decodedDatum.fields[5] !== "bigint") {
        //invalid transaction
        return null;
    }
    const unlockTime = decodedDatum.fields[4]
    const refundTime = decodedDatum.fields[5]


    const refundRequested = mBoolToBool(decodedDatum.fields[6])

    const refundDenied = mBoolToBool(decodedDatum.fields[7])

    if (refundRequested == null || refundDenied == null) {
        //invalid transaction
        return null;
    }

    return { buyer, seller, referenceId, resultHash, unlockTime, refundTime, refundRequested, refundDenied }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mBoolToBool(value: any) {

    if (value == null) {
        return null;
    }
    if (typeof value !== "object") {
        return null;
    }
    const bFalse = mBool(false)
    const bTrue = mBool(true)

    if (value.index == bTrue.alternative && typeof value.fields == typeof bTrue.fields) {
        return true;
    }
    if (value.index == bFalse.alternative && typeof value.fields == typeof bFalse.fields) {
        return false;
    }
    return null;
}

export const cardanoTxHandlerService = { checkLatestPaymentEntries }