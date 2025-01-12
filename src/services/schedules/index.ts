import cron from "node-cron";
import { checkLatestTransactions } from "@/services/cardano-tx-handler/cardano-tx-handler.service";
import { CONFIG } from "@/utils/config";
import { logger } from '@/utils/logger';
import { batchLatestPaymentEntriesV1 } from "@/services/cardano-payment-batcher/cardano-payment-batcher.service";
import { collectOutstandingPaymentsV1 } from "@/services/cardano-collection-handler/cardano-collection-handler.service";
import { collectRefundV1 } from "../cardano-refund-handler/cardano-collection-refund.service";
import { updateWalletTransactionHashHandlerService } from "../update-wallet-transaction-hash-handler/update-wallet-transaction-hash-handler.service";
import { collectTimeoutRefundsV1 } from "../cardano-collect-timeout-refund-handler/cardano-collect-timeout-refund-handler.service";

async function init() {
    logger.log({
        level: "info",
        message: "initialized cron events",
    });

    cron.schedule(CONFIG.CHECK_TX_INTERVAL, async () => {
        logger.info("updating cardano payment entries")
        const start = new Date()
        await checkLatestTransactions()
        logger.info("finished updating cardano payment entries in " + (new Date().getTime() - start.getTime()) / 1000 + "s")
    });
    //await batchLatestPaymentEntriesV1()
    cron.schedule(CONFIG.BATCH_PAYMENT_INTERVAL, async () => {
        logger.info("batching payments")
        const start = new Date()
        await batchLatestPaymentEntriesV1()
        logger.info("finished batching payments in " + (new Date().getTime() - start.getTime()) / 1000 + "s")
    })

    cron.schedule(CONFIG.CHECK_COLLECTION_INTERVAL, async () => {
        logger.info("checking for payments to collect")
        const start = new Date()
        await collectOutstandingPaymentsV1()
        logger.info("finished checking payments to collect in " + (new Date().getTime() - start.getTime()) / 1000 + "s")
    })
    cron.schedule(CONFIG.CHECK_COLLECT_REFUND_INTERVAL, async () => {
        logger.info("checking for payments to collect and refund")
        const start = new Date()
        await collectRefundV1()
        logger.info("finished checking payments to collect in " + (new Date().getTime() - start.getTime()) / 1000 + "s")
    })

    cron.schedule(CONFIG.CHECK_REFUND_INTERVAL, async () => {
        logger.info("checking for payments to refund")
        const start = new Date()
        await collectRefundV1()
        await collectTimeoutRefundsV1()
        logger.info("finished checking payments to refund in " + (new Date().getTime() - start.getTime()) / 1000 + "s")
    })

    cron.schedule(CONFIG.CHECK_WALLET_TRANSACTION_HASH_INTERVAL, async () => {
        logger.info("checking for wallet transaction hash")
        const start = new Date()
        await updateWalletTransactionHashHandlerService.updateWalletTransactionHash()
        logger.info("finished checking wallet transaction hash in " + (new Date().getTime() - start.getTime()) / 1000 + "s")
    })
}
export default init;
