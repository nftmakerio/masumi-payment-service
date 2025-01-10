import { adminAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/admin-authenticated';
import { z } from 'zod';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';
import { decrypt } from '@/utils/encryption';



export const getWalletSchemaInput = z.object({
    walletType: z.enum(["Selling", "Purchasing"]),
    id: z.string().min(1).max(250),
    includeSecret: z.boolean().default(false),
})


export const getWalletSchemaOutput = z.object({
    walletSecret: z.object({
        createdAt: z.date(),
        updatedAt: z.date(),
        secret: z.string(),
    }).optional(),
    pendingTransaction: z.object({
        createdAt: z.date(),
        updatedAt: z.date(),
        hash: z.string().nullable(),
        lastCheckedAt: z.date().nullable(),
    }).nullable(),
    note: z.string().nullable(),
    walletVkey: z.string(),

});

export const queryWalletEndpointGet = adminAuthenticatedEndpointFactory.build({
    method: "get",
    input: getWalletSchemaInput,
    output: getWalletSchemaOutput,
    handler: async ({ input }) => {
        if (input.walletType == "Selling") {
            const result = await prisma.sellingWallet.findFirst({ where: { id: input.id }, include: { walletSecret: input.includeSecret, pendingTransaction: true } })
            if (result == null) {
                throw createHttpError(404, "Selling wallet not found")
            }
            if (input.includeSecret) {
                const decodedSecret = decrypt(result.walletSecret.secret)
                return {
                    ...result,
                    walletSecret: {
                        ...result.walletSecret,
                        secret: decodedSecret
                    }
                }
            }
            return result
        } else if (input.walletType == "Purchasing") {
            const result = await prisma.purchasingWallet.findFirst({ where: { id: input.id }, include: { walletSecret: input.includeSecret, pendingTransaction: true } })
            if (result == null) {
                throw createHttpError(404, "Purchasing wallet not found")
            }
            if (input.includeSecret) {
                const decodedSecret = decrypt(result.walletSecret.secret)
                return {
                    ...result,
                    walletSecret: {
                        ...result.walletSecret,
                        secret: decodedSecret
                    }
                }
            }
            return result

        }
        throw createHttpError(400, "Invalid wallet type")

    },
});