import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from 'zod';
import { $Enums, } from '@prisma/client';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';
import { ez } from 'express-zod-api';
import cuid2 from '@paralleldrive/cuid2';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { resolvePaymentKeyHash } from '@meshsdk/core';
import { getRegistryScriptV1 } from '@/utils/contractResolver';


export const queryPaymentsSchemaInput = z.object({
    limit: z.number({ coerce: true }).min(1).max(100).default(10).describe("The number of payments to return"),
    cursorIdentifier: z.string().max(250).optional().describe("Used to paginate through the payments"),
    network: z.nativeEnum($Enums.Network).describe("The network the payments were made on"),
    contractAddress: z.string().max(250).describe("The address of the smart contract where the payments were made to"),
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
        identifier: z.string(),
        smartContractWallet: z.object({ id: z.string(), walletVkey: z.string(), note: z.string().nullable() }).nullable(),
        SellingWallet: z.object({ id: z.string(), walletVkey: z.string(), note: z.string().nullable() }).nullable(),
        buyerWallet: z.object({ walletVkey: z.string(), }).nullable(),
        amounts: z.array(z.object({ id: z.string(), createdAt: z.date(), updatedAt: z.date(), amount: z.number({ coerce: true }).min(0), unit: z.string() })),
        checkedBy: z.object({ id: z.string(), network: z.nativeEnum($Enums.Network), addressToCheck: z.string(), paymentType: z.nativeEnum($Enums.PaymentType) }),
    }))
});

export const queryPaymentEntryGet = authenticatedEndpointFactory.build({
    method: "get",
    input: queryPaymentsSchemaInput,
    output: queryRegistrySchemaOutput,
    handler: async ({ input, logger }) => {
        logger.info("Querying db");

        const networkHandler = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.contractAddress } }, include: { SellingWallets: true, CollectionWallet: true } })
        if (!networkHandler) {
            throw createHttpError(404, "Network handler not found")
        }

        const result = await prisma.paymentRequest.findMany({
            where: { checkedById: networkHandler.id },
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
                smartContractWallet: true,
                SellingWallet: true,
                checkedBy: true,
                amounts: true
            }
        })
        if (result == null) {
            throw createHttpError(404, "Payment not found")
        }

        return { payments: result.map(payment => ({ ...payment, amounts: payment.amounts.map(amount => ({ ...amount, amount: Number(amount.amount) })) })) }
    },
});


export const createPaymentsSchemaInput = z.object({
    network: z.nativeEnum($Enums.Network).describe("The network the payment will be received on"),
    agentIdentifier: z.string().min(15).max(250).describe("The identifier of the agent that will be paid"),
    amounts: z.array(z.object({ amount: z.number({ coerce: true }).min(0).max(Number.MAX_SAFE_INTEGER), unit: z.string() })).max(7).describe("The amounts of the payment"),
    paymentType: z.nativeEnum($Enums.PaymentType).describe("The type of payment contract used"),
    contractAddress: z.string().max(250).describe("The address of the smart contract where the payment will be made to"),
    submitResultTime: ez.dateIn().describe("The time after which the payment has to be submitted to the smart contract"),
    unlockTime: ez.dateIn().describe("The time after which the payment will be unlocked"),
    refundTime: ez.dateIn().describe("The time after which a refund will be approved"),
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
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.contractAddress } }, include: { SellingWallets: true, CollectionWallet: true } })
        if (networkCheckSupported == null || networkCheckSupported.SellingWallets == null || networkCheckSupported.CollectionWallet == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }

        const provider = new BlockFrostAPI({
            projectId: networkCheckSupported.blockfrostApiKey
        })
        const { policyId } = await getRegistryScriptV1(input.contractAddress, input.network)
        const assetInWallet = await provider.assetsAddresses(policyId + input.agentIdentifier, { order: "desc", count: 1 })
        if (assetInWallet.length == 0) {
            throw createHttpError(404, "Agent identifier not found")
        }
        const vKey = resolvePaymentKeyHash(assetInWallet[0].address)


        if (networkCheckSupported.SellingWallets.find(wallet => wallet.walletVkey == vKey) == null) {
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
    network: z.nativeEnum($Enums.Network).describe("The network the payment was received on"),
    contractAddress: z.string().max(250).describe("The address of the smart contract where the payment was made to"),
    hash: z.string().max(250).describe("The hash of the AI agent result to be submitted"),
    identifier: z.string().max(250).describe("The identifier of the payment"),
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
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.address } }, include: { SellingWallets: true, CollectionWallet: true, PaymentRequests: { where: { identifier: input.identifier } } } })
        if (networkCheckSupported == null || networkCheckSupported.SellingWallets == null || networkCheckSupported.CollectionWallet == null) {
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