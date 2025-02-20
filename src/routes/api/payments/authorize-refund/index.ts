import { readAuthenticatedEndpointFactory } from '@/utils/security/auth/read-authenticated';
import { z } from 'zod';
import { Network, OnChainState, PaymentAction, PaymentErrorType, PaymentType, Permission, } from '@prisma/client';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';
import { DEFAULTS } from '@/utils/config';
import { checkIsAllowedNetworkOrThrowUnauthorized } from '@/utils/middleware/auth-middleware';


export const authorizePaymentRefundSchemaInput = z.object({
    blockchainIdentifier: z.string().max(8000).describe("The identifier of the purchase to be refunded"),
    sellerVkey: z.string().max(250).describe("The vkey of the seller"),
    network: z.nativeEnum(Network).describe("The network the Cardano wallet will be used on"),
    paymentContractAddress: z.string().max(250).optional().describe("The address of the smart contract holding the purchase"),
})

export const authorizePaymentRefundSchemaOutput = z.object({
    id: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    blockchainIdentifier: z.string(),
    submitResultTime: z.string(),
    unlockTime: z.string(),
    refundTime: z.string(),
    lastCheckedAt: z.date().nullable(),
    requestedById: z.string(),
    resultHash: z.string(),
    onChainState: z.nativeEnum(OnChainState).nullable(),
    NextAction: z.object({
        requestedAction: z.nativeEnum(PaymentAction),
        errorType: z.nativeEnum(PaymentErrorType).nullable(),
        errorNote: z.string().nullable(),
    }),
    Amounts: z.array(z.object({
        id: z.string(),
        createdAt: z.date(),
        updatedAt: z.date(),
        amount: z.string(),
        unit: z.string()
    })),
    PaymentSource: z.object({
        id: z.string(),
        network: z.nativeEnum(Network),
        smartContractAddress: z.string(),
        paymentType: z.nativeEnum(PaymentType)
    }),
    BuyerWallet: z.object({
        id: z.string(),
        walletVkey: z.string(),
    }).nullable(),
    SmartContractWallet: z.object({
        id: z.string(),
        walletVkey: z.string(),
        walletAddress: z.string(),
    }).nullable(),
    metadata: z.string().nullable(),
});

export const authorizePaymentRefundEndpointPost = readAuthenticatedEndpointFactory.build({
    method: "post",
    input: authorizePaymentRefundSchemaInput,
    output: authorizePaymentRefundSchemaOutput,
    handler: async ({ input, options }) => {
        const paymentContractAddress = input.paymentContractAddress ?? (input.network == Network.Mainnet ? DEFAULTS.PAYMENT_SMART_CONTRACT_ADDRESS_MAINNET : DEFAULTS.PAYMENT_SMART_CONTRACT_ADDRESS_PREPROD)
        const specifiedPaymentContract = await prisma.paymentSource.findUnique({
            where: {
                network_smartContractAddress: { network: input.network, smartContractAddress: paymentContractAddress }
            }, include: {
                FeeReceiverNetworkWallet: true,
                AdminWallets: true,
                PaymentSourceConfig: true,
                PaymentRequests: {
                    where: {
                        blockchainIdentifier: input.blockchainIdentifier,
                        NextAction: { requestedAction: { in: [PaymentAction.WaitingForExternalAction] } },
                        onChainState: { in: [OnChainState.RefundRequested, OnChainState.Disputed] }
                    }, include: {
                        BuyerWallet: true,
                        SmartContractWallet: true,
                        NextAction: true,
                        CurrentTransaction: true,
                        TransactionHistory: true,
                    }
                }
            }
        })
        if (specifiedPaymentContract == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }
        if (specifiedPaymentContract.PaymentRequests.length == 0) {
            throw createHttpError(404, "Payment not found or in invalid state")
        }
        const payment = specifiedPaymentContract.PaymentRequests[0];
        if (payment.SmartContractWallet == null) {
            throw createHttpError(404, "Smart contract wallet not found")
        }
        if (payment.SmartContractWallet.walletVkey != input.sellerVkey) {
            throw createHttpError(400, "Seller vkey does not match")
        }
        if (payment.CurrentTransaction == null) {
            throw createHttpError(400, "Payment in invalid state")
        }
        await checkIsAllowedNetworkOrThrowUnauthorized(options.networkLimit, input.network, options.permission)
        if (payment.requestedById != options.id && options.permission != Permission.Admin) {
            throw createHttpError(403, "You are not authorized to authorize a refund for this payment")
        }
        const result = await prisma.paymentRequest.update({
            where: { id: specifiedPaymentContract.PaymentRequests[0].id },
            data: {
                NextAction: {
                    update: {
                        requestedAction: PaymentAction.AuthorizeRefundRequested,
                    }
                },
            },
            include: {
                NextAction: true,
                BuyerWallet: true,
                SmartContractWallet: true,
                PaymentSource: true,
                Amounts: true
            }
        })

        return {
            ...result,
            submitResultTime: result.submitResultTime.toString(),
            unlockTime: result.unlockTime.toString(),
            refundTime: result.refundTime.toString(),
            Amounts: result.Amounts.map(amount => ({
                ...amount,
                amount: amount.amount.toString()
            }))
        }
    },
});