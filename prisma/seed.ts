import { ApiKeyStatus, HotWalletType, Network, PaymentType, Permission, PrismaClient, RPCProvider } from '@prisma/client';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { MeshWallet, resolvePaymentKeyHash, resolvePlutusScriptAddress, resolveStakeKeyHash, PlutusScript, applyParamsToScript } from '@meshsdk/core'
import { encrypt } from './../src/utils/security/encryption';
import { DEFAULTS } from './../src/utils/config';
import { getRegistryScriptV1 } from './../src/utils/generator/contract-generator';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';



dotenv.config();
const prisma = new PrismaClient();
export const seed = async (prisma: PrismaClient) => {

  const adminKey = process.env.ADMIN_KEY;
  if (adminKey != null) {
    if (adminKey.length < 15) throw Error('API-KEY is insecure');

    await prisma.apiKey.upsert({
      create: { token: adminKey, permission: Permission.Admin, status: ApiKeyStatus.Active },
      update: { token: adminKey, permission: Permission.Admin, status: ApiKeyStatus.Active },
      where: { token: adminKey },
    });

    console.log('ADMIN_KEY seeded');
  } else {
    console.log('ADMIN_KEY is not seeded. Provide ADMIN_KEY in .env');
  }


  let collectionWalletPreprodAddress = process.env.COLLECTION_WALLET_PREPROD_ADDRESS;
  let purchaseWalletPreprodMnemonic = process.env.PURCHASE_WALLET_PREPROD_MNEMONIC;
  if (!purchaseWalletPreprodMnemonic) {
    const secret_key = MeshWallet.brew(false) as string[];
    purchaseWalletPreprodMnemonic = secret_key.join(" ");
  }
  let sellingWalletPreprodMnemonic = process.env.SELLING_WALLET_PREPROD_MNEMONIC;
  if (!sellingWalletPreprodMnemonic) {
    const secret_key = MeshWallet.brew(false) as string[];
    sellingWalletPreprodMnemonic = secret_key.join(" ");
  }
  if (!collectionWalletPreprodAddress) {
    const sellingWallet = new MeshWallet({
      networkId: 0,
      key: {
        type: 'mnemonic',
        words: sellingWalletPreprodMnemonic.split(" "),
      },
    });
    collectionWalletPreprodAddress = (await sellingWallet.getUnusedAddresses())[0];
  }

  let collectionWalletMainnetAddress = process.env.COLLECTION_WALLET_MAINNET_ADDRESS;
  let purchaseWalletMainnetMnemonic = process.env.PURCHASE_WALLET_MAINNET_MNEMONIC;
  if (!purchaseWalletMainnetMnemonic) {
    const secret_key = MeshWallet.brew(false) as string[];
    purchaseWalletMainnetMnemonic = secret_key.join(" ");
  }
  let sellingWalletMainnetMnemonic = process.env.SELLING_WALLET_MAINNET_MNEMONIC;
  if (!sellingWalletMainnetMnemonic) {
    const secret_key = MeshWallet.brew(false) as string[];
    sellingWalletMainnetMnemonic = secret_key.join(" ");
  }
  if (!collectionWalletMainnetAddress) {
    const sellingWallet = new MeshWallet({
      networkId: 0,
      key: {
        type: 'mnemonic',
        words: sellingWalletMainnetMnemonic.split(" "),
      },
    });
    collectionWalletMainnetAddress = (await sellingWallet.getUnusedAddresses())[0];
  }


  const blockfrostApiKeyPreprod = process.env.BLOCKFROST_API_KEY_PREPROD;

  const encryptionKey = process.env.ENCRYPTION_KEY;

  const adminWallet1AddressPreprod = DEFAULTS.ADMIN_WALLET1_PREPROD;
  const adminWallet2AddressPreprod = DEFAULTS.ADMIN_WALLET2_PREPROD;
  const adminWallet3AddressPreprod = DEFAULTS.ADMIN_WALLET3_PREPROD;

  const feeWalletAddressPreprod = DEFAULTS.FEE_WALLET_PREPROD;
  const feePermillePreprod = DEFAULTS.FEE_PERMILLE_PREPROD;
  const cooldownTimePreprod = DEFAULTS.COOLDOWN_TIME_PREPROD;
  const cooldownTimeMainnet = DEFAULTS.COOLDOWN_TIME_MAINNET;


  const scriptJSON = readFileSync('./smart-contracts/payment/plutus.json', 'utf-8');

  if (encryptionKey != null && blockfrostApiKeyPreprod != null) {

    const blueprint = JSON.parse(scriptJSON)

    const fee = feePermillePreprod
    if (fee < 0 || fee > 1000) throw Error("Fee permille is not valid")


    const script: PlutusScript = {
      code: applyParamsToScript(blueprint.validators[0].compiledCode, [
        2,
        [
          resolvePaymentKeyHash(adminWallet1AddressPreprod),
          resolvePaymentKeyHash(adminWallet2AddressPreprod),
          resolvePaymentKeyHash(adminWallet3AddressPreprod),
        ],
        {
          alternative: 0,
          fields: [
            {
              alternative: 0,
              fields: [resolvePaymentKeyHash(feeWalletAddressPreprod)],
            },
            {
              alternative: 0,
              fields: [
                {
                  alternative: 0,
                  fields: [
                    {
                      alternative: 0,
                      fields: [resolveStakeKeyHash(feeWalletAddressPreprod)],
                    },
                  ],
                },
              ],
            },
          ],
        },
        fee,
        cooldownTimePreprod
      ]),
      version: "V3"
    };
    const smartContractAddress = resolvePlutusScriptAddress(script, 0)

    const blockfrostApi = new BlockFrostAPI({
      projectId: blockfrostApiKeyPreprod
    })

    let latestTx: { tx_hash: string }[] | null = null
    try {
      latestTx = await blockfrostApi.addressesTransactions(smartContractAddress, { count: 1, order: "desc" })
      if (latestTx.length > 0) {
        console.log('Smart contract address exists on preprod, syncing after tx: ' + (latestTx[0]?.tx_hash ?? "no tx hash"));
      }
    } catch (error) {
      console.warn('Smart contract address preprod has no transactions. ', error);
    }

    try {
      const purchasingWallet = new MeshWallet({
        networkId: 0,
        key: {
          type: 'mnemonic',
          words: purchaseWalletPreprodMnemonic.split(" "),
        },
      });
      const sellingWallet = new MeshWallet({
        networkId: 0,
        key: {
          type: 'mnemonic',
          words: sellingWalletPreprodMnemonic.split(" "),
        },
      });
      const purchasingWalletSecret = encrypt(purchaseWalletPreprodMnemonic)
      const sellingWalletSecret = encrypt(sellingWalletPreprodMnemonic)
      const purchasingWalletSecretId = await prisma.walletSecret.create({ data: { encryptedMnemonic: purchasingWalletSecret } })
      const sellingWalletSecretId = await prisma.walletSecret.create({ data: { encryptedMnemonic: sellingWalletSecret } })
      await prisma.paymentSource.create({
        data: {
          smartContractAddress: smartContractAddress,
          network: Network.Preprod,
          PaymentSourceConfig: {
            create: {
              rpcProviderApiKey: blockfrostApiKeyPreprod,
              rpcProvider: RPCProvider.Blockfrost
            }
          },
          paymentType: PaymentType.Web3CardanoV1,
          syncInProgress: false,
          lastIdentifierChecked: latestTx && latestTx.length > 0 ? latestTx[0].tx_hash : null,
          FeeReceiverNetworkWallet: {
            create: {
              walletAddress: adminWallet1AddressPreprod,
              order: 1,
            },
          },
          feeRatePermille: fee,
          AdminWallets: {
            create: [
              { walletAddress: adminWallet1AddressPreprod, order: 1 },
              { walletAddress: adminWallet2AddressPreprod, order: 2 },
              { walletAddress: adminWallet3AddressPreprod, order: 3 },
            ],
          },
          HotWallets: {
            createMany: {
              data: [{
                walletVkey: resolvePaymentKeyHash((await purchasingWallet.getUnusedAddresses())[0]),
                walletAddress: (await purchasingWallet.getUnusedAddresses())[0],
                note: "Created by seeding",
                type: HotWalletType.Purchasing,
                secretId: purchasingWalletSecretId.id
              },
              {
                walletVkey: resolvePaymentKeyHash((await sellingWallet.getUnusedAddresses())[0]),
                walletAddress: (await sellingWallet.getUnusedAddresses())[0],
                note: "Created by seeding",
                type: HotWalletType.Selling,
                secretId: sellingWalletSecretId.id,
                collectionAddress: collectionWalletPreprodAddress
              }]
            }
          },
          cooldownTime: cooldownTimePreprod,
        },
      });
      const { policyId } = await getRegistryScriptV1(smartContractAddress, Network.Preprod)
      console.log('Contract seeded on preprod: ' + smartContractAddress + ' added. Registry policyId: ' + policyId);
    } catch (error) {
      console.error(error);
    }
  } else {
    console.log("Smart contract preprod to monitor is not seeded. Provide ENCRYPTION_KEY and BLOCKFROST_API_KEY_PREPROD in .env")
  }

  const blockfrostApiKeyMainnet = process.env.BLOCKFROST_API_KEY_MAINNET;
  const adminWallet1AddressMainnet = DEFAULTS.ADMIN_WALLET1_MAINNET;
  const adminWallet2AddressMainnet = DEFAULTS.ADMIN_WALLET2_MAINNET;
  const adminWallet3AddressMainnet = DEFAULTS.ADMIN_WALLET3_MAINNET;

  const feeWalletAddressMainnet = DEFAULTS.FEE_WALLET_MAINNET;
  const feePermilleMainnet = DEFAULTS.FEE_PERMILLE_MAINNET;

  if (encryptionKey != null && blockfrostApiKeyMainnet != null) {

    const blueprint = JSON.parse(scriptJSON)

    const fee = feePermilleMainnet
    if (fee < 0 || fee > 1000) throw Error("Fee permille is not valid")


    const script: PlutusScript = {
      code: applyParamsToScript(blueprint.validators[0].compiledCode, [
        2,
        [
          resolvePaymentKeyHash(adminWallet1AddressMainnet),
          resolvePaymentKeyHash(adminWallet2AddressMainnet),
          resolvePaymentKeyHash(adminWallet3AddressMainnet),
        ],
        {
          alternative: 0,
          fields: [
            {
              alternative: 0,
              fields: [resolvePaymentKeyHash(feeWalletAddressMainnet)],
            },
            {
              alternative: 0,
              fields: [
                {
                  alternative: 0,
                  fields: [
                    {
                      alternative: 0,
                      fields: [resolveStakeKeyHash(feeWalletAddressMainnet)],
                    },
                  ],
                },
              ],
            },
          ],
        },
        fee,
        cooldownTimeMainnet
      ]),
      version: "V3"
    };

    const smartContractAddress = resolvePlutusScriptAddress(script, 1)
    const blockfrostApi = new BlockFrostAPI({
      projectId: blockfrostApiKeyMainnet
    })
    let latestTx: { tx_hash: string }[] | null = null
    try {
      latestTx = await blockfrostApi.addressesTransactions(smartContractAddress, { count: 1, order: "desc" })
      if (latestTx.length > 0) {
        console.log('Smart contract address exists on mainnet, syncing after tx: ' + (latestTx[0]?.tx_hash ?? "no tx hash"));
      }
    } catch (error) {
      console.warn('Smart contract address mainnet has no transactions. ', error);
    }
    try {
      const purchasingWallet = new MeshWallet({
        networkId: 1,
        key: {
          type: 'mnemonic',
          words: purchaseWalletMainnetMnemonic.split(" "),
        },
      });
      const sellingWallet = new MeshWallet({
        networkId: 1,
        key: {
          type: 'mnemonic',
          words: sellingWalletMainnetMnemonic.split(" "),
        },
      });
      const purchasingWalletSecret = encrypt(purchaseWalletMainnetMnemonic)
      const sellingWalletSecret = encrypt(sellingWalletMainnetMnemonic)
      const purchasingWalletSecretId = await prisma.walletSecret.create({ data: { encryptedMnemonic: purchasingWalletSecret } })
      const sellingWalletSecretId = await prisma.walletSecret.create({ data: { encryptedMnemonic: sellingWalletSecret } })
      await prisma.paymentSource.create({
        data: {
          smartContractAddress: smartContractAddress,
          lastIdentifierChecked: latestTx && latestTx.length > 0 ? latestTx[0].tx_hash : null,
          network: Network.Mainnet,
          PaymentSourceConfig: {
            create: {
              rpcProviderApiKey: blockfrostApiKeyMainnet,
              rpcProvider: RPCProvider.Blockfrost
            }
          },
          paymentType: PaymentType.Web3CardanoV1,
          syncInProgress: false,
          FeeReceiverNetworkWallet: {
            create: {
              walletAddress: adminWallet1AddressMainnet,
              order: 1,
            },
          },
          feeRatePermille: fee,
          AdminWallets: {
            create: [
              { walletAddress: adminWallet1AddressMainnet, order: 1 },
              { walletAddress: adminWallet2AddressMainnet, order: 2 },
              { walletAddress: adminWallet3AddressMainnet, order: 3 },
            ],
          },
          HotWallets: {
            createMany: {
              data: [{
                walletVkey: resolvePaymentKeyHash((await purchasingWallet.getUnusedAddresses())[0]),
                walletAddress: (await purchasingWallet.getUnusedAddresses())[0],
                note: "Created by seeding",
                type: HotWalletType.Purchasing,
                secretId: purchasingWalletSecretId.id
              },
              {
                walletVkey: resolvePaymentKeyHash((await sellingWallet.getUnusedAddresses())[0]),
                walletAddress: (await sellingWallet.getUnusedAddresses())[0],
                note: "Created by seeding",
                type: HotWalletType.Selling,
                secretId: sellingWalletSecretId.id,
                collectionAddress: collectionWalletMainnetAddress
              }]
            }
          },
          cooldownTime: cooldownTimeMainnet,
        },
      });
      const { policyId } = await getRegistryScriptV1(smartContractAddress, Network.Mainnet)
      console.log('Contract seeded on mainnet: ' + smartContractAddress + ' added. Registry policyId: ' + policyId);
    } catch (error) {
      console.error(error);
    }
  } else {
    console.log("Smart contract mainnet to monitor is not seeded. Provide ENCRYPTION_KEY and BLOCKFROST_API_KEY_MAINNET in .env")
  }

};
seed(prisma)
  .then(() => {
    prisma.$disconnect();
    console.log('Seed completed');
  })
  .catch((e) => {
    prisma.$disconnect();
    console.error(e);
  });
