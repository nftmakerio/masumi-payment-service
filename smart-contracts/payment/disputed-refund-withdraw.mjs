import {
  resolvePlutusScriptAddress,
  resolvePaymentKeyHash,
  KoiosProvider,
  MeshWallet,
  Transaction,
  applyParamsToScript,
  pubKeyAddress,
  resolveStakeKeyHash,
} from '@meshsdk/core';
import fs from 'node:fs';
import 'dotenv/config';

console.log('Disputed funds unlock as example');

const network = 'preprod';
const blockchainProvider = new KoiosProvider(network);

const wallet1 = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: 'mnemonic',
    words: fs.readFileSync('wallet_3.sk').toString().split(' '),
  },
});
const wallet2 = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: 'mnemonic',
    words: fs.readFileSync('wallet_4.sk').toString().split(' '),
  },
});
const wallet3 = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: 'mnemonic',
    words: fs.readFileSync('wallet_5.sk').toString().split(' '),
  },
});
const address = (await wallet1.getUsedAddresses())[0];
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

const utxos = await wallet1.getUtxos();
if (utxos.length === 0) {
  //this is if the buyer wallet is empty
  //throw new Error("No UTXOs found in the wallet. Wallet is empty.");
}

const buyer = fs.readFileSync('wallet_1.addr').toString();
const buyerVerificationKeyHash = resolvePaymentKeyHash(buyer);

const sellerAddress = fs.readFileSync('wallet_2.addr').toString();
const sellerVerificationKeyHash = resolvePaymentKeyHash(sellerAddress);

async function fetchUtxo(txHash) {
  const utxos = await blockchainProvider.fetchAddressUTxOs(
    resolvePlutusScriptAddress(script, 0),
  );
  return utxos.find((utxo) => {
    return utxo.input.txHash == txHash;
  });
}
const utxo = await fetchUtxo(
  '9917dcea928427f851b55f1569db92abbf4bde8f59cb49b9c17c98c69c7c49c2',
);

if (!utxo) {
  throw new Error('UTXO not found');
}

const redeemer = {
  data: {
    alternative: 4,
    fields: [],
  },
};

const unsignedTx = await new Transaction({ initiator: wallet1 })
  .redeemValue({
    value: utxo,
    script: script,
    redeemer: redeemer,
  })
  .setNetwork(network)
  .sendValue({ address: wallet1.getUnusedAddresses()[0] }, utxo)
  .setRequiredSigners([
    (await wallet1.getUsedAddresses())[0],
    (await wallet2.getUsedAddresses())[0],
  ])
  .setChangeAddress((await wallet1.getUnusedAddresses())[0])
  .build();

let signedTx = await wallet1.signTx(unsignedTx, true);
signedTx = await wallet2.signTx(signedTx, true);

//we only need 2 out of 3
//signedTx = await wallet3.signTx(signedTx, true);

//submit the transaction to the blockchain
const txHash = await wallet1.submitTx(signedTx);

console.log(`Created dispute transaction:
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
