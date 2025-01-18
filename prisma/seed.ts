import { Network, PaymentType, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { MeshWallet, resolvePaymentKeyHash, resolvePlutusScriptAddress, resolveStakeKeyHash, PlutusScript, applyParamsToScript } from '@meshsdk/core'
import { encrypt } from './../src/utils/encryption';

dotenv.config();
const prisma = new PrismaClient();
export const seed = async (prisma: PrismaClient) => {

  const adminKey = process.env.ADMIN_KEY;
  if (adminKey != null) {
    if (adminKey.length < 15) throw Error('API-KEY is insecure');

    await prisma.apiKey.upsert({
      create: { apiKey: adminKey, permission: 'ADMIN', status: 'ACTIVE' },
      update: { apiKey: adminKey, permission: 'ADMIN', status: 'ACTIVE' },
      where: { apiKey: adminKey },
    });

    console.log('ADMIN_KEY added');
  } else {
    console.log('ADMIN_KEY is skipped');
  }

  const registryNetwork = process.env.NETWORK?.toLowerCase();
  let collectionWalletAddress = process.env.COLLECTION_WALLET_ADDRESS;
  let purchaseWalletMnemonic = process.env.PURCHASE_WALLET_MNEMONIC;
  if (!purchaseWalletMnemonic) {
    const secret_key = MeshWallet.brew(false) as string[];
    purchaseWalletMnemonic = secret_key.join(" ");
  }
  let sellingWalletMnemonic = process.env.SELLING_WALLET_MNEMONIC;
  if (!sellingWalletMnemonic) {
    const secret_key = MeshWallet.brew(false) as string[];
    sellingWalletMnemonic = secret_key.join(" ");
  }
  if (!collectionWalletAddress) {
    const sellingWallet = new MeshWallet({
      networkId: registryNetwork === "preprod" ? 0 : registryNetwork === "preview" ? 0 : 1,
      key: {
        type: 'mnemonic',
        words: sellingWalletMnemonic.split(" "),
      },
    });
    collectionWalletAddress = (await sellingWallet.getUnusedAddresses())[0];
  }
  const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
  const encryptionKey = process.env.ENCRYPTION_KEY;

  const adminWallet1Address = process.env.ADMIN_WALLET1_ADDRESS;
  const adminWallet2Address = process.env.ADMIN_WALLET2_ADDRESS;
  const adminWallet3Address = process.env.ADMIN_WALLET3_ADDRESS;

  const feeWalletAddress = process.env.FEE_WALLET_ADDRESS;
  const feePermille = process.env.FEE_PERMILLE;

  const scriptJSON = readFileSync('./smart-contracts/payment/plutus.json', 'utf-8');

  if (encryptionKey != null && scriptJSON != null && blockfrostApiKey != null && adminWallet1Address != null && adminWallet2Address != null && adminWallet3Address != null && feeWalletAddress != null && feePermille != null && registryNetwork != null && collectionWalletAddress != null) {

    const blueprint = JSON.parse(scriptJSON)

    const fee = parseInt(feePermille)
    if (fee < 0 || fee > 1000) throw Error("Fee permille is not valid")


    const script: PlutusScript = {
      code: applyParamsToScript(blueprint.validators[0].compiledCode, [
        [
          resolvePaymentKeyHash(adminWallet1Address),
          resolvePaymentKeyHash(adminWallet2Address),
          resolvePaymentKeyHash(adminWallet3Address),
        ],
        //yes I love meshJs
        {
          alternative: 0,
          fields: [
            {
              alternative: 0,
              fields: [resolvePaymentKeyHash(feeWalletAddress)],
            },
            {
              alternative: 0,
              fields: [
                {
                  alternative: 0,
                  fields: [
                    {
                      alternative: 0,
                      fields: [resolveStakeKeyHash(feeWalletAddress)],
                    },
                  ],
                },
              ],
            },
          ],
        },
        fee,
      ]),
      version: "V3"
    };
    const smartContractAddress = resolvePlutusScriptAddress(script, registryNetwork === "preprod" ? 0 : registryNetwork === "preview" ? 0 : 1,)

    try {
      const purchasingWallet = new MeshWallet({
        networkId: registryNetwork === "preprod" ? 0 : registryNetwork === "preview" ? 0 : 1,
        key: {
          type: 'mnemonic',
          words: purchaseWalletMnemonic.split(" "),
        },
      });
      const sellingWallet = new MeshWallet({
        networkId: registryNetwork === "preprod" ? 0 : registryNetwork === "preview" ? 0 : 1,
        key: {
          type: 'mnemonic',
          words: sellingWalletMnemonic.split(" "),
        },
      });
      await prisma.networkHandler.create({
        data: {
          addressToCheck: smartContractAddress,
          network: registryNetwork === "preprod" ? Network.PREPROD : registryNetwork === "preview" ? Network.PREVIEW : Network.MAINNET,
          blockfrostApiKey: blockfrostApiKey,
          paymentType: PaymentType.WEB3_CARDANO_V1,
          isSyncing: true,
          FeeReceiverNetworkWallet: {
            create: {
              walletAddress: adminWallet1Address,
              order: 1,
            },
          },
          FeePermille: fee,
          AdminWallets: {
            create: [
              { walletAddress: adminWallet1Address, order: 1 },
              { walletAddress: adminWallet2Address, order: 2 },
              { walletAddress: adminWallet3Address, order: 3 },
            ],
          },
          PurchasingWallets: {
            create: {
              walletVkey: resolvePaymentKeyHash((await purchasingWallet.getUnusedAddresses())[0]),
              note: "Created by seeding",
              walletSecret: { create: { secret: encrypt(purchaseWalletMnemonic) } }
            }
          },
          SellingWallets: {
            create: {
              walletVkey: resolvePaymentKeyHash((await sellingWallet.getUnusedAddresses())[0]),
              note: "Created by seeding",
              walletSecret: { create: { secret: encrypt(sellingWalletMnemonic) } }
            }
          },
          CollectionWallet: {
            create: {
              walletAddress: collectionWalletAddress,
              note: "Created by seeding",
            }
          }
        },
      });
      console.log('Network check for contract ' + smartContractAddress + ' added');
    } catch (error) {
      console.error(error);
    }
  } else {
    console.log("Skipped adding contract to check")
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
