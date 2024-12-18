import { prisma } from '@/utils/db';
import { encrypt } from '@/utils/encryption';
import { adminAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/admin-authenticated';
import { MeshWallet } from '@meshsdk/core';
import { resolvePaymentKeyHash } from '@meshsdk/core-cst';
import { $Enums } from '@prisma/client';
import { z } from 'zod';

export const paymentSourceSchemaInput = z.object({
    take: z.number({ coerce: true }).min(1).max(100),
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
        registryIdentifier: z.string().max(250).nullable(),
        scriptJSON: z.string(),
        registryJSON: z.string(),
        AdminWallets: z.array(z.object({
            id: z.string(),
            walletAddress: z.string().max(250),
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
        SellingWallet: z.object({
            id: z.string(),
            walletVkey: z.string().max(250),
            note: z.string().nullable(),
        }).nullable(),
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
                AdminWallets: true,
                CollectionWallet: true,
                PurchasingWallets: true,
                SellingWallet: true
            }
        })
        return { paymentSources: paymentSources }
    },
});

export const paymentSourceCreateSchemaInput = z.object({
    network: z.nativeEnum($Enums.Network),
    paymentType: z.nativeEnum($Enums.PaymentType),
    blockfrostApiKey: z.string().max(250),
    scriptJSON: z.string().max(100000),
    registryJSON: z.string().max(100000),
    addressToCheck: z.string().max(250),
    registryIdentifier: z.string().max(250),
    AdminWallets: z.array(z.object({
        walletAddress: z.string().max(250),
    })).max(20),
    CollectionWallet: z.object({
        walletAddress: z.string().max(250),
        note: z.string().max(250),
    }),
    PurchasingWallets: z.array(z.object({
        walletMnemonic: z.string().max(1500),
        note: z.string().max(250),
    })).min(1).max(50),
    SellingWallet: z.object({
        walletMnemonic: z.string().max(1500),
        note: z.string().max(250),
    }),
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
    registryIdentifier: z.string().max(250).nullable(),
    scriptJSON: z.string(),
    registryJSON: z.string(),
});

export const paymentSourceEndpointPost = adminAuthenticatedEndpointFactory.build({
    method: "post",
    input: paymentSourceCreateSchemaInput,
    output: paymentSourceCreateSchemaOutput,
    handler: async ({ input }) => {
        const sellingWalletMesh = {
            wallet: new MeshWallet({
                networkId: input.network === "PREVIEW" ? 0 : input.network === "PREPROD" ? 0 : 1,
                key: {
                    type: "mnemonic",
                    words: input.SellingWallet.walletMnemonic.split(" ")
                }
            }), note: input.SellingWallet.note,
            secret: encrypt(input.SellingWallet.walletMnemonic)
        };
        const purchasingWalletsMesh = input.PurchasingWallets.map(pw => {
            return {
                wallet: new MeshWallet({
                    networkId: input.network === "PREVIEW" ? 0 : input.network === "PREPROD" ? 0 : 1,
                    key: {
                        type: "mnemonic",
                        words: pw.walletMnemonic.split(" ")
                    }
                }), note: pw.note,
                secret: encrypt(pw.walletMnemonic)
            };
        });
        const result = await prisma.$transaction(async (prisma) => {
            const paymentSource = await prisma.networkHandler.create({
                data: {
                    network: input.network,
                    addressToCheck: input.addressToCheck,
                    paymentType: input.paymentType,
                    blockfrostApiKey: input.blockfrostApiKey,
                    scriptJSON: input.scriptJSON,
                    registryJSON: input.registryJSON,
                    registryIdentifier: input.registryIdentifier,
                    AdminWallets: {
                        createMany: {
                            data: input.AdminWallets.map((aw, index) => ({
                                walletAddress: aw.walletAddress,
                                order: index
                            }))
                        }
                    },
                    CollectionWallet: {
                        create: input.CollectionWallet
                    },
                    SellingWallet: {
                        create: {
                            walletVkey: resolvePaymentKeyHash((await sellingWalletMesh.wallet.getUnusedAddresses())[0]),
                            walletSecret: {
                                create: {
                                    secret: sellingWalletMesh.secret
                                }
                            },
                            note: sellingWalletMesh.note
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