import { $Enums } from "@prisma/client";
import { Sema } from "async-sema";
import { prisma } from '@/utils/db';
import { BlockfrostProvider, Data, MeshWallet, PlutusScript, SLOT_CONFIG_NETWORK, Transaction, applyParamsToScript, mBool, resolvePaymentKeyHash, resolvePlutusScriptAddress, resolveStakeKeyHash, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { decrypt } from "@/utils/encryption";
import { logger } from "@/utils/logger";
import * as cbor from "cbor";

const updateMutex = new Sema(1);

export async function submitResultV1() {

    //const maxBatchSize = 10;

    const acquiredMutex = await updateMutex.tryAcquire();
    //if we are already performing an update, we wait for it to finish and return
    if (!acquiredMutex)
        return await updateMutex.acquire();

    try {
        const networkChecksWithWalletLocked = await prisma.$transaction(async (prisma) => {
            const networkChecks = await prisma.networkHandler.findMany({
                where: {
                    paymentType: "WEB3_CARDANO_V1",
                }, include: {
                    PaymentRequests: {
                        where: {
                            //the smart contract requires the result hash to be provided before the result time
                            submitResultTime: {
                                lte: Date.now() - 1000 * 60 * 1 //remove 1 minute for block time
                            }
                            , status: { in: ["PaymentConfirmed", "RefundRequested"] },
                            resultHash: { not: null },
                            errorType: null,
                            smartContractWallet: { pendingTransaction: null }
                        },
                        include: { buyerWallet: true, smartContractWallet: { include: { walletSecret: true } } }
                    },
                    AdminWallets: true,
                    FeeReceiverNetworkWallet: true,
                    CollectionWallet: true
                }
            })
            const sellingWalletIds = networkChecks.map(x => x.PaymentRequests).flat().map(x => x.smartContractWallet?.id);
            for (const sellingWalletId of sellingWalletIds) {
                await prisma.sellingWallet.update({
                    where: { id: sellingWalletId },
                    data: { pendingTransaction: { create: { hash: null } } }
                })
            }
            return networkChecks;
        }, { isolationLevel: "Serializable" });
        await Promise.allSettled(networkChecksWithWalletLocked.map(async (networkCheck) => {

            if (networkCheck.PaymentRequests.length == 0 || networkCheck.CollectionWallet == null)
                return;

            const network = networkCheck.network == "MAINNET" ? "mainnet" : networkCheck.network == "PREPROD" ? "preprod" : networkCheck.network == "PREVIEW" ? "preview" : null;
            if (!network)
                throw new Error("Invalid network")

            const networkId = networkCheck.network == "MAINNET" ? 0 : networkCheck.network == "PREPROD" ? 1 : networkCheck.network == "PREVIEW" ? 2 : null;
            if (!networkId)
                throw new Error("Invalid network")

            const blockchainProvider = new BlockfrostProvider(networkCheck.blockfrostApiKey, undefined);


            const paymentRequests = networkCheck.PaymentRequests;

            if (paymentRequests.length == 0)
                return;
            //we can only allow one transaction per wallet
            const deDuplicatedRequests: ({ buyerWallet: { id: string; createdAt: Date; updatedAt: Date; walletVkey: string; networkHandlerId: string; note: string | null; } | null; smartContractWallet: ({ walletSecret: { id: string; createdAt: Date; updatedAt: Date; secret: string; }; } & { id: string; createdAt: Date; updatedAt: Date; walletVkey: string; walletSecretId: string; pendingTransactionId: string | null; networkHandlerId: string; note: string | null; }) | null; } & { id: string; createdAt: Date; updatedAt: Date; lastCheckedAt: Date | null; status: $Enums.PaymentRequestStatus; errorType: $Enums.PaymentRequestErrorType | null; checkedById: string; smartContractWalletId: string | null; buyerWalletId: string | null; identifier: string; resultHash: string | null; submitResultTime: bigint; unlockTime: bigint; refundTime: bigint; utxo: string | null; txHash: string | null; potentialTxHash: string | null; errorRetries: number; errorNote: string | null; errorRequiresManualReview: boolean | null; })[] = []
            for (const request of paymentRequests) {
                if (deDuplicatedRequests.some(r => r.smartContractWalletId == request.smartContractWalletId))
                    continue;

                deDuplicatedRequests.push(request);
            }

            await Promise.allSettled(deDuplicatedRequests.map(async (request) => {
                try {
                    const sellingWallet = request.smartContractWallet!;
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
                    const script: PlutusScript = {
                        code: applyParamsToScript(blueprint.validators[0].compiledCode, [
                            [
                                resolvePaymentKeyHash(admin1),
                                resolvePaymentKeyHash(admin2),
                                resolvePaymentKeyHash(admin3),
                            ],
                            //yes I love meshJs
                            {
                                alternative: 0,
                                fields: [
                                    {
                                        alternative: 0,
                                        fields: [resolvePaymentKeyHash(admin1)],
                                    },
                                    {
                                        alternative: 0,
                                        fields: [
                                            {
                                                alternative: 0,
                                                fields: [
                                                    {
                                                        alternative: 0,
                                                        fields: [resolveStakeKeyHash(networkCheck.FeeReceiverNetworkWallet.walletAddress)],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                            networkCheck.FeePermille,
                        ]),
                        version: "V3"
                    };

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


                    const buyerVerificationKeyHash = request.buyerWallet?.walletVkey;
                    const sellerVerificationKeyHash = request.smartContractWallet!.walletVkey;

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
                    const submitResultTime = decodedDatum.value[4];
                    const unlockTime = decodedDatum.value[5];
                    const refundTime = decodedDatum.value[6];

                    const datum = {
                        value: {
                            alternative: 0,
                            fields: [
                                buyerVerificationKeyHash,
                                sellerVerificationKeyHash,
                                request.identifier,
                                request.resultHash,
                                submitResultTime,
                                unlockTime,
                                refundTime,
                                //is converted to false
                                mBool(false),
                                //is converted to false
                                mBool(true),
                            ],
                        } as Data,
                        inline: true,
                    };

                    const redeemer = {
                        data: {
                            alternative: 5,
                            fields: [],
                        },
                    };
                    const invalidBefore =
                        unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK[network]) - 1;

                    const invalidAfter =
                        unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK[network]) + 1;

                    const unsignedTx = new Transaction({ initiator: wallet }).setMetadata(674, {
                        msg: ["Masumi", "SubmitResult"],
                    })
                        .redeemValue({
                            value: utxo,
                            script: script,
                            redeemer: redeemer,
                        })
                        .sendAssets(
                            {
                                address: networkCheck.FeeReceiverNetworkWallet.walletAddress,
                                datum: datum,
                            },
                            utxo.output.amount
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
                        where: { id: request.id }, data: { potentialTxHash: txHash, status: $Enums.PaymentRequestStatus.CompletedInitiated, smartContractWallet: { update: { pendingTransaction: { create: { hash: txHash } } } } }
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
                    logger.error(`Error creating refund transaction: ${error}`);
                    if (request.errorRetries == null || request.errorRetries < networkCheck.maxCollectRefundRetries) {
                        await prisma.paymentRequest.update({
                            where: { id: request.id }, data: { errorRetries: { increment: 1 } }
                        })
                    } else {
                        const errorMessage = "Error creating refund transaction: " + (error instanceof Error ? error.message :
                            (typeof error === 'object' && error ? error.toString() : "Unknown Error"));
                        await prisma.paymentRequest.update({
                            where: { id: request.id },
                            data: {
                                errorType: "UNKNOWN",
                                errorRequiresManualReview: true,
                                errorNote: errorMessage
                            }
                        })
                    }
                }
            }))
        }))

    }
    finally {
        //library is strange as we can release from any non-acquired semaphore
        updateMutex.release()
    }
}

export const cardanoSubmitResultHandlerService = { submitResultV1 }
