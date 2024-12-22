import { $Enums } from "@prisma/client";
import { Sema } from "async-sema";
import { prisma } from '@/utils/db';
import { BlockfrostProvider, Data, MeshWallet, PlutusScript, SLOT_CONFIG_NETWORK, Transaction, applyParamsToScript, mBool, resolvePaymentKeyHash, resolvePlutusScriptAddress, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { decrypt } from "@/utils/encryption";
import { logger } from "@/utils/logger";
import * as cbor from "cbor";

const updateMutex = new Sema(1);

export async function collectOutstandingRefundV1() {

    //const maxBatchSize = 10;

    const acquiredMutex = await updateMutex.tryAcquire();
    //if we are already performing an update, we wait for it to finish and return
    if (!acquiredMutex)
        return await updateMutex.acquire();

    try {
        const networkChecks = await prisma.networkHandler.findMany({
            where: { paymentType: "WEB3_CARDANO_V1" }, include: {
                PurchaseRequests: {
                    where: {
                        refundRequestTime: {
                            gte: Date.now() + 1000 * 60 * 15 //add 15 minutes for block time
                        }, status: "RefundConfirmed", resultHash: { not: null }
                    },
                    include: { purchaserWallet: true }
                },
                AdminWallets: true,
                SellingWallet: { include: { walletSecret: true } },
                CollectionWallet: true
            }
        })
        await Promise.all(networkChecks.map(async (networkCheck) => {

            if (networkCheck.SellingWallet == null || networkCheck.CollectionWallet == null)
                return;

            const network = networkCheck.network == "MAINNET" ? "mainnet" : networkCheck.network == "PREPROD" ? "preprod" : networkCheck.network == "PREVIEW" ? "preview" : null;
            if (!network)
                throw new Error("Invalid network")

            const networkId = networkCheck.network == "MAINNET" ? 0 : networkCheck.network == "PREPROD" ? 1 : networkCheck.network == "PREVIEW" ? 2 : null;
            if (!networkId)
                throw new Error("Invalid network")

            const blockchainProvider = new BlockfrostProvider(networkCheck.blockfrostApiKey, undefined);


            const paymentRequests = networkCheck.PurchaseRequests;

            if (paymentRequests.length == 0)
                return;
            //we can only allow one transaction per wallet
            const deDuplicatedRequests = [paymentRequests[0]]

            await Promise.all(deDuplicatedRequests.map(async (request) => {
                try {
                    const sellingWallet = networkCheck.SellingWallet!;
                    const encryptedSecret = sellingWallet.walletSecret.secret;

                    const wallet = new MeshWallet({
                        networkId: 0,
                        fetcher: blockchainProvider,
                        submitter: blockchainProvider,
                        key: {
                            type: 'mnemonic',
                            words: decrypt(encryptedSecret).split(" "),
                        },
                    });

                    const address = (await wallet.getUsedAddresses())[0];
                    console.log(address);


                    const blueprint = JSON.parse(networkCheck.scriptJSON);
                    const adminWallets = networkCheck.AdminWallets;
                    const sortedAdminWallets = adminWallets.sort((a, b) => a.order - b.order);
                    if (sortedAdminWallets.length != 3)
                        throw new Error("Invalid admin wallets")

                    const admin1 = sortedAdminWallets[0].walletAddress;
                    const admin2 = sortedAdminWallets[1].walletAddress;
                    const admin3 = sortedAdminWallets[2].walletAddress;
                    const script = {
                        code: applyParamsToScript(blueprint.validators[0].compiledCode, [
                            [
                                resolvePaymentKeyHash(admin1),
                                resolvePaymentKeyHash(admin2),
                                resolvePaymentKeyHash(admin3),
                            ],
                        ]),
                        version: 'V3',
                    } as PlutusScript;

                    const utxos = await wallet.getUtxos();
                    if (utxos.length === 0) {
                        //this is if the seller wallet is empty
                        throw new Error('No UTXOs found in the wallet. Wallet is empty.');
                    }


                    const utxoByHash = await blockchainProvider.fetchUTxOs(
                        request.txHash!,
                    );

                    const utxo = utxoByHash.find((utxo) => utxo.input.txHash == request.txHash);

                    if (!utxo) {
                        throw new Error('UTXO not found');
                    }


                    const buyerVerificationKeyHash = request.purchaserWallet?.walletVkey;
                    const sellerVerificationKeyHash = networkCheck.SellingWallet!.walletVkey;

                    const utxoDatum = utxo.output.plutusData;
                    if (!utxoDatum) {
                        throw new Error('No datum found in UTXO');
                    }

                    const decodedDatum = cbor.decode(Buffer.from(utxoDatum, 'hex'));
                    if (typeof decodedDatum.value[4] !== 'number') {
                        throw new Error('Invalid datum at position 4');
                    }
                    if (typeof decodedDatum.value[5] !== 'number') {
                        throw new Error('Invalid datum at position 5');
                    }
                    const unlockTime = decodedDatum.value[4];
                    const refundTime = decodedDatum.value[5];

                    const datum = {
                        value: {
                            alternative: 0,
                            fields: [
                                buyerVerificationKeyHash,
                                sellerVerificationKeyHash,
                                request.identifier,
                                "",
                                unlockTime,
                                refundTime,
                                //is converted to false
                                mBool(true),
                                //is converted to false
                                mBool(false),
                            ],
                        } as Data,
                        inline: true,
                    };

                    const redeemer = {
                        data: {
                            alternative: 3,
                            fields: [],
                        },
                    };
                    const invalidBefore =
                        unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK[network]) - 1;

                    const invalidAfter =
                        unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK[network]) + 1;

                    const unsignedTx = new Transaction({ initiator: wallet })
                        .redeemValue({
                            value: utxo,
                            script: script,
                            redeemer: redeemer,
                        })
                        .sendLovelace(
                            {
                                address: networkCheck.addressToCheck,
                                datum: datum,
                            },
                            '1435230',
                        )
                        //send to remaining amount the original purchasing wallet
                        .setChangeAddress(address)
                        .setRequiredSigners([address]);

                    unsignedTx.txBuilder.invalidBefore(invalidBefore);
                    unsignedTx.txBuilder.invalidHereafter(invalidAfter);

                    const buildTransaction = await unsignedTx.build();
                    const signedTx = await wallet.signTx(buildTransaction);

                    //submit the transaction to the blockchain
                    const txHash = await wallet.submitTx(signedTx);

                    await prisma.paymentRequest.update({
                        where: { id: request.id }, data: { potentialTxHash: txHash, status: $Enums.PaymentRequestStatus.WithdrawInitiated }
                    })

                    logger.info(`Created withdrawal transaction:
                  Tx ID: ${txHash}
                  View (after a bit) on https://${network === 'preview'
                            ? 'preview.'
                            : network === 'preprod'
                                ? 'preprod.'
                                : ''
                        }cardanoscan.io/transaction/${txHash}
                  Address: ${resolvePlutusScriptAddress(script, 0)}
              `);
                } catch (error) {
                    logger.error(`Error creating withdrawal transaction: ${error}`);
                    await prisma.paymentRequest.update({
                        where: { id: request.id }, data: { status: $Enums.PaymentRequestStatus.Error }
                    })
                }
            }))
        }))

    }
    finally {
        //library is strange as we can release from any non-acquired semaphore
        updateMutex.release()
    }
}

export const cardanoTxHandlerService = { collectOutstandingPaymentsV1: collectOutstandingRefundV1 }