import { authenticatedEndpointFactory } from '@/utils/endpoint-factory/authenticated';
import { z } from 'zod';
import { APIKeyStatus, Permission } from '@prisma/client';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';



export const getAPIKeyStatusSchemaInput = z.object({

})


export const getAPIKeyStatusSchemaOutput = z.object({
    apiKey: z.string(),
    permission: z.nativeEnum(Permission),
    usageLimited: z.boolean(),
    remainingUsageCredits: z.array(z.object({
        unit: z.string().max(150),
        amount: z.number({ coerce: true }).int().min(0).max(100000000)
    })),
    status: z.nativeEnum(APIKeyStatus),
});

export const queryAPIKeyStatusEndpointGet = authenticatedEndpointFactory.build({
    method: "get",
    input: getAPIKeyStatusSchemaInput,
    output: getAPIKeyStatusSchemaOutput,
    handler: async ({ options }) => {
        const result = await prisma.apiKey.findFirst({ where: { id: options.id }, include: { remainingUsageCredits: true } })
        if (!result) {
            throw createHttpError(500, "API key not found");
        }
        return { ...result, remainingUsageCredits: result?.remainingUsageCredits.map((usageCredit) => ({ unit: usageCredit.unit, amount: parseInt(usageCredit.amount.toString()) })) }
    },
});
