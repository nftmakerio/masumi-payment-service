import {
  resolvePlutusScriptAddress,
  resolvePaymentKeyHash,
  KoiosProvider,
  MeshWallet,
  Transaction,
  mBool,
  applyParamsToScript,
} from '@meshsdk/core';
import fs from 'node:fs';
import 'dotenv/config';

console.log('Locking funds as example');

const network = 'preprod';
const blockchainProvider = new KoiosProvider(network);

const wallet = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: 'mnemonic',
    words: fs.readFileSync('wallet_1.sk').toString().split(' '),
  },
});

const address = (await wallet.getUsedAddresses())[0];
console.log(address);

const blueprint = JSON.parse(fs.readFileSync('./plutus.json'));

const admin1 = fs.readFileSync('wallet_3.addr').toString();
const admin2 = fs.readFileSync('wallet_4.addr').toString();
const admin3 = fs.readFileSync('wallet_5.addr').toString();
const script = {
  code: applyParamsToScript(blueprint.validators[0].compiledCode, [
    [
      resolvePaymentKeyHash(admin1),
      resolvePaymentKeyHash(admin2),
      resolvePaymentKeyHash(admin3),
    ],
  ]),
  version: 'V3',
};

const utxos = await wallet.getUtxos();
if (utxos.length === 0) {
  //this is if the buyer wallet is empty
  throw new Error('No UTXOs found in the wallet. Wallet is empty.');
}

const buyer = (await wallet.getUsedAddresses())[0];
const buyerVerificationKeyHash = resolvePaymentKeyHash(buyer);

const sellerAddress = fs.readFileSync('wallet_2.addr').toString();
const sellerVerificationKeyHash = resolvePaymentKeyHash(sellerAddress);
/*
buyer: VerificationKeyHash,
  seller: VerificationKeyHash,
  referenceId: ByteArray,
  resultHash: ByteArray,
  unlock_time: POSIXTime,
  refund_time: POSIXTime,
  refund_requested: Bool,
  refund_denied: Bool,
*/
//1 minute unlock period
const unlockTime = Date.now() + 1000 * 60 * 30;
//1 hour refund dispute period
const refundTime = Date.now() + 1000 * 60 * 60; //* 24 * 30;
const datum = {
  value: {
    alternative: 0,
    fields: [
      buyerVerificationKeyHash,
      sellerVerificationKeyHash,
      'test',
      '',
      //unlock time is 7 days from now
      unlockTime,
      //refund time is 30 days from now
      refundTime,
      //is converted to false
      mBool(false),
      //is converted to false
      mBool(false),
    ],
  },
  inline: true,
};

const unsignedTx = await new Transaction({ initiator: wallet })
  .sendLovelace(
    {
      address: resolvePlutusScriptAddress(script, 0),
      datum,
    },
    '50000000',
  )
  .setNetwork(network)
  .build();

const signedTx = await wallet.signTx(unsignedTx);

//submit the transaction to the blockchain
const txHash = await wallet.submitTx(signedTx);

console.log(`Created initial transaction:
    Tx ID: ${txHash}
    View (after a bit) on https://${
      network === 'preview'
        ? 'preview.'
        : network === 'preprod'
          ? 'preprod.'
          : ''
    }cardanoscan.io/transaction/${txHash}
    Address: ${resolvePlutusScriptAddress(script, 0)}
`);
