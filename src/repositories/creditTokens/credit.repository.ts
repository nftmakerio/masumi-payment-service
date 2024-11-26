import { prisma } from '@/utils/db';
import { InsufficientFundsError } from '@/utils/errors/insufficient-funds-error';
import { $Enums } from '@prisma/client';

async function handlePurchaseCreditInit(id: string, cost: { amount: bigint, unit: string }[], network: $Enums.Network, identifier: string, paymentType: $Enums.PaymentType, sellerVkey: string, refundTime: Date, unlockTime: Date) {
    return await prisma.$transaction(async (transaction) => {
        const result = await transaction.apiKey.findUnique({ where: { id: id }, include: { remainingUsageCredits: true } })
        if (!result) {
            throw Error("Invalid id: " + id)
        }


        const remainingAccumulatedUsageCredits: Map<string, bigint> = new Map<string, bigint>();

        // Sum up all purchase amounts
        result.remainingUsageCredits.forEach(request => {
            if (!remainingAccumulatedUsageCredits.has(request.unit)) {
                remainingAccumulatedUsageCredits.set(request.unit, 0n);
            }
            remainingAccumulatedUsageCredits.set(request.unit, remainingAccumulatedUsageCredits.get(request.unit)! + request.amount);
        });

        const totalCost: Map<string, bigint> = new Map<string, bigint>();
        cost.forEach(amount => {
            if (!totalCost.has(amount.unit)) {
                totalCost.set(amount.unit, 0n);
            }
            totalCost.set(amount.unit, totalCost.get(amount.unit)! + amount.amount);
        });
        const newRemainingUsageCredits: Map<string, bigint> = remainingAccumulatedUsageCredits;

        if (result.usageLimited) {
            for (const [unit, amount] of totalCost) {
                if (!newRemainingUsageCredits.has(unit)) {
                    throw new InsufficientFundsError("Credit unit not found: " + unit + " for id: " + id)
                }
                newRemainingUsageCredits.set(unit, newRemainingUsageCredits.get(unit)! - amount);
                if (newRemainingUsageCredits.get(unit)! < 0) {
                    throw new InsufficientFundsError("Not enough " + unit + " tokens to handleCreditUsage for id: " + id)
                }
            }
        }

        // Create new usage amount records with unique IDs
        const updatedUsageAmounts = Array.from(newRemainingUsageCredits.entries()).map(([unit, amount]) => ({
            id: `${id}-${unit}`, // Create a unique ID
            amount: amount,
            unit: unit
        }));
        if (result.usageLimited) {
            await transaction.apiKey.update({
                where: { id: id },
                data: {
                    remainingUsageCredits: {
                        set: updatedUsageAmounts
                    },
                }
            })
        }

        const networkHandler = await transaction.networkHandler.findUnique({ where: { network_addressToCheck: { network: network, addressToCheck: sellerVkey } } })
        if (!networkHandler) {
            throw Error("Invalid networkHandler: " + networkHandler)
        }

        const purchaseRequest = await prisma.purchaseRequest.create({
            data: {
                triggeredBy: { connect: { id: id } },
                amounts: {
                    create: Array.from(totalCost.entries()).map(([unit, amount]) => ({
                        amount: amount,
                        unit: unit
                    }))
                },
                networkHandler: { connect: { id: networkHandler!.id } },
                sellerWallet: {
                    connectOrCreate: {
                        where: { networkHandlerId_walletVkey: { networkHandlerId: networkHandler.id, walletVkey: sellerVkey } },
                        create: { walletVkey: sellerVkey, networkHandlerId: networkHandler.id }
                    }
                },
                identifier: identifier,
                status: $Enums.PurchasingRequestStatus.PurchaseInitiated,
                refundTime: refundTime.getTime(),
                unlockTime: unlockTime.getTime()
            },
        })

        return purchaseRequest
    }, { isolationLevel: "ReadCommitted" });

}

export const creditTokenRepository = { handlePurchaseCreditInit }