/** Uploads the synthetic demo transactions into the DynamoDB table named by TABLE_NAME. */
import { putTransactions } from '../src/services/db.js';
import { generateSeed } from '../src/services/demoData.js';

if (!process.env.TABLE_NAME) {
  console.error('Set TABLE_NAME (and AWS_REGION / credentials) first.');
  process.exit(1);
}
const byUser = new Map();
for (const tx of generateSeed()) byUser.set(tx.userId, [...(byUser.get(tx.userId) || []), tx]);
for (const [userId, list] of byUser) {
  const n = await putTransactions(userId, list);
  console.log(`Seeded ${n} transactions for ${userId}`);
}
