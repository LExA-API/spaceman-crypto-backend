const fs = require('fs');
const {
  Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount, createTransferInstruction,
} = require('@solana/spl-token');

const connection = new Connection('https://api.devnet.solana.com');
const mint = new PublicKey('5R4cv6jiQL3epyQc2PzKWB1M5fTC6JSye74NerUsdMoz');

require('dotenv').config({ path: __dirname + '/.env' });
console.log('SERVER_PRIVATE_KEY:', process.env.SERVER_PRIVATE_KEY);
const keyBytes = Uint8Array.from(Buffer.from(process.env.SERVER_PRIVATE_KEY, 'base64'));
const serverKeypair = Keypair.fromSecretKey(keyBytes);
/*
const serverKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('./airdrop-wallet.json')))
);*/

/**
 * Transfer tokens from server wallet to a destination wallet
 * @param {number} amount - amount to send (in smallest unit)
 * @param {PublicKey} toPubkey - destination public key
 */
async function transferToken(amount, toPubkey) {
  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection, serverKeypair, mint, serverKeypair.publicKey
  );

  const toTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection, serverKeypair, mint, toPubkey
  );

  const tx = new Transaction().add(
    createTransferInstruction(
      fromTokenAccount.address,
      toTokenAccount.address,
      serverKeypair.publicKey,
      amount
    )
  );

  await sendAndConfirmTransaction(connection, tx, [serverKeypair]);
}

module.exports = { transferToken, mint };
