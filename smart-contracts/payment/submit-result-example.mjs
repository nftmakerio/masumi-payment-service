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
  pubKeyAddress,
  integer,
} from '@meshsdk/core';
import fs from 'node:fs';
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { resolveStakeKeyHash } from '@meshsdk/core-cst';
console.log('Submitting result as example');
const network = 'preprod';
const blockchainProvider = new KoiosProvider(network);
const koios = new KoiosProvider('preprod');

const wallet = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: 'mnemonic',
    words: fs.readFileSync('wallet_2.sk').toString().split(' '),
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
                  fields: [resolveStakeKeyHash(admin1)],
                },
              ],
            },
          ],
        },
      ],
    },
    50,
  ]),
  version: 'V3',
};

const utxos = await wallet.getUtxos();
if (utxos.length === 0) {
  //this is if the seller wallet is empty
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
  '269445855f4dfd2b228caba7c705fdb4af30ea6938674a6571d97ebd5022467a',
);

if (!utxo) {
  throw new Error('UTXO not found');
}

const buyerAddress = fs.readFileSync('wallet_1.addr').toString();
const buyerVerificationKeyHash = resolvePaymentKeyHash(buyerAddress);

const sellerAddress = fs.readFileSync('wallet_2.addr').toString();
const sellerVerificationKeyHash = resolvePaymentKeyHash(sellerAddress);

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
const hash = 'abc_hash_of_the_result2';
const submitResultTime = decodedDatum.value[4];
const unlockTime = decodedDatum.value[5];
const refundTime = decodedDatum.value[6];

const datum = {
  value: {
    alternative: 0,
    fields: [
      buyerVerificationKeyHash,
      sellerVerificationKeyHash,
      'test_1238091298389124991297247921793h214bfubasfjklnasvjnsacoinasoidnoiadsnoaiusfniuasdnbiuanwdiu12312ono1i2u4niou12n4iuon21oi4n213321io123n123',
      hash,
      submitResultTime,
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

const redeemer = {
  data: {
    alternative: 6,
    fields: [],
  },
};
const invalidBefore =
  unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK.preprod) - 1;

const invalidAfter =
  unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK.preprod) + 1;

const unsignedTx = new Transaction({ initiator: wallet, fetcher: koios })
  .redeemValue({
    value: utxo,
    script: script,
    redeemer: redeemer,
  })
  .sendValue(
    { address: resolvePlutusScriptAddress(script, 0), datum: datum },
    utxo,
  )
  .setChangeAddress(address)
  .setRequiredSigners([address]);

unsignedTx.txBuilder.invalidBefore(invalidBefore);
unsignedTx.txBuilder.invalidHereafter(invalidAfter);

unsignedTx.setNetwork(network);

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
