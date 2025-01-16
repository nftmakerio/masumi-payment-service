import { payAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/pay-authenticated';
import { z } from 'zod';
import { $Enums } from '@prisma/client';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';
import * as cbor from "cbor"
import { cardanoTxHandlerService } from "@/services/cardano-tx-handler"


import { tokenCreditService } from '@/services/token-credit';
import { ez } from 'express-zod-api';
import { applyParamsToScript, BlockfrostProvider, mBool, MeshWallet, PlutusScript, resolvePaymentKeyHash, resolvePlutusScriptAddress, resolveStakeKeyHash, SLOT_CONFIG_NETWORK, Transaction, unixTimeToEnclosingSlot } from '@meshsdk/core';
import { decrypt } from '@/utils/encryption';
export const queryPurchaseRequestSchemaInput = z.object({
    limit: z.number({ coerce: true }).min(1).max(100).default(10),
    cursorIdentifier: z.object({ identifier: z.string().max(250), sellingWalletVkey: z.string().max(250) }).optional(),
    network: z.nativeEnum($Enums.Network),
    paymentType: z.nativeEnum($Enums.PaymentType),
    contractAddress: z.string().max(250),
})

export const queryPurchaseRequestSchemaOutput = z.object({
    purchases: z.array(z.object({
        createdAt: z.date(),
        updatedAt: z.date(),
        status: z.nativeEnum($Enums.PurchasingRequestStatus),
        txHash: z.string().nullable(),
        utxo: z.string().nullable(),
        errorType: z.nativeEnum($Enums.PurchaseRequestErrorType).nullable(),
        errorNote: z.string().nullable(),
        errorRequiresManualReview: z.boolean().nullable(),
        identifier: z.string().max(250),
        purchaserWallet: z.object({ id: z.string(), walletVkey: z.string(), note: z.string().nullable() }).nullable(),
        sellerWallet: z.object({ walletVkey: z.string(), note: z.string().nullable() }).nullable(),
        amounts: z.array(z.object({ id: z.string(), createdAt: z.date(), updatedAt: z.date(), amount: z.number({ coerce: true }).min(0).max(Number.MAX_SAFE_INTEGER), unit: z.string() })),
        networkHandler: z.object({ id: z.string(), network: z.nativeEnum($Enums.Network), addressToCheck: z.string().max(250), paymentType: z.nativeEnum($Enums.PaymentType) }).nullable(),
    }))
});

export const queryPurchaseRequestGet = payAuthenticatedEndpointFactory.build({
    method: "get",
    input: queryPurchaseRequestSchemaInput,
    output: queryPurchaseRequestSchemaOutput,
    handler: async ({ input, logger }) => {
        logger.info("Querying registry", input.paymentTypes);

        const networkHandler = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.contractAddress } } })
        if (networkHandler == null) {
            throw createHttpError(404, "Network handler not found")
        }
        let cursor = undefined;
        if (input.cursorIdentifier) {
            const sellerWallet = await prisma.sellerWallet.findUnique({ where: { networkHandlerId_walletVkey: { networkHandlerId: networkHandler.id, walletVkey: input.cursorIdentifier.sellingWalletVkey } } })
            if (sellerWallet == null) {
                throw createHttpError(404, "Selling wallet not found")
            }
            cursor = { networkHandlerId_identifier_sellerWalletId: { networkHandlerId: networkHandler.id, identifier: input.cursorIdentifier.identifier, sellerWalletId: sellerWallet.id } }

        }


        const result = await prisma.purchaseRequest.findMany({
            where: {},
            cursor: cursor,
            take: input.limit,
            include: {
                sellerWallet: { select: { walletVkey: true, note: true } },
                purchaserWallet: { select: { id: true, walletVkey: true, note: true } },
                networkHandler: true,
                amounts: true
            }
        })
        if (result == null) {
            throw createHttpError(404, "Purchase not found")
        }
        return { purchases: result.map(purchase => ({ ...purchase, amounts: purchase.amounts.map(amount => ({ ...amount, amount: Number(amount.amount) })) })) }
    },
});

export const createPurchaseInitSchemaInput = z.object({
    identifier: z.string().max(250),
    network: z.nativeEnum($Enums.Network),
    sellerVkey: z.string().max(250),
    contractAddress: z.string().max(250),
    amounts: z.array(z.object({ amount: z.number({ coerce: true }).min(0).max(Number.MAX_SAFE_INTEGER), unit: z.string() })).max(7),
    paymentType: z.nativeEnum($Enums.PaymentType),
    unlockTime: ez.dateIn(),
    refundTime: ez.dateIn(),
    submitResultTime: ez.dateIn(),
})

export const createPurchaseInitSchemaOutput = z.object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    status: z.nativeEnum($Enums.PurchasingRequestStatus),
});

export const createPurchaseInitPost = payAuthenticatedEndpointFactory.build({
    method: "post",
    input: createPurchaseInitSchemaInput,
    output: createPurchaseInitSchemaOutput,
    handler: async ({ input, options, logger }) => {
        logger.info("Creating purchase", input.paymentTypes);
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.contractAddress } } })
        if (networkCheckSupported == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }
        const wallets = await prisma.purchasingWallet.aggregate({ where: { networkHandlerId: networkCheckSupported.id, }, _count: true })
        if (wallets._count === 0) {
            throw createHttpError(404, "No valid purchasing wallets found")
        }
        //require at least 3 hours between unlock time and the submit result time
        const additionalRefundTime = 1000 * 60 * 60 * 3;
        if (input.unlockTime > new Date(input.refundTime.getTime() + additionalRefundTime)) {
            throw createHttpError(400, "Refund request time must be after unlock time with at least 3 hours difference")
        }
        if (input.submitResultTime.getTime() < Date.now()) {
            throw createHttpError(400, "Submit result time must be in the future")
        }
        const offset = 1000 * 60 * 15;
        if (input.submitResultTime > new Date(input.unlockTime.getTime() + offset)) {
            throw createHttpError(400, "Submit result time must be after unlock time with at least 15 minutes difference")
        }


        const initial = await tokenCreditService.handlePurchaseCreditInit(options.id, input.amounts.map(amount => ({ amount: BigInt(amount.amount), unit: amount.unit })), input.network, input.identifier, input.paymentType, input.contractAddress, input.sellerVkey, input.submitResultTime, input.unlockTime, input.refundTime);
        return initial
    },
});


export const refundPurchaseSchemaInput = z.object({
    identifier: z.string().max(250),
    network: z.nativeEnum($Enums.Network),
    sellerVkey: z.string().max(250),
    address: z.string().max(250),
})

export const refundPurchaseSchemaOutput = z.object({
    txHash: z.string(),
});

export const refundPurchasePatch = payAuthenticatedEndpointFactory.build({
    method: "patch",
    input: refundPurchaseSchemaInput,
    output: refundPurchaseSchemaOutput,
    handler: async ({ input, logger }) => {
        logger.info("Creating purchase", input.paymentTypes);
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.address } }, include: { FeeReceiverNetworkWallet: true, AdminWallets: true, PurchaseRequests: { where: { identifier: input.identifier }, include: { sellerWallet: true, purchaserWallet: { include: { walletSecret: true } } } } } })
        if (networkCheckSupported == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }
        if (networkCheckSupported.PurchaseRequests.length == 0) {
            throw createHttpError(404, "Purchase not found")
        }
        const purchase = networkCheckSupported.PurchaseRequests[0];
        if (purchase.status != $Enums.PurchasingRequestStatus.RefundConfirmed) {
            throw createHttpError(400, "Purchase in invalid state " + purchase.status)
        }


        const blockchainProvider = new BlockfrostProvider(
            networkCheckSupported.blockfrostApiKey,
        )



        const wallet = new MeshWallet({
            networkId: 0,
            fetcher: blockchainProvider,
            submitter: blockchainProvider,
            key: {
                type: 'mnemonic',
                words: decrypt(purchase.purchaserWallet!.walletSecret.secret!).split(" "),
            },
        });

        const address = (await wallet.getUsedAddresses())[0];

        const blueprint = JSON.parse(networkCheckSupported.scriptJSON);

        const adminWallets = networkCheckSupported.AdminWallets;
        if (adminWallets.length != 3)
            throw createHttpError(500, "Admin Address misconfigured")

        const sortedAdminWallets = adminWallets.sort((a, b) => a.order - b.order)

        const admin1 = sortedAdminWallets[0];
        const admin2 = sortedAdminWallets[1];
        const admin3 = sortedAdminWallets[2];
        const script: PlutusScript = {
            code: applyParamsToScript(blueprint.validators[0].compiledCode, [
                [
                    resolvePaymentKeyHash(admin1.walletAddress),
                    resolvePaymentKeyHash(admin2.walletAddress),
                    resolvePaymentKeyHash(admin3.walletAddress),
                ],
                //yes I love meshJs
                {
                    alternative: 0,
                    fields: [
                        {
                            alternative: 0,
                            fields: [resolvePaymentKeyHash(admin1.walletAddress)],
                        },
                        {
                            alternative: 0,
                            fields: [
                                {
                                    alternative: 0,
                                    fields: [
                                        {
                                            alternative: 0,
                                            fields: [resolveStakeKeyHash(networkCheckSupported.FeeReceiverNetworkWallet.walletAddress)],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
                networkCheckSupported.FeePermille,
            ]),
            version: "V3"
        };

        const utxos = await wallet.getUtxos();
        if (utxos.length === 0) {
            //this is if the buyer wallet is empty
            throw new Error('No UTXOs found in the wallet. Wallet is empty.');
        }

        const utxoByHash = await blockchainProvider.fetchUTxOs(
            purchase.txHash!,
        );

        const utxo = utxoByHash.find((utxo) => utxo.input.txHash == purchase.txHash);

        if (!utxo) {
            throw new Error('UTXO not found');
        }

        if (!utxo) {
            throw new Error('UTXO not found');
        }

        // Get the datum from the UTXO

        // Decode the CBOR-encoded datum

        const sellerVerificationKeyHash = purchase.sellerWallet.walletVkey;
        const buyerVerificationKeyHash = purchase.purchaserWallet?.walletVkey;
        if (!buyerVerificationKeyHash)
            throw createHttpError(404, "purchasing wallet not found")

        const utxoDatum = utxo.output.plutusData;
        if (!utxoDatum) {
            throw new Error('No datum found in UTXO');
        }


        const decodedDatum = cbor.decode(Buffer.from(utxoDatum, 'hex'));
        if (typeof decodedDatum.value[3] !== 'string') {
            throw new Error('Invalid datum at position 3');
        }
        const resultHash = Buffer.from(decodedDatum.value[3], "hex").toString("utf-8")

        if (typeof decodedDatum.value[4] !== 'number') {
            throw new Error('Invalid datum at position 4');
        }
        if (typeof decodedDatum.value[5] !== 'number') {
            throw new Error('Invalid datum at position 5');
        }
        if (typeof decodedDatum.value[6] !== 'number') {
            throw new Error('Invalid datum at position 5');
        }
        const submitResultTime = decodedDatum.value[4];
        const unlockTime = decodedDatum.value[5];
        const refundTime = decodedDatum.value[6];

        const refundDenied = cardanoTxHandlerService.mBoolToBool(decodedDatum.value[8])
        if (refundDenied == null) {
            throw new Error("Invalid datum at position 8")
        }
        const datum = {
            value: {
                alternative: 0,
                fields: [
                    buyerVerificationKeyHash,
                    sellerVerificationKeyHash,
                    purchase.identifier,
                    resultHash,
                    submitResultTime,
                    unlockTime,
                    refundTime,
                    //is converted to true
                    mBool(true),
                    //is converted to false
                    //Todo decode old contract value
                    mBool(refundDenied)
                ],
            },
            inline: true,
        };
        const redeemer = {
            data: {
                alternative: 2,
                fields: [],
            },
        };
        const networkType = networkCheckSupported.network == "MAINNET" ? "mainnet" : networkCheckSupported.network == "PREPROD" ? "preprod" : "preview"
        const invalidBefore =
            unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK[networkType]) - 1;
        const invalidHereafter =
            unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK[networkType]) + 1;
        //console.log(utxo);

        const unsignedTx = new Transaction({ initiator: wallet }).setMetadata(674, {
            msg: ["Masumi", "RequestRefund"],
        })
            .redeemValue({
                value: utxo,
                script: script,
                redeemer: redeemer,
            })
            .sendValue(
                { address: resolvePlutusScriptAddress(script, 0), datum: datum },
                utxo,
            )
            .setChangeAddress(address)
            .setRequiredSigners([address]);

        unsignedTx.txBuilder.invalidBefore(invalidBefore);
        unsignedTx.txBuilder.invalidHereafter(invalidHereafter);
        const buildTransaction = await unsignedTx.build();
        const signedTx = await wallet.signTx(buildTransaction);

        //submit the transaction to the blockchain
        const txHash = await wallet.submitTx(signedTx);
        await prisma.purchaseRequest.update({ where: { id: purchase.id }, data: { status: $Enums.PurchasingRequestStatus.RefundRequestInitiated, potentialTxHash: txHash } })

        return { txHash }
    },
});