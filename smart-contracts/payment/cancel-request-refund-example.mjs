import cbor from 'cbor';
import {
  resolvePlutusScriptAddress,
  resolvePaymentKeyHash,
  KoiosProvider,
  SLOT_CONFIG_NETWORK,
  MeshWallet,
  Transaction,
  unixTimeToEnclosingSlot,
  mBool,
  applyParamsToScript,
} from '@meshsdk/core';
import fs from 'node:fs';
import 'dotenv/config';

console.log('Cancel requesting refund as example');
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

const address = wallet.getUsedAddresses()[0];
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
async function fetchUtxo(txHash) {
  const utxos = await blockchainProvider.fetchAddressUTxOs(
    resolvePlutusScriptAddress(script, 0),
  );

  return utxos.find((utxo) => {
    return utxo.input.txHash == txHash;
  });
}
const utxo = await fetchUtxo(
  'bd15848a1b245eb94f83a0e1ef337b18640a337193e9d1f95be1ec8f7aab4d55',
);

if (!utxo) {
  throw new Error('UTXO not found');
}

const buyer = wallet.getUsedAddresses()[0];
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
const hash = decodedDatum.value[3];
const unlockTime = decodedDatum.value[4];
const refundTime = decodedDatum.value[5];

const datum = {
  value: {
    alternative: 0,
    fields: [
      buyerVerificationKeyHash,
      sellerVerificationKeyHash,
      'test',
      hash.toString('hex'),
      unlockTime,
      refundTime,
      //is converted to true
      mBool(false),
      //is converted to false
      mBool(false),
    ],
  },
  inline: true,
};
/*
//this will only work after the unlock time
  Withdraw
  //this will set the refund_requested to True and auto approved after the refund time, can only be called before the unlock time
  RequestRefund
  //this will cancel any refund request and unlock the funds (immediately if the unlock time is over)
  CancelRefundRequest
  //is implicitly allowed if the refund was requested and the refund time is over (and not denied)
  WithdrawRefund
  //this will set the refund_denied to True and prevent any withdrawal
  DenyRefund
*/
const redeemer = {
  data: {
    alternative: 2,
    fields: [],
  },
};
const invalidBefore =
  unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK.preprod) - 1;
const invalidHereafter =
  unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK.preprod) + 1;
//console.log(utxo);

const unsignedTx = new Transaction({ initiator: wallet })
  .redeemValue({
    value: utxo,
    script: script,
    redeemer: redeemer,
    //datum: datum,
  })
  .sendValue(
    { address: resolvePlutusScriptAddress(script, 0), datum: datum },
    utxo,
  )
  .setChangeAddress(address)
  .setRequiredSigners([address]);

unsignedTx.txBuilder.invalidBefore(invalidBefore);
unsignedTx.txBuilder.invalidHereafter(invalidHereafter);
const buildTransaction = await unsignedTx.build();
const signedTx = await wallet.signTx(buildTransaction);

//submit the transaction to the blockchain
const txHash = await wallet.submitTx(signedTx);

console.log(`Created withdrawal transaction:
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
