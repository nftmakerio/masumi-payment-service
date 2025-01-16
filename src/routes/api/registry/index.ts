import { payAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/pay-authenticated';
import { z } from 'zod';
import { $Enums } from '@prisma/client';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';
import { applyParamsToScript, BlockfrostProvider, MeshWallet, PlutusScript, resolvePlutusScriptAddress, Transaction } from '@meshsdk/core';
import { decrypt } from '@/utils/encryption';
import { blake2b } from 'ethereum-cryptography/blake2b.js';
import { deserializePlutusScript, resolvePaymentKeyHash } from '@meshsdk/core-cst';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';

export const registerAgentSchemaInput = z.object({
    network: z.nativeEnum($Enums.Network),
    paymentContractAddress: z.string().max(250),
    sellingWalletVkey: z.string().max(250).optional(),
    tags: z.array(z.string().max(250)).max(5),
    image: z.string().max(62),
    //name can be freely chosen
    name: z.string().max(250),
    api_url: z.string().max(250),
    description: z.string().max(250),
    company_name: z.string().max(250),
    capability: z.object({ name: z.string().max(250), version: z.string().max(250) }),
    requests_per_hour: z.string().max(250),
    pricing: z.array(z.object({
        asset_id: z.string().max(62),
        policy_id: z.string().max(62),
        quantity: z.string().max(20),
    })).max(5),
})

export const registerAgentSchemaOutput = z.object({
    txHash: z.string(),
});

export const registerAgentPost = payAuthenticatedEndpointFactory.build({
    method: "post",
    input: registerAgentSchemaInput,
    output: registerAgentSchemaOutput,
    handler: async ({ input, logger }) => {
        logger.info("Registering Agent", input.paymentTypes);
        const networkCheckSupported = await prisma.networkHandler.findUnique({
            where: {
                network_addressToCheck: {
                    network: input.network,
                    addressToCheck: input.paymentContractAddress
                }
            }, include: { AdminWallets: true, SellingWallets: { include: { walletSecret: true } } }
        })
        if (networkCheckSupported == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }

        if (networkCheckSupported.SellingWallets == null || networkCheckSupported.SellingWallets.length == 0) {
            throw createHttpError(404, "No Selling Wallets found")
        }

        const blockchainProvider = new BlockfrostProvider(
            networkCheckSupported.blockfrostApiKey,
        )

        let sellingWallet = networkCheckSupported.SellingWallets.find(wallet => wallet.walletVkey == input.sellingWalletVkey)
        if (sellingWallet == null) {
            if (input.sellingWalletVkey != null) {
                throw createHttpError(404, "Selling Wallet not found")
            }
            const randomIndex = Math.floor(Math.random() * networkCheckSupported.SellingWallets.length)
            sellingWallet = networkCheckSupported.SellingWallets[randomIndex]
        }

        const wallet = new MeshWallet({
            networkId: 0,
            fetcher: blockchainProvider,
            submitter: blockchainProvider,
            key: {
                type: 'mnemonic',
                words: decrypt(sellingWallet.walletSecret.secret!).split(" "),
            },
        });

        const address = (await wallet.getUsedAddresses())[0];

        const blueprint = JSON.parse(networkCheckSupported.registryJSON);

        const script = {
            code: applyParamsToScript(blueprint.validators[0].compiledCode, [
                networkCheckSupported.addressToCheck,
            ]),
            version: 'V3',
        } as PlutusScript;

        const utxos = await wallet.getUtxos();
        if (utxos.length === 0) {
            throw new Error('No UTXOs found for the wallet');
        }

        const firstUtxo = utxos[0];

        const txId = firstUtxo.input.txHash;
        const txIndex = firstUtxo.input.outputIndex;
        const serializedOutput = txId + txIndex.toString(16).padStart(8, '0');

        const serializedOutputUint8Array = new Uint8Array(
            Buffer.from(serializedOutput.toString(), 'hex'),
        );
        // Hash the serialized output using blake2b_256
        const blake2b256 = blake2b(serializedOutputUint8Array, 32);
        const assetName = Buffer.from(blake2b256).toString('hex');

        const redeemer = {
            data: { alternative: 0, fields: [] },
            tag: 'MINT',
        };

        const policyId = deserializePlutusScript(script.code, script.version)
            .hash()
            .toString();

        const tx = new Transaction({ initiator: wallet }).setMetadata(674, {
            msg: ["Masumi", "RegisterAgent"],
        }).setTxInputs([
            //ensure our first utxo hash (serializedOutput) is used as first input
            firstUtxo,
            ...utxos.slice(1),
        ]);

        tx.isCollateralNeeded = true;

        //setup minting data separately as the minting function does not work well with hex encoded strings without some magic
        tx.txBuilder
            .mintPlutusScript(script.version)
            .mint('1', policyId, assetName)
            .mintingScript(script.code)
            .mintRedeemerValue(redeemer.data, 'Mesh');

        //setup the metadata
        tx.setMetadata(721, {
            [policyId]: {
                [assetName]: {
                    tags: [input.tags.map(tag => stringToMetadata(tag))],
                    image: input.image,
                    name: stringToMetadata(input.name),
                    api_url: stringToMetadata(input.api_url),
                    description: stringToMetadata(input.description),
                    company_name: stringToMetadata(input.company_name),
                    capability: { name: stringToMetadata(input.capability.name), version: stringToMetadata(input.capability.version) },
                    requests_per_hour: stringToMetadata(input.requests_per_hour),
                    pricing: input.pricing.map(pricing => ({
                        asset_id: pricing.asset_id,
                        policy_id: pricing.policy_id,
                        quantity: pricing.quantity,
                    })),
                },
            },
        });
        //send the minted asset to the address where we want to receive payments
        tx.sendAssets(address, [{ unit: policyId + assetName, quantity: '1' }])
            //used to defrag for further transactions
            .sendLovelace(address, '120000000');
        //sign the transaction with our address
        tx.setRequiredSigners([address]).setChangeAddress(address);
        //build the transaction
        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        //submit the transaction to the blockchain, it can take a bit until the transaction is confirmed and found on the explorer
        const txHash = await wallet.submitTx(signedTx);

        logger.info(`Minted 1 asset with the contract at:
            Tx ID: ${txHash}
            AssetName: ${assetName}
            PolicyId: ${policyId}
            AssetId: ${policyId + assetName}
            Address: ${resolvePlutusScriptAddress(script, 0)}
        `);

        return { txHash }
    },
});

function stringToMetadata(s: string) {
    //split every 50 characters
    const arr = []
    for (let i = 0; i < s.length; i += 50) {
        arr.push(s.slice(i, i + 50))
    }
    return arr
}


export const unregisterAgentSchemaInput = z.object({

    assetName: z.string().max(250),
    network: z.nativeEnum($Enums.Network),
    address: z.string().max(250),
})

export const unregisterAgentSchemaOutput = z.object({
    txHash: z.string(),
});

export const unregisterAgentDelete = payAuthenticatedEndpointFactory.build({
    method: "delete",
    input: unregisterAgentSchemaInput,
    output: unregisterAgentSchemaOutput,
    handler: async ({ input, logger }) => {
        logger.info("Deregister Agent", input.paymentTypes);
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.address } }, include: { AdminWallets: true, SellingWallets: { include: { walletSecret: true } } } })
        if (networkCheckSupported == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }
        if (networkCheckSupported.SellingWallets == null || networkCheckSupported.SellingWallets.length == 0) {
            throw createHttpError(404, "Selling Wallet not found")
        }
        const blockchainProvider = new BlockfrostProvider(
            networkCheckSupported.blockfrostApiKey,
        )
        const blockfrost = new BlockFrostAPI({
            projectId: networkCheckSupported.blockfrostApiKey,
        })
        const blueprintRegistry = JSON.parse(networkCheckSupported.registryJSON);
        const registryScript = {
            code: applyParamsToScript(blueprintRegistry.validators[0].compiledCode, [
                networkCheckSupported.addressToCheck,
            ]),
            version: 'V3',
        } as PlutusScript;
        const policyIdRegistry = deserializePlutusScript(registryScript.code, registryScript.version).hash().toString()
        const holderWallet = await blockfrost.assetsAddresses(policyIdRegistry + input.assetName, { order: "desc", count: 1 })
        if (holderWallet.length == 0) {
            throw createHttpError(404, "Asset not found")
        }
        const vkey = resolvePaymentKeyHash(holderWallet[0].address)

        const sellingWallet = networkCheckSupported.SellingWallets.find(wallet => wallet.walletVkey == vkey)
        if (sellingWallet == null) {
            throw createHttpError(404, "Registered Wallet not found")
        }
        const wallet = new MeshWallet({
            networkId: 0,
            fetcher: blockchainProvider,
            submitter: blockchainProvider,
            key: {
                type: 'mnemonic',
                words: decrypt(sellingWallet.walletSecret.secret!).split(" "),
            },
        });

        const address = (await wallet.getUsedAddresses())[0];

        const blueprint = JSON.parse(networkCheckSupported.registryJSON);

        const script = {
            code: applyParamsToScript(blueprint.validators[0].compiledCode, [
                networkCheckSupported.addressToCheck,
            ]),
            version: 'V3',
        } as PlutusScript;

        const utxos = await wallet.getUtxos();
        if (utxos.length === 0) {
            throw new Error('No UTXOs found for the wallet');
        }

        //configure the asset to be burned here
        const assetName = input.assetName;

        const redeemer = {
            data: { alternative: 1, fields: [] },
        };
        const policyId = deserializePlutusScript(script.code, script.version)
            .hash()
            .toString();
        const tx = new Transaction({ initiator: wallet }).setMetadata(674, {
            msg: ["Masumi", "DeregisterAgent"],
        }).setTxInputs(utxos);

        tx.isCollateralNeeded = true;

        //setup minting data separately as the minting function does not work well with hex encoded strings without some magic
        tx.txBuilder
            .mintPlutusScript(script.version)
            .mint('-1', policyId, assetName)
            .mintingScript(script.code)
            .mintRedeemerValue(redeemer.data, 'Mesh');
        //send the minted asset to the address where we want to receive payments
        //used to defrag for further transactions
        tx.sendLovelace(address, '120000000');
        //sign the transaction with our address
        tx.setRequiredSigners([address]).setChangeAddress(address);
        //build the transaction
        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        //submit the transaction to the blockchain, it can take a bit until the transaction is confirmed and found on the explorer
        const txHash = await wallet.submitTx(signedTx);

        console.log(`Burned 1 asset with the contract at:
    Tx ID: ${txHash}
    AssetName: ${assetName}
    PolicyId: ${policyId}
    Address: ${resolvePlutusScriptAddress(script, 0)}
`);
        return { txHash }
    },
});