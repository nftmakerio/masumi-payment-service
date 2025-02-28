import {
  OnChainState,
  PaymentAction,
  PaymentErrorType,
  TransactionStatus,
} from '@prisma/client';
import { Sema } from 'async-sema';
import { prisma } from '@/utils/db';
import {
  Asset,
  BlockfrostProvider,
  deserializeDatum,
  SLOT_CONFIG_NETWORK,
  Transaction,
  unixTimeToEnclosingSlot,
} from '@meshsdk/core';
import { logger } from '@/utils/logger';
import { getPaymentScriptFromPaymentSourceV1 } from '@/utils/generator/contract-generator';
import { convertNetwork } from '@/utils/converter/network-convert';
import { generateWalletExtended } from '@/utils/generator/wallet-generator';
import { decodeV1ContractDatum } from '@/utils/converter/string-datum-convert';
import { lockAndQueryPayments } from '@/utils/db/lock-and-query-payments';
import { convertErrorString } from '@/utils/converter/error-string-convert';
import { advancedRetryAll, delayErrorResolver } from 'advanced-retry';

const updateMutex = new Sema(1);

export async function collectOutstandingPaymentsV1() {
  //const maxBatchSize = 10;

  const acquiredMutex = await updateMutex.tryAcquire();
  //if we are already performing an update, we wait for it to finish and return
  if (!acquiredMutex) return await updateMutex.acquire();

  try {
    const paymentContractsWithWalletLocked = await lockAndQueryPayments({
      paymentStatus: PaymentAction.WithdrawRequested,
      resultHash: { not: '' },
      externalDisputeUnlockTime: { lte: Date.now() - 1000 * 60 * 1 },
      onChainState: { in: [OnChainState.ResultSubmitted] },
    });

    await Promise.allSettled(
      paymentContractsWithWalletLocked.map(async (paymentContract) => {
        if (paymentContract.PaymentRequests.length == 0) return;

        logger.info(
          `Collecting ${paymentContract.PaymentRequests.length} payments for payment source ${paymentContract.id}`,
        );

        const network = convertNetwork(paymentContract.network);

        const blockchainProvider = new BlockfrostProvider(
          paymentContract.PaymentSourceConfig.rpcProviderApiKey,
          undefined,
        );

        const paymentRequests = paymentContract.PaymentRequests;

        if (paymentRequests.length == 0) return;

        const results = await advancedRetryAll({
          errorResolvers: [
            delayErrorResolver({
              configuration: {
                maxRetries: 5,
                backoffMultiplier: 5,
                initialDelayMs: 500,
                maxDelayMs: 7500,
              },
            }),
          ],
          operations: paymentRequests.map((request) => async () => {
            if (request.SmartContractWallet == null)
              throw new Error('Smart contract wallet not found');

            const { wallet, utxos, address } = await generateWalletExtended(
              paymentContract.network,
              paymentContract.PaymentSourceConfig.rpcProviderApiKey,
              request.SmartContractWallet.Secret.encryptedMnemonic,
            );

            if (utxos.length === 0) {
              //this is if the seller wallet is empty
              throw new Error('No UTXOs found in the wallet. Wallet is empty.');
            }

            const { script, smartContractAddress } =
              await getPaymentScriptFromPaymentSourceV1(paymentContract);

            const txHash = request.CurrentTransaction?.txHash;
            if (txHash == null) {
              throw new Error('Transaction hash not found');
            }

            const utxoByHash = await blockchainProvider.fetchUTxOs(txHash);

            const utxo = utxoByHash.find((utxo) => utxo.input.txHash == txHash);

            if (!utxo) {
              throw new Error('UTXO not found');
            }

            const utxoDatum = utxo.output.plutusData;
            if (!utxoDatum) {
              throw new Error('No datum found in UTXO');
            }

            const decodedDatum = deserializeDatum(utxoDatum);
            const decodedContract = decodeV1ContractDatum(decodedDatum);
            if (decodedContract == null) {
              throw new Error('Invalid datum');
            }

            const redeemer = {
              data: {
                alternative: 0,
                fields: [],
              },
            };
            const invalidBefore =
              unixTimeToEnclosingSlot(
                Date.now() - 150000,
                SLOT_CONFIG_NETWORK[network],
              ) - 1;

            const invalidAfter =
              unixTimeToEnclosingSlot(
                Date.now() + 150000,
                SLOT_CONFIG_NETWORK[network],
              ) + 1;

            const remainingAssets: { [key: string]: Asset } = {};
            const feeAssets: { [key: string]: Asset } = {};
            for (const assetValue of utxo.output.amount) {
              const assetKey = assetValue.unit;
              let minFee = 0;
              if (assetValue.unit == 'lovelace') {
                minFee = 1435230;
              }
              const value = BigInt(assetValue.quantity);
              const feeValue = BigInt(
                Math.max(
                  minFee,
                  (Number(value) * paymentContract.feeRatePermille) / 1000,
                ),
              );
              const remainingValue = value - feeValue;
              const remainingValueAsset: Asset = {
                unit: assetValue.unit,
                quantity: remainingValue.toString(),
              };
              if (BigInt(remainingValueAsset.quantity) > 0) {
                remainingAssets[assetKey] = remainingValueAsset;
              } else {
                delete remainingAssets[assetKey];
              }
              const feeValueAsset: Asset = {
                unit: assetValue.unit,
                quantity: feeValue.toString(),
              };
              if (BigInt(feeValueAsset.quantity) > 0) {
                feeAssets[assetKey] = feeValueAsset;
              } else {
                delete feeAssets[assetKey];
              }
            }

            let collectionAddress =
              request.SmartContractWallet.collectionAddress;
            if (collectionAddress == null || collectionAddress == '') {
              collectionAddress = request.SmartContractWallet.walletAddress;
            }

            const unsignedTx = new Transaction({
              initiator: wallet,
              fetcher: blockchainProvider,
            })
              .setMetadata(674, {
                msg: ['Masumi', 'Completed'],
              })
              .redeemValue({
                value: utxo,
                script: script,
                redeemer: redeemer,
              })
              .sendAssets(
                {
                  address: collectionAddress,
                },
                Object.values(remainingAssets),
              )
              .sendAssets(
                {
                  address:
                    paymentContract.FeeReceiverNetworkWallet.walletAddress,
                },
                Object.values(feeAssets),
              )
              .setChangeAddress(address)
              .setRequiredSigners([address]);

            unsignedTx.txBuilder.invalidBefore(invalidBefore);
            unsignedTx.txBuilder.invalidHereafter(invalidAfter);

            const buildTransaction = await unsignedTx.build();
            const signedTx = await wallet.signTx(buildTransaction);
            await prisma.paymentRequest.update({
              where: { id: request.id },
              data: {
                NextAction: {
                  update: {
                    requestedAction: PaymentAction.WithdrawInitiated,
                  },
                },
              },
            });
            //submit the transaction to the blockchain
            const newTxHash = await wallet.submitTx(signedTx);

            await prisma.paymentRequest.update({
              where: { id: request.id },
              data: {
                CurrentTransaction: {
                  update: {
                    txHash: newTxHash,
                    status: TransactionStatus.Pending,
                    BlocksWallet: {
                      connect: {
                        id: request.SmartContractWallet.id,
                      },
                    },
                  },
                },
                TransactionHistory: {
                  connect: {
                    id: request.CurrentTransaction!.id,
                  },
                },
              },
            });
            logger.debug(`Created withdrawal transaction:
                  Tx ID: ${txHash}
                  View (after a bit) on https://${
                    network === 'preprod' ? 'preprod.' : ''
                  }cardanoscan.io/transaction/${txHash}
                  Smart Contract Address: ${smartContractAddress}
              `);
            return true;
          }),
        });
        let index = 0;
        for (const result of results) {
          const request = paymentRequests[index];
          if (result.success == false || result.result != true) {
            const error = result.error;
            logger.error(`Error collecting payments ${request.id}`, {
              error: error,
            });
            await prisma.paymentRequest.update({
              where: { id: request.id },
              data: {
                NextAction: {
                  update: {
                    requestedAction: PaymentAction.WaitingForManualAction,
                    errorType: PaymentErrorType.Unknown,
                    errorNote:
                      'Collecting payments failed: ' +
                      convertErrorString(error),
                  },
                },
                SmartContractWallet: {
                  update: {
                    lockedAt: null,
                  },
                },
              },
            });
          }
          index++;
        }
      }),
    );
  } catch (error) {
    logger.error('Error collecting outstanding payments', { error: error });
  } finally {
    //library is strange as we can release from any non-acquired semaphore
    updateMutex.release();
  }
}

export const cardanoCollectionHandlerService = { collectOutstandingPaymentsV1 };
