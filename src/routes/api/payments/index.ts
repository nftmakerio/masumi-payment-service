import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from 'zod';
import { $Enums, } from '@prisma/client';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';
import { ez } from 'express-zod-api';
import cuid2 from '@paralleldrive/cuid2';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { resolvePaymentKeyHash } from '@meshsdk/core';
import { deserializePlutusScript } from '@meshsdk/core-cst';


export const queryPaymentsSchemaInput = z.object({
    limit: z.number({ coerce: true }).min(1).max(100).default(10),
    cursorIdentifier: z.string().max(250).optional(),
    network: z.nativeEnum($Enums.Network),
    paymentType: z.nativeEnum($Enums.PaymentType),
    contractAddress: z.string().max(250),
})

export const queryRegistrySchemaOutput = z.object({
    payments: z.array(z.object({
        createdAt: z.date(),
        updatedAt: z.date(),
        status: z.nativeEnum($Enums.PaymentRequestStatus),
        txHash: z.string().nullable(),
        utxo: z.string().nullable(),
        errorType: z.nativeEnum($Enums.PaymentRequestErrorType).nullable(),
        errorNote: z.string().nullable(),
        errorRequiresManualReview: z.boolean().nullable(),
        identifier: z.string().max(250),
        sellingWallet: z.object({ id: z.string(), walletVkey: z.string(), note: z.string().nullable() }).nullable(),
        collectionWallet: z.object({ id: z.string(), walletAddress: z.string(), note: z.string().nullable() }).nullable(),
        buyerWallet: z.object({ walletVkey: z.string(), }).nullable(),
        amounts: z.array(z.object({ id: z.string(), createdAt: z.date(), updatedAt: z.date(), amount: z.number({ coerce: true }).min(0).max(Number.MAX_SAFE_INTEGER), unit: z.string() })),
        checkedBy: z.object({ id: z.string(), network: z.nativeEnum($Enums.Network), addressToCheck: z.string().max(250), paymentType: z.nativeEnum($Enums.PaymentType) }),
    }))
});

export const queryPaymentEntryGet = authenticatedEndpointFactory.build({
    method: "get",
    input: queryPaymentsSchemaInput,
    output: queryRegistrySchemaOutput,
    handler: async ({ input, logger }) => {
        logger.info("Querying db", input.paymentTypes);

        const networkHandler = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.contractAddress } }, include: { SellingWallet: true, CollectionWallet: true } })
        if (!networkHandler) {
            throw createHttpError(404, "Network handler not found")
        }

        const result = await prisma.paymentRequest.findMany({
            where: {},
            orderBy: { createdAt: "desc" },
            cursor: input.cursorIdentifier ? {
                checkedById_identifier: {
                    checkedById: networkHandler.id,
                    identifier: input.cursorIdentifier
                }
            } : undefined,
            take: input.limit,
            include: {
                buyerWallet: true,
                checkedBy: true,
                amounts: true
            }
        })
        if (result == null) {
            throw createHttpError(404, "Payment not found")
        }
        return { payments: result.map((data) => { return { ...data, sellingWallet: networkHandler.SellingWallet, collectionWallet: networkHandler.CollectionWallet, amounts: data.amounts.map(amount => ({ ...amount, amount: Number(amount.amount) })) } }) }
    },
});


export const createPaymentsSchemaInput = z.object({
    network: z.nativeEnum($Enums.Network),
    sellerVkey: z.string().max(250),
    agentIdentifier: z.string().min(15).max(250),
    amounts: z.array(z.object({ amount: z.number({ coerce: true }).min(0).max(Number.MAX_SAFE_INTEGER), unit: z.string() })).max(7),
    paymentType: z.nativeEnum($Enums.PaymentType),
    contractAddress: z.string().max(250),
    submitResultTime: ez.dateIn(),
    unlockTime: ez.dateIn(),
    refundTime: ez.dateIn(),
})

export const createPaymentSchemaOutput = z.object({
    id: z.string(),
    identifier: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    status: z.nativeEnum($Enums.PaymentRequestStatus),
});

export const paymentInitPost = authenticatedEndpointFactory.build({
    method: "post",
    input: createPaymentsSchemaInput,
    output: createPaymentSchemaOutput,
    handler: async ({ input, logger }) => {
        logger.info("Creating purchase", input.paymentTypes);
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.contractAddress } }, include: { SellingWallet: true, CollectionWallet: true } })
        if (networkCheckSupported == null || networkCheckSupported.SellingWallet == null || networkCheckSupported.CollectionWallet == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }

        const provider = new BlockFrostAPI({
            projectId: networkCheckSupported.blockfrostApiKey
        })
        const policyId = deserializePlutusScript(networkCheckSupported.registryJSON, "V3")
            .hash()
            .toString();
        const assetInWallet = await provider.assetsAddresses(policyId + input.agentIdentifier, { order: "desc", count: 1 })
        if (assetInWallet.length == 0) {
            throw createHttpError(404, "Agent identifier not found")
        }
        const sellingWalletVkey = networkCheckSupported.SellingWallet.walletVkey
        if (resolvePaymentKeyHash(assetInWallet[0].address) != sellingWalletVkey) {
            throw createHttpError(404, "Agent identifier not found in wallet")
        }
        const payment = await prisma.paymentRequest.create({
            data: {
                identifier: input.agentIdentifier + "_" + cuid2.createId(),
                checkedBy: { connect: { id: networkCheckSupported.id } },
                amounts: { createMany: { data: input.amounts.map(amount => ({ amount: amount.amount, unit: amount.unit })) } },
                status: $Enums.PaymentRequestStatus.PaymentRequested,
                submitResultTime: input.submitResultTime.getTime(),
                unlockTime: input.unlockTime.getTime(),
                refundTime: input.refundTime.getTime(),
            }
        })
        return payment
    },
});

export const updatePaymentsSchemaInput = z.object({
    network: z.nativeEnum($Enums.Network),
    sellerVkey: z.string().max(250),
    contractAddress: z.string().max(250),
    hash: z.string().max(250),
    identifier: z.string().max(250),
})

export const updatePaymentSchemaOutput = z.object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    status: z.nativeEnum($Enums.PaymentRequestStatus),
});

export const paymentUpdatePatch = authenticatedEndpointFactory.build({
    method: "patch",
    input: updatePaymentsSchemaInput,
    output: updatePaymentSchemaOutput,
    handler: async ({ input, logger }) => {
        logger.info("Creating purchase", input.paymentTypes);
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.address } }, include: { SellingWallet: true, CollectionWallet: true, PaymentRequests: { where: { identifier: input.identifier } } } })
        if (networkCheckSupported == null || networkCheckSupported.SellingWallet == null || networkCheckSupported.CollectionWallet == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }
        if (networkCheckSupported.PaymentRequests.length == 0) {
            throw createHttpError(404, "Payment not found")
        }
        if (networkCheckSupported.PaymentRequests[0].status != $Enums.PaymentRequestStatus.PaymentConfirmed) {
            throw createHttpError(400, "Payment in invalid state " + networkCheckSupported.PaymentRequests[0].status)
        }
        //TODO collect the payment
        const payment = await prisma.paymentRequest.update({
            where: { id: networkCheckSupported.PaymentRequests[0].id },
            data: {
                resultHash: input.hash,
            }
        })
        return payment
    },
});