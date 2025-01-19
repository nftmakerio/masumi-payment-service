import { getPaymentScriptV1 } from '@/utils/contractResolver';
import { prisma } from '@/utils/db';
import { encrypt } from '@/utils/encryption';
import { adminAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/admin-authenticated';
import { MeshWallet } from '@meshsdk/core';
import { resolvePaymentKeyHash } from '@meshsdk/core-cst';
import { $Enums } from '@prisma/client';
import createHttpError from 'http-errors';
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
        network: z.nativeEnum($Enums.Network),
        addressToCheck: z.string(),
        paymentType: z.nativeEnum($Enums.PaymentType),
        blockfrostApiKey: z.string(),
        page: z.number(),
        isSyncing: z.boolean(),
        latestIdentifier: z.string().nullable(),
        AdminWallets: z.array(z.object({
            walletAddress: z.string(),
            order: z.number(),
        })),
        CollectionWallet: z.object({
            id: z.string(),
            walletAddress: z.string(),
            note: z.string().nullable(),
        }).nullable(),
        PurchasingWallets: z.array(z.object({
            id: z.string(),
            walletVkey: z.string(),
            note: z.string().nullable(),
        })),
        SellingWallets: z.array(z.object({
            id: z.string(),
            walletVkey: z.string(),
            note: z.string().nullable(),
        })),
        FeeReceiverNetworkWallet: z.object({
            walletAddress: z.string(),
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
                AdminWallets: { orderBy: { order: "asc" } },
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
    network: z.nativeEnum($Enums.Network).describe("The network the payment source will be used on"),
    paymentType: z.nativeEnum($Enums.PaymentType).describe("The type of payment contract used"),
    blockfrostApiKey: z.string().max(250).describe("The blockfrost api key to be used for the payment source"),
    FeePermille: z.number({ coerce: true }).min(0).max(1000).describe("The fee in permille to be used for the payment source. The default contract uses 50 (5%)"),
    AdminWallets: z.array(z.object({
        walletAddress: z.string().max(250),
    })).min(3).max(3).describe("The wallet addresses of the admin wallets (exactly 3)"),
    FeeReceiverNetworkWallet: z.object({
        walletAddress: z.string().max(250),
    }).describe("The wallet address of the network fee receiver wallet"),
    CollectionWallet: z.object({
        walletAddress: z.string().max(250),
        note: z.string().max(250),
    }).describe("The wallet address and note of the collection wallet (ideally a hardware wallet). Please backup the mnemonic of the wallet."),
    PurchasingWallets: z.array(z.object({
        walletMnemonic: z.string().max(1500),
        note: z.string().max(250),
    })).min(1).max(50).describe("The mnemonic of the purchasing wallets to be added. Please backup the mnemonic of the wallets."),
    SellingWallets: z.array(z.object({
        walletMnemonic: z.string().max(1500),
        note: z.string().max(250),
    })).min(1).max(50).describe("The mnemonic of the selling wallets to be added. Please backup the mnemonic of the wallets."),
});
export const paymentSourceCreateSchemaOutput = z.object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    network: z.nativeEnum($Enums.Network),
    addressToCheck: z.string(),
    paymentType: z.nativeEnum($Enums.PaymentType),
    blockfrostApiKey: z.string(),
    page: z.number(),
    isSyncing: z.boolean(),
    latestIdentifier: z.string().nullable(),

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

export const paymentSourceUpdateSchemaInput = z.object({
    id: z.string().max(250).describe("The id of the payment source to be updated"),
    blockfrostApiKey: z.string().max(250).optional().describe("The blockfrost api key to be used for the payment source"),
    CollectionWallet: z.object({
        walletAddress: z.string().max(250),
        note: z.string().max(250),
    }).optional().describe("The wallet address and note of the collection wallet (ideally a hardware wallet). Usually should not be changed. Please backup the mnemonic of the old wallet before changing it."),
    AddPurchasingWallets: z.array(z.object({
        walletMnemonic: z.string().max(1500),
        note: z.string().max(250),
    })).min(1).max(10).optional().describe("The mnemonic of the purchasing wallets to be added"),
    AddSellingWallets: z.array(z.object({
        walletMnemonic: z.string().max(1500),
        note: z.string().max(250),
    })).min(1).max(10).optional().describe("The mnemonic of the selling wallets to be added"),
    RemovePurchasingWallets: z.array(z.object({
        id: z.string()
    })).max(10).optional().describe("The ids of the purchasing wallets to be removed. Please backup the mnemonic of the old wallet before removing it."),
    RemoveSellingWallets: z.array(z.object({
        id: z.string()
    })).max(10).optional().describe("The ids of the selling wallets to be removed. Please backup the mnemonic of the old wallet before removing it."),
    page: z.number({ coerce: true }).min(1).max(100000000).optional().describe("The page number of the payment source. Usually should not be changed"),
    latestIdentifier: z.string().max(250).nullable().optional().describe("The latest identifier of the payment source. Usually should not be changed")
});
export const paymentSourceUpdateSchemaOutput = z.object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    network: z.nativeEnum($Enums.Network),
    addressToCheck: z.string(),
    paymentType: z.nativeEnum($Enums.PaymentType),
    blockfrostApiKey: z.string(),
    page: z.number(),
    isSyncing: z.boolean(),
    latestIdentifier: z.string().nullable(),
});

export const paymentSourceEndpointPatch = adminAuthenticatedEndpointFactory.build({
    method: "patch",
    input: paymentSourceUpdateSchemaInput,
    output: paymentSourceUpdateSchemaOutput,
    handler: async ({ input }) => {
        const networkHandler = await prisma.networkHandler.findUnique({ where: { id: input.id }, include: { PurchasingWallets: true, SellingWallets: true } })
        if (networkHandler == null) {
            throw createHttpError(404, "Payment source not found")
        }
        const sellingWalletsMesh = input.AddSellingWallets?.map(sellingWallet => {
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
        const purchasingWalletsMesh = input.AddPurchasingWallets?.map(purchasingWallet => {
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

            const sellingWallets = sellingWalletsMesh != null ? await Promise.all(sellingWalletsMesh.map(async (sw) => {
                const walletVkey = resolvePaymentKeyHash((await sw.wallet.getUnusedAddresses())[0]);
                return {
                    walletVkey: walletVkey,
                    walletSecretId: (await prisma.walletSecret.create({ data: { secret: sw.secret } })).id,
                    note: sw.note
                };
            })) : [];

            const purchasingWallets = purchasingWalletsMesh != null ? await Promise.all(purchasingWalletsMesh.map(async (pw) => {
                return {
                    walletVkey: resolvePaymentKeyHash((await pw.wallet.getUnusedAddresses())[0]),
                    walletSecretId: (await prisma.walletSecret.create({ data: { secret: pw.secret } })).id,
                    note: pw.note
                };
            })) : [];
            if (input.RemoveSellingWallets != null && input.RemoveSellingWallets.length > 0 || input.RemovePurchasingWallets != null && input.RemovePurchasingWallets.length > 0) {
                await prisma.networkHandler.update({
                    where: { id: input.id }, data: {
                        SellingWallets: {
                            deleteMany: input.RemoveSellingWallets != null && input.RemoveSellingWallets.length > 0 ? {
                                id: {
                                    in: input.RemoveSellingWallets?.map(rw => rw.id)
                                }
                            } : undefined,
                        },
                        PurchasingWallets: {
                            deleteMany: input.RemovePurchasingWallets != null && input.RemovePurchasingWallets.length > 0 ? {
                                id: {
                                    in: input.RemovePurchasingWallets?.map(rw => rw.id)
                                }
                            } : undefined,

                        },
                    }
                });
            }
            console.log("adding wallets")
            const paymentSource = await prisma.networkHandler.update({
                where: { id: input.id },
                data: {
                    latestIdentifier: input.latestIdentifier,
                    page: input.page,
                    blockfrostApiKey: input.blockfrostApiKey,
                    CollectionWallet: input.CollectionWallet != undefined ? {
                        update: { walletAddress: input.CollectionWallet.walletAddress, note: input.CollectionWallet.note },
                    } : undefined,
                    SellingWallets: {
                        createMany: {
                            data: sellingWallets
                        }
                    },
                    PurchasingWallets: {
                        createMany: {
                            data: purchasingWallets
                        }
                    },

                },
            });

            return paymentSource
        })
        return result
    },
});
export const paymentSourceDeleteSchemaInput = z.object({
    id: z.string().describe("The id of the payment source to be deleted")
})
export const paymentSourceDeleteSchemaOutput = z.object({
    id: z.string()
})

export const paymentSourceEndpointDelete = adminAuthenticatedEndpointFactory.build({
    method: "delete",
    input: paymentSourceDeleteSchemaInput,
    output: paymentSourceDeleteSchemaOutput,
    handler: async ({ input }) => {

        return await prisma.networkHandler.delete({ where: { id: input.id }, })
    },
});