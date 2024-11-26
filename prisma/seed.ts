import { Network, PaymentType, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { MeshWallet, resolvePaymentKeyHash } from '@meshsdk/core'
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



  const contractAddress = process.env.PAYMENT_CONTRACT_SOURCE_ADDRESS_CARDANO;
  const registryContractIdentifier = process.env.REGISTRY_POLICY_ID;
  const registryNetwork = process.env.NETWORK;
  const collectionWalletAddress = process.env.COLLECTION_WALLET_ADDRESS;
  const purchaseWalletMnemonic = process.env.PURCHASE_WALLET_MNEMONIC;
  const sellingWalletMnemonic = process.env.SELLING_WALLET_MNEMONIC;
  const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
  const encryptionKey = process.env.ENCRYPTION_KEY;

  const adminWallet1Address = process.env.ADMIN_WALLET1_ADDRESS;
  const adminWallet2Address = process.env.ADMIN_WALLET2_ADDRESS;
  const adminWallet3Address = process.env.ADMIN_WALLET3_ADDRESS;

  const scriptJSON = readFileSync('./smart-contracts/payment/plutus.json', 'utf-8');
  const registryJSON = readFileSync('./smart-contracts/registry/plutus.json', 'utf-8');

  if (registryContractIdentifier != null && encryptionKey != null && registryJSON != null && scriptJSON != null && blockfrostApiKey != null && adminWallet1Address != null && adminWallet2Address != null && adminWallet3Address != null && contractAddress != null && registryNetwork != null && collectionWalletAddress != null && purchaseWalletMnemonic != null && sellingWalletMnemonic != null) {
    try {
      const purchasingWallet = new MeshWallet({
        networkId: registryNetwork === "preprod" ? 0 : registryNetwork === "preview" ? 0 : 1,
        key: {
          type: 'mnemonic',
          words: purchaseWalletMnemonic.split(" "),
        },
      });
      const sellerWallet = new MeshWallet({
        networkId: registryNetwork === "preprod" ? 0 : registryNetwork === "preview" ? 0 : 1,
        key: {
          type: 'mnemonic',
          words: sellingWalletMnemonic.split(" "),
        },
      });
      await prisma.networkHandler.create({
        data: {
          addressToCheck: contractAddress,
          network: registryNetwork === "preprod" ? Network.PREPROD : registryNetwork === "preview" ? Network.PREVIEW : Network.MAINNET,
          blockfrostApiKey: blockfrostApiKey,
          scriptJSON: scriptJSON,
          registryJSON: registryJSON,
          registryIdentifier: registryContractIdentifier,
          paymentType: PaymentType.WEB3_CARDANO_V1,
          isSyncing: true,
          AdminWallets: {
            create: [
              { walletAddress: adminWallet1Address, order: 1 },
              { walletAddress: adminWallet2Address, order: 2 },
              { walletAddress: adminWallet3Address, order: 3 },
            ],
          },
          PurchasingWallets: {
            create: {
              walletVkey: resolvePaymentKeyHash(purchasingWallet.getUnusedAddresses()[0]),
              note: "Created by seeding",
              walletSecret: { create: { secret: encrypt(purchaseWalletMnemonic) } }
            }
          },
          SellingWallet: {
            create: {
              walletVkey: resolvePaymentKeyHash(sellerWallet.getUnusedAddresses()[0]),
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
      console.log('Network check for contract ' + contractAddress + ' added');
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
