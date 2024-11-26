import { adminAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/admin-authenticated';
import { z } from 'zod';
import { $Enums, APIKeyStatus, Permission } from '@prisma/client';
import { prisma } from '@/utils/db';
import { createId } from '@paralleldrive/cuid2';
import createHttpError from 'http-errors';


export const getAPIKeySchemaInput = z.object({
    id: z.string().max(550).optional(),
    apiKey: z.string().max(550).optional()
})


export const getAPIKeySchemaOutput = z.object({

    id: z.string(),
    apiKey: z.string(),
    permission: z.nativeEnum(Permission),
    usageLimited: z.boolean(),
    remainingUsageCredits: z.array(z.object({
        unit: z.string().max(150),
        amount: z.number({ coerce: true }).int().min(0).max(1000000)
    })),
    status: z.nativeEnum(APIKeyStatus),

});

export const queryAPIKeyEndpointGet = adminAuthenticatedEndpointFactory.build({
    method: "get",
    input: getAPIKeySchemaInput,
    output: getAPIKeySchemaOutput,
    handler: async ({ input, }) => {
        let data = null;
        if (input.id) {
            data = await prisma.apiKey.findUnique({ where: { id: input.id }, include: { remainingUsageCredits: true } })
        } else {
            data = await prisma.apiKey.findUnique({ where: { apiKey: input.apiKey }, include: { remainingUsageCredits: true } })
        }
        if (!data)
            throw createHttpError(404, "Not found")

        data = { ...data, remainingUsageCredits: data.remainingUsageCredits.map((usageCredit) => ({ unit: usageCredit.unit, amount: parseInt(usageCredit.amount.toString()) })) }
        return data
    },
});

export const addAPIKeySchemaInput = z.object({
    usageLimited: z.boolean().default(false),
    usageCredits: z.array(z.object({
        unit: z.string().max(150),
        amount: z.number({ coerce: true }).int().min(0).max(1000000)
    })),
    permission: z.nativeEnum(Permission).default(Permission.READ),
})

export const addAPIKeySchemaOutput = z.object({

    id: z.string(),
    apiKey: z.string(),
    permission: z.nativeEnum(Permission),
    usageLimited: z.boolean(),
    status: z.nativeEnum(APIKeyStatus),

})

export const addAPIKeyEndpointPost = adminAuthenticatedEndpointFactory.build({
    method: "post",
    input: addAPIKeySchemaInput,
    output: addAPIKeySchemaOutput,
    handler: async ({ input }) => {
        const apiKey = ("masumi-registry-" + input.permission == $Enums.Permission.ADMIN ? "admin-" : "") + createId()
        const result = await prisma.apiKey.create({
            data: {
                apiKey: apiKey, status: $Enums.APIKeyStatus.ACTIVE, permission: input.permission, usageLimited: input.usageLimited, remainingUsageCredits: {
                    createMany: { data: input.usageCredits.map((usageCredit) => ({ unit: usageCredit.unit, amount: usageCredit.amount })) }
                }
            }
        })
        return result
    },
});

export const updateAPIKeySchemaInput = z.object({
    id: z.string().max(150).optional(),
    apiKey: z.string().max(550).optional(),
    usageCredits: z.array(z.object({
        unit: z.string().max(150),
        amount: z.number({ coerce: true }).int().min(0).max(1000000)
    })).optional(),
    status: z.nativeEnum(APIKeyStatus).default(APIKeyStatus.ACTIVE).optional(),
})

export const updateAPIKeySchemaOutput = z.object({
    id: z.string(),
    apiKey: z.string(),
    permission: z.nativeEnum(Permission),
    usageLimited: z.boolean(),
    status: z.nativeEnum(APIKeyStatus),
})

export const updateAPIKeyEndpointPatch = adminAuthenticatedEndpointFactory.build({
    method: "patch",
    input: updateAPIKeySchemaInput,
    output: updateAPIKeySchemaOutput,
    handler: async ({ input, }) => {

        if (input.id) {
            const result = await prisma.apiKey.update({ where: { id: input.id }, data: { usageLimited: input.usageLimited, status: input.status, remainingUsageCredits: { set: input.usageCredits?.map((usageCredit) => ({ id: createId(), unit: usageCredit.unit, amount: usageCredit.amount })) } } })
            return result
        } else if (input.apiKey) {
            const result = await prisma.apiKey.update({ where: { apiKey: input.apiKey }, data: { usageLimited: input.usageLimited, status: input.status, remainingUsageCredits: { set: input.usageCredits?.map((usageCredit) => ({ id: createId(), unit: usageCredit.unit, amount: usageCredit.amount })) } } })
            return result;
        }
        throw createHttpError(400, "Invalid input")
    },
});

export const deleteAPIKeySchemaInput = z.object({
    id: z.string().max(150).optional(),
    apiKey: z.string().max(550).optional()
})

export const deleteAPIKeySchemaOutput = z.object({
    id: z.string(),
    apiKey: z.string(),
});

export const deleteAPIKeyEndpointDelete = adminAuthenticatedEndpointFactory.build({
    method: "delete",
    input: deleteAPIKeySchemaInput,
    output: deleteAPIKeySchemaOutput,

    handler: async ({ input, }) => {
        if (input.id) {
            const result = await prisma.apiKey.delete({ where: { id: input.id } })
            return result
        } else if (input.apiKey) {
            const result = await prisma.apiKey.delete({ where: { apiKey: input.apiKey } })
            return result
        }
        throw createHttpError(400, "Invalid input")
    },
});
