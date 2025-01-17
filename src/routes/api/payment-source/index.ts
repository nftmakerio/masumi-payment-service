import { getPaymentScriptV1 } from '@/utils/contractResolver';
import { prisma } from '@/utils/db';
import { encrypt } from '@/utils/encryption';
import { adminAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/admin-authenticated';
import { MeshWallet } from '@meshsdk/core';
import { resolvePaymentKeyHash } from '@meshsdk/core-cst';
import { $Enums } from '@prisma/client';
import { z } from 'zod';

export const paymentSourceSchemaInput = z.object({
    take: z.number({ coerce: true }).min(1).max(100).default(10),
    cursorId: z.string().max(250).optional(),
});
export const paymentSourceSchemaOutput = z.object({
    paymentSources: z.array(z.object({
        id: z.string(),
        createdAt: z.date(),
        updatedAt: z.date(),
        network: z.nativeEnum($Enums.Network),
        addressToCheck: z.string().max(250),
        paymentType: z.nativeEnum($Enums.PaymentType),
        blockfrostApiKey: z.string().max(250),
        page: z.number(),
        isSyncing: z.boolean(),
        latestIdentifier: z.string().max(250).nullable(),
        AdminWallets: z.array(z.object({
            walletAddress: z.string().max(250),
            order: z.number(),
        })),
        CollectionWallet: z.object({
            id: z.string(),
            walletAddress: z.string().max(250),
            note: z.string().nullable(),
        }).nullable(),
        PurchasingWallets: z.array(z.object({
            id: z.string(),
            walletVkey: z.string().max(250),
            note: z.string().nullable(),
        })),
        SellingWallets: z.array(z.object({
            id: z.string(),
            walletVkey: z.string().max(250),
            note: z.string().nullable(),
        })),
        FeeReceiverNetworkWallet: z.object({
            walletAddress: z.string().max(250),
        }),
        FeePermille: z.number().min(0).max(1000),
    })),
});

export const paymentSourceEndpointGet = adminAuthenticatedEndpointFactory.build({
    method: "get",
    input: paymentSourceSchemaInput,
    output: paymentSourceSchemaOutput,
    handler: async ({ input }) => {
        const paymentSources = await prisma.networkHandler.findMany({
            take: input.take,
            orderBy: {
                createdAt: "desc"
            },
            cursor: input.cursorId ? { id: input.cursorId } : undefined,
            include: {
                AdminWallets: { orderBy: { order: "desc" } },
                CollectionWallet: true,
                PurchasingWallets: true,
                SellingWallets: true,
                FeeReceiverNetworkWallet: true,
            }
        })
        return { paymentSources: paymentSources }
    },
});

export const paymentSourceCreateSchemaInput = z.object({
    network: z.nativeEnum($Enums.Network),
    paymentType: z.nativeEnum($Enums.PaymentType),
    blockfrostApiKey: z.string().max(250),
    FeePermille: z.number().min(0).max(1000),
    AdminWallets: z.array(z.object({
        walletAddress: z.string().max(250),
    })).max(5),
    FeeReceiverNetworkWallet: z.object({
        walletAddress: z.string().max(250),
    }),
    CollectionWallet: z.object({
        walletAddress: z.string().max(250),
        note: z.string().max(250),
    }),
    PurchasingWallets: z.array(z.object({
        walletMnemonic: z.string().max(1500),
        note: z.string().max(250),
    })).min(1).max(50),
    SellingWallets: z.array(z.object({
        walletMnemonic: z.string().max(1500),
        note: z.string().max(250),
    })).min(1).max(50),
});
export const paymentSourceCreateSchemaOutput = z.object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    network: z.nativeEnum($Enums.Network),
    addressToCheck: z.string().max(250),
    paymentType: z.nativeEnum($Enums.PaymentType),
    blockfrostApiKey: z.string().max(250),
    page: z.number(),
    isSyncing: z.boolean(),
    latestIdentifier: z.string().max(250).nullable(),

});

export const paymentSourceEndpointPost = adminAuthenticatedEndpointFactory.build({
    method: "post",
    input: paymentSourceCreateSchemaInput,
    output: paymentSourceCreateSchemaOutput,
    handler: async ({ input }) => {
        const sellingWalletsMesh = input.SellingWallets.map(sellingWallet => {
            return {
                wallet: new MeshWallet({
                    networkId: input.network === "PREVIEW" ? 0 : input.network === "PREPROD" ? 0 : 1,
                    key: {
                        type: "mnemonic",
                        words: sellingWallet.walletMnemonic.split(" ")
                    }
                }),
                note: sellingWallet.note,
                secret: encrypt(sellingWallet.walletMnemonic)
            };
        });
        const purchasingWalletsMesh = input.PurchasingWallets.map(purchasingWallet => {
            return {
                wallet: new MeshWallet({
                    networkId: input.network === "PREVIEW" ? 0 : input.network === "PREPROD" ? 0 : 1,
                    key: {
                        type: "mnemonic",
                        words: purchasingWallet.walletMnemonic.split(" ")
                    }
                }), note: purchasingWallet.note,
                secret: encrypt(purchasingWallet.walletMnemonic)
            };
        });

        const result = await prisma.$transaction(async (prisma) => {
            const sellingWallets = await Promise.all(sellingWalletsMesh.map(async (sw) => {
                const walletVkey = resolvePaymentKeyHash((await sw.wallet.getUnusedAddresses())[0]);
                return {
                    walletVkey: walletVkey,
                    walletSecretId: (await prisma.walletSecret.create({ data: { secret: sw.secret } })).id,
                    note: sw.note
                };
            }));
            const { smartContractAddress } = await getPaymentScriptV1(input.AdminWallets[0].walletAddress, input.AdminWallets[1].walletAddress, input.AdminWallets[2].walletAddress, input.FeeReceiverNetworkWallet.walletAddress, input.FeePermille, input.network)


            const paymentSource = await prisma.networkHandler.create({
                data: {
                    network: input.network,
                    addressToCheck: smartContractAddress,
                    paymentType: input.paymentType,
                    blockfrostApiKey: input.blockfrostApiKey,

                    AdminWallets: {
                        createMany: {
                            data: input.AdminWallets.map((aw, index) => ({
                                walletAddress: aw.walletAddress,
                                order: index
                            }))
                        }
                    },
                    FeePermille: input.FeePermille,
                    FeeReceiverNetworkWallet: {
                        create: {
                            walletAddress: input.FeeReceiverNetworkWallet.walletAddress,
                            order: 0
                        }
                    },
                    CollectionWallet: {
                        create: input.CollectionWallet
                    },
                    SellingWallets: {
                        createMany: {
                            data: sellingWallets
                        }
                    },

                }
            });
            // First create the wallet secrets
            const walletSecrets = await Promise.all(
                purchasingWalletsMesh.map(pw =>
                    prisma.walletSecret.create({
                        data: { secret: pw.secret }
                    })
                )
            );

            // Then create purchasing wallets with the secret IDs
            const data = await Promise.all(purchasingWalletsMesh.map(async (pw, index) => ({
                walletVkey: resolvePaymentKeyHash((await pw.wallet.getUnusedAddresses())[0]),
                walletSecretId: walletSecrets[index].id,
                note: pw.note,
                networkHandlerId: paymentSource.id
            })));
            await prisma.purchasingWallet.createMany({
                data: data
            });

            return paymentSource
        })
        return result
    },
});

export const paymentSourceDeleteSchemaInput = z.object({
    id: z.string()
})
export const paymentSourceDeleteSchemaOutput = z.object({
    id: z.string()
})

export const paymentSourceEndpointDelete = adminAuthenticatedEndpointFactory.build({
    method: "delete",
    input: paymentSourceDeleteSchemaInput,
    output: paymentSourceDeleteSchemaOutput,
    handler: async ({ input }) => {
        return await prisma.networkHandler.delete({ where: { id: input.id } })
    },
});