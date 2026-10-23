/** Uploads src/data/transactions.json into the DynamoDB table named by TABLE_NAME. */
import { readFileSync } from 'node:fs';
import { putTransactions } from '../src/services/db.js';

if (!process.env.TABLE_NAME) {
  console.error('Set TABLE_NAME (and AWS_REGION / credentials) first.');
  process.exit(1);
}
const txs = JSON.parse(readFileSync(new URL('../src/data/transactions.json', import.meta.url)));
const byUser = new Map();
for (const tx of txs) byUser.set(tx.userId, [...(byUser.get(tx.userId) || []), tx]);
for (const [userId, list] of byUser) {
  const n = await putTransactions(userId, list);
  console.log(`Seeded ${n} transactions for ${userId}`);
}
