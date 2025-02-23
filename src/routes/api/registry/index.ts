import { payAuthenticatedEndpointFactory } from '@/utils/security/auth/pay-authenticated';
import { z } from 'zod';
import { HotWalletType, Network, RegistrationState } from '@prisma/client';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';
import { resolvePaymentKeyHash } from '@meshsdk/core-cst';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { getRegistryScriptFromNetworkHandlerV1 } from '@/utils/generator/contract-generator';
import { DEFAULTS } from '@/utils/config';
import { checkIsAllowedNetworkOrThrowUnauthorized } from '@/utils/middleware/auth-middleware';

export const queryRegistryRequestSchemaInput = z.object({
  cursorId: z
    .string()
    .optional()
    .describe('The cursor id to paginate through the results'),
  network: z
    .nativeEnum(Network)
    .describe('The Cardano network used to register the agent on'),
  smartContractAddress: z
    .string()
    .max(250)
    .optional()
    .describe(
      'The smart contract address of the payment source to which the registration belongs',
    ),
});

export const queryRegistryRequestSchemaOutput = z.object({
  assets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      apiUrl: z.string(),
      capabilityName: z.string(),
      capabilityVersion: z.string(),
      requestsPerHour: z.string().nullable(),
      authorName: z.string(),
      authorContact: z.string().nullable(),
      authorOrganization: z.string().nullable(),
      privacyPolicy: z.string().nullable(),
      terms: z.string().nullable(),
      other: z.string().nullable(),
      state: z.nativeEnum(RegistrationState),
      tags: z.array(z.string()),
      createdAt: z.date(),
      updatedAt: z.date(),
      lastCheckedAt: z.date().nullable(),
      agentIdentifier: z.string().nullable(),
      Pricing: z.array(
        z.object({
          unit: z.string(),
          quantity: z.string(),
        }),
      ),
      SmartContractWallet: z.object({
        walletVkey: z.string(),
        walletAddress: z.string(),
      }),
    }),
  ),
});

export const queryRegistryRequestGet = payAuthenticatedEndpointFactory.build({
  method: 'get',
  input: queryRegistryRequestSchemaInput,
  output: queryRegistryRequestSchemaOutput,
  handler: async ({ input, options }) => {
    const smartContractAddress =
      input.smartContractAddress ??
      (input.network == Network.Mainnet
        ? DEFAULTS.PAYMENT_SMART_CONTRACT_ADDRESS_MAINNET
        : DEFAULTS.PAYMENT_SMART_CONTRACT_ADDRESS_PREPROD);
    const paymentSource = await prisma.paymentSource.findUnique({
      where: {
        network_smartContractAddress: {
          network: input.network,
          smartContractAddress: smartContractAddress,
        },
      },
      include: { PaymentSourceConfig: true, HotWallets: true },
    });
    if (paymentSource == null) {
      throw createHttpError(
        404,
        'Network and Address combination not supported',
      );
    }
    await checkIsAllowedNetworkOrThrowUnauthorized(
      options.networkLimit,
      input.network,
      options.permission,
    );

    const result = await prisma.registryRequest.findMany({
      where: {
        PaymentSource: {
          id: paymentSource.id,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
      cursor: input.cursorId ? { id: input.cursorId } : undefined,
      include: {
        SmartContractWallet: true,
        Pricing: true,
      },
    });

    return {
      assets: result.map((item) => ({
        ...item,
        Pricing: item.Pricing.map((price) => ({
          unit: price.unit,
          quantity: price.quantity.toString(),
        })),
      })),
    };
  },
});

export const registerAgentSchemaInput = z.object({
  network: z
    .nativeEnum(Network)
    .describe('The Cardano network used to register the agent on'),
  smartContractAddress: z
    .string()
    .max(250)
    .optional()
    .describe(
      'The smart contract address of the payment contract to be registered for',
    ),
  sellingWalletVkey: z
    .string()
    .max(250)
    .describe('The payment key of a specific wallet used for the registration'),
  exampleOutput: z
    .string()
    .max(250)
    .optional()
    .describe('Link to a example output of the agent'),
  tags: z
    .array(z.string().max(63))
    .min(1)
    .max(15)
    .describe('Tags used in the registry metadata'),
  name: z.string().max(250).describe('Name of the agent'),
  apiUrl: z
    .string()
    .max(250)
    .describe('Base URL of the agent, to request interactions'),
  description: z.string().max(250).describe('Description of the agent'),
  capability: z
    .object({ name: z.string().max(250), version: z.string().max(250) })
    .describe('Provide information about the used AI model and version'),
  requestsPerHour: z
    .string()
    .max(250)
    .describe('The request the agent can handle per hour'),
  pricing: z
    .array(
      z.object({
        unit: z.string().max(250),
        quantity: z.string().max(25),
      }),
    )
    .max(5)
    .describe('Price for a default interaction'),
  legal: z
    .object({
      privacyPolicy: z.string().max(250).optional(),
      terms: z.string().max(250).optional(),
      other: z.string().max(250).optional(),
    })
    .optional()
    .describe('Legal information about the agent'),
  author: z
    .object({
      name: z.string().max(250),
      contact: z.string().max(250).optional(),
      organization: z.string().max(250).optional(),
    })
    .describe('Author information about the agent'),
});

export const registerAgentSchemaOutput = z.object({
  id: z.string(),
  name: z.string(),
  apiUrl: z.string(),
  capabilityName: z.string(),
  capabilityVersion: z.string(),
  description: z.string().nullable(),
  requestsPerHour: z.string().nullable(),
  privacyPolicy: z.string().nullable(),
  terms: z.string().nullable(),
  other: z.string().nullable(),
  tags: z.array(z.string()),
  state: z.nativeEnum(RegistrationState),
  SmartContractWallet: z.object({
    walletVkey: z.string(),
    walletAddress: z.string(),
  }),
  Pricing: z.array(
    z.object({
      unit: z.string(),
      quantity: z.string(),
    }),
  ),
});

export const registerAgentPost = payAuthenticatedEndpointFactory.build({
  method: 'post',
  input: registerAgentSchemaInput,
  output: registerAgentSchemaOutput,
  handler: async ({ input, options }) => {
    const smartContractAddress =
      input.smartContractAddress ??
      (input.network == Network.Mainnet
        ? DEFAULTS.PAYMENT_SMART_CONTRACT_ADDRESS_MAINNET
        : DEFAULTS.PAYMENT_SMART_CONTRACT_ADDRESS_PREPROD);
    const paymentSource = await prisma.paymentSource.findUnique({
      where: {
        network_smartContractAddress: {
          network: input.network,
          smartContractAddress: smartContractAddress,
        },
      },
      include: {
        AdminWallets: true,
        HotWallets: { include: { Secret: true } },
        PaymentSourceConfig: true,
      },
    });
    if (paymentSource == null) {
      throw createHttpError(
        404,
        'Network and Address combination not supported',
      );
    }
    await checkIsAllowedNetworkOrThrowUnauthorized(
      options.networkLimit,
      input.network,
      options.permission,
    );

    const sellingWallet = paymentSource.HotWallets.find(
      (wallet) =>
        wallet.walletVkey == input.sellingWalletVkey &&
        wallet.type == HotWalletType.Selling,
    );
    if (sellingWallet == null) {
      throw createHttpError(404, 'Selling wallet not found');
    }
    const result = await prisma.registryRequest.create({
      data: {
        name: input.name,
        description: input.description,
        apiUrl: input.apiUrl,
        capabilityName: input.capability.name,
        capabilityVersion: input.capability.version,
        requestsPerHour: input.requestsPerHour,
        authorName: input.author.name,
        authorContact: input.author.contact,
        authorOrganization: input.author.organization,
        state: RegistrationState.RegistrationRequested,
        SmartContractWallet: {
          connect: {
            id: sellingWallet.id,
          },
        },
        PaymentSource: {
          connect: {
            id: paymentSource.id,
          },
        },
        tags: input.tags,
        Pricing: {
          createMany: {
            data: input.pricing.map((price) => ({
              unit: price.unit,
              quantity: parseInt(price.quantity),
            })),
          },
        },
      },
      include: {
        Pricing: true,
        SmartContractWallet: true,
      },
    });

    return {
      ...result,
      Pricing: result.Pricing.map((pricing) => ({
        unit: pricing.unit,
        quantity: pricing.quantity.toString(),
      })),
    };
  },
});

export const unregisterAgentSchemaInput = z.object({
  assetIdentifier: z
    .string()
    .max(250)
    .describe('The identifier of the registration (asset) to be deregistered'),
  network: z
    .nativeEnum(Network)
    .describe('The network the registration was made on'),
  smartContractAddress: z
    .string()
    .max(250)
    .optional()
    .describe(
      'The smart contract address of the payment contract to which the registration belongs',
    ),
});

export const unregisterAgentSchemaOutput = z.object({
  id: z.string(),
  name: z.string(),
  apiUrl: z.string(),
  capabilityName: z.string(),
  capabilityVersion: z.string(),
  description: z.string().nullable(),
  requestsPerHour: z.string().nullable(),
  privacyPolicy: z.string().nullable(),
  terms: z.string().nullable(),
  other: z.string().nullable(),
  tags: z.array(z.string()),
  SmartContractWallet: z.object({
    walletVkey: z.string(),
    walletAddress: z.string(),
  }),
  state: z.nativeEnum(RegistrationState),
  Pricing: z.array(
    z.object({
      unit: z.string(),
      quantity: z.string(),
    }),
  ),
});

export const unregisterAgentDelete = payAuthenticatedEndpointFactory.build({
  method: 'delete',
  input: unregisterAgentSchemaInput,
  output: unregisterAgentSchemaOutput,
  handler: async ({ input, options }) => {
    const smartContractAddress =
      input.smartContractAddress ??
      (input.network == Network.Mainnet
        ? DEFAULTS.PAYMENT_SMART_CONTRACT_ADDRESS_MAINNET
        : DEFAULTS.PAYMENT_SMART_CONTRACT_ADDRESS_PREPROD);
    const paymentSource = await prisma.paymentSource.findUnique({
      where: {
        network_smartContractAddress: {
          network: input.network,
          smartContractAddress: smartContractAddress,
        },
      },
      include: {
        PaymentSourceConfig: true,
        HotWallets: { include: { Secret: true } },
      },
    });
    if (paymentSource == null) {
      throw createHttpError(
        404,
        'Network and Address combination not supported',
      );
    }

    await checkIsAllowedNetworkOrThrowUnauthorized(
      options.networkLimit,
      input.network,
      options.permission,
    );

    const blockfrost = new BlockFrostAPI({
      projectId: paymentSource.PaymentSourceConfig.rpcProviderApiKey,
    });

    const { policyId } =
      await getRegistryScriptFromNetworkHandlerV1(paymentSource);

    let assetName = input.assetIdentifier;
    if (assetName.startsWith(policyId)) {
      assetName = assetName.slice(policyId.length);
    }
    const holderWallet = await blockfrost.assetsAddresses(
      policyId + assetName,
      { order: 'desc', count: 1 },
    );
    if (holderWallet.length == 0) {
      throw createHttpError(404, 'Asset not found');
    }
    const vkey = resolvePaymentKeyHash(holderWallet[0].address);

    const sellingWallet = paymentSource.HotWallets.find(
      (wallet) =>
        wallet.walletVkey == vkey && wallet.type == HotWalletType.Selling,
    );
    if (sellingWallet == null) {
      throw createHttpError(404, 'Registered Wallet not found');
    }
    const registryRequest = await prisma.registryRequest.findUnique({
      where: {
        agentIdentifier: policyId + assetName,
      },
    });
    if (registryRequest == null) {
      throw createHttpError(404, 'Registration not found');
    }
    const result = await prisma.registryRequest.update({
      where: { id: registryRequest.id },
      data: {
        state: RegistrationState.DeregistrationRequested,
      },
      include: {
        Pricing: true,
        SmartContractWallet: true,
      },
    });

    return {
      ...result,
      Pricing: result.Pricing.map((pricing) => ({
        unit: pricing.unit,
        quantity: pricing.quantity.toString(),
      })),
    };
  },
});
