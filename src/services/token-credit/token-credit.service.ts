import { creditTokenRepository } from "@/repositories/creditTokens";
import { InsufficientFundsError } from "@/utils/errors/insufficient-funds-error";
import { logger } from "@/utils/logger";
import { $Enums } from "@prisma/client";
import createHttpError from "http-errors";
async function handlePurchaseCreditInit(
    id: string,
    tokenCreditCost: { amount: bigint, unit: string }[],
    network: $Enums.Network,
    identifier: string,
    paymentType: $Enums.PaymentType,
    contractAddress: string,
    sellerVkey: string,
    refundTime: Date,
    unlockTime: Date
) {
    try {
        return await creditTokenRepository.handlePurchaseCreditInit(id, tokenCreditCost, network, identifier, paymentType, contractAddress, sellerVkey, refundTime, unlockTime)
    } catch (error) {
        if (error instanceof InsufficientFundsError) {
            throw createHttpError(400, "Insufficient funds")
        }
        logger.error(error)
        throw createHttpError(500, "Error handling payment credit initialization")
    }
}

export const tokenCreditService = { handlePurchaseCreditInit }