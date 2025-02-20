import { prisma } from '@/utils/db';
import { readAuthenticatedEndpointFactory } from '@/utils/security/auth/read-authenticated';
import { HotWalletType, Network, PaymentType, Permission, } from '@prisma/client';
import { z } from 'zod';

export const paymentSourceSchemaInput = z.object({
    take: z.number({ coerce: true }).min(1).max(100).default(10).describe("The number of payment sources to return"),
    cursorId: z.string().max(250).optional().describe("Used to paginate through the payment sources"),
});
export const paymentSourceSchemaOutput = z.object({
    paymentSources: z.array(z.object({
        id: z.string(),
        createdAt: z.date(),
        updatedAt: z.date(),
        network: z.nativeEnum(Network),
        smartContractAddress: z.string(),
        paymentType: z.nativeEnum(PaymentType),
        lastIdentifierChecked: z.string().nullable(),
        lastCheckedAt: z.date().nullable(),
        AdminWallets: z.array(z.object({
            walletAddress: z.string(),
            order: z.number(),
        })),
        PurchasingWallets: z.array(z.object({
            id: z.string(),
            walletVkey: z.string(),
            walletAddress: z.string(),
            collectionAddress: z.string().nullable(),
            note: z.string().nullable(),
        })),
        SellingWallets: z.array(z.object({
            id: z.string(),
            walletVkey: z.string(),
            walletAddress: z.string(),
            collectionAddress: z.string().nullable(),
            note: z.string().nullable(),
        })),
        FeeReceiverNetworkWallet: z.object({
            walletAddress: z.string(),
        }),
        feeRatePermille: z.number().min(0).max(1000),
    })),
});

export const paymentSourceEndpointGet = readAuthenticatedEndpointFactory.build({
    method: "get",
    input: paymentSourceSchemaInput,
    output: paymentSourceSchemaOutput,
    handler: async ({ input, options }) => {
        const paymentSources = await prisma.paymentSource.findMany({
            take: input.take,
            orderBy: {
                createdAt: "desc"
            },
            cursor: input.cursorId ? { id: input.cursorId } : undefined,
            where: {
                network: options.permission != Permission.Admin ? { in: options.networkLimit } : undefined
            },
            include: {
                AdminWallets: { orderBy: { order: "asc" } },
                HotWallets: true,
                FeeReceiverNetworkWallet: true,
            }
        })
        const mappedPaymentSources = paymentSources.map(paymentSource => {
            return { ...paymentSource, SellingWallets: paymentSource.HotWallets.filter(wallet => wallet.type == HotWalletType.Selling), PurchasingWallets: paymentSource.HotWallets.filter(wallet => wallet.type == HotWalletType.Purchasing) }
        })
        return { paymentSources: mappedPaymentSources }
    },
});
