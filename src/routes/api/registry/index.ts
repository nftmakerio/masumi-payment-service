import { payAuthenticatedEndpointFactory } from '@/utils/endpoint-factory/pay-authenticated';
import { z } from 'zod';
import { $Enums } from '@prisma/client';
import { prisma } from '@/utils/db';
import createHttpError from 'http-errors';
import { applyParamsToScript, BlockfrostProvider, MeshWallet, PlutusScript, resolvePlutusScriptAddress, Transaction } from '@meshsdk/core';
import { decrypt } from '@/utils/encryption';
import { blake2b } from 'ethereum-cryptography/blake2b.js';
import { deserializePlutusScript } from '@meshsdk/core-cst';

export const registerAgentSchemaInput = z.object({
    network: z.nativeEnum($Enums.Network),
    address: z.string().max(250),
    name: z.string().max(62),
    description: z.string().max(62),
    companyName: z.string().max(62),
    capabilityName: z.string().max(62),
    capabilityVersion: z.string().max(62),
    capabilityDescription: z.string().max(62),
    apiUrl: z.string().max(62),
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
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.address } }, include: { AdminWallets: true, SellingWallet: { include: { walletSecret: true } } } })
        if (networkCheckSupported == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }

        if (networkCheckSupported.SellingWallet == null) {
            throw createHttpError(404, "Selling Wallet not found")
        }

        const blockchainProvider = new BlockfrostProvider(
            networkCheckSupported.blockfrostApiKey,
        )

        const wallet = new MeshWallet({
            networkId: 0,
            fetcher: blockchainProvider,
            submitter: blockchainProvider,
            key: {
                type: 'mnemonic',
                words: decrypt(networkCheckSupported.SellingWallet.walletSecret.secret!).split(" "),
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

        const tx = new Transaction({ initiator: wallet }).setTxInputs([
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
                    name: input.name,
                    api_url: input.apiUrl,
                    description: input.description,
                    company_name: input.companyName,
                    capability_name: input.capabilityName,
                    capability_version: input.capabilityVersion,
                    capability_description: input.capabilityDescription,
                    paymentContract: input.address
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
        const networkCheckSupported = await prisma.networkHandler.findUnique({ where: { network_addressToCheck: { network: input.network, addressToCheck: input.address } }, include: { AdminWallets: true, SellingWallet: { include: { walletSecret: true } } } })
        if (networkCheckSupported == null) {
            throw createHttpError(404, "Network and Address combination not supported")
        }
        if (networkCheckSupported.SellingWallet == null) {
            throw createHttpError(404, "Selling Wallet not found")
        }
        const blockchainProvider = new BlockfrostProvider(
            networkCheckSupported.blockfrostApiKey,
        )

        const wallet = new MeshWallet({
            networkId: 0,
            fetcher: blockchainProvider,
            submitter: blockchainProvider,
            key: {
                type: 'mnemonic',
                words: decrypt(networkCheckSupported.SellingWallet.walletSecret.secret!).split(" "),
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
        const tx = new Transaction({ initiator: wallet }).setTxInputs(utxos);

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