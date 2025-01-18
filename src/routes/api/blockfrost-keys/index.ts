import { adminAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/admin-authenticated';
import { z } from 'zod';
import { prisma } from '@/utils/db';
import { $Enums } from '@prisma/client';




export const getBlockfrostKeysSchemaInput = z.object({
    cursorId: z.string().min(1).max(250).optional().describe("Used to paginate through the blockfrost keys"),
    limit: z.number({ coerce: true }).min(1).max(100).default(100).describe("The number of blockfrost keys to return"),
})


export const getBlockfrostKeysSchemaOutput = z.object({
    blockfrostKeys: z.array(z.object({
        id: z.string(),
        blockfrostApiKey: z.string(),
        createdAt: z.date(),
        updatedAt: z.date(),
        network: z.nativeEnum($Enums.Network),
    })),
});

export const queryBlockfrostKeysEndpointGet = adminAuthenticatedEndpointFactory.build({
    method: "get",
    input: getBlockfrostKeysSchemaInput,
    output: getBlockfrostKeysSchemaOutput,
    handler: async ({ input }) => {
        const blockfrostApiKeys = await prisma.networkHandler.findMany({ cursor: input.cursorId ? { id: input.cursorId } : undefined, orderBy: { createdAt: "asc" }, take: input.limit })
        return { blockfrostKeys: blockfrostApiKeys }
    },
});