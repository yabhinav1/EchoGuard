/**
 * Transaction store. Uses DynamoDB when TABLE_NAME is set, otherwise an in-memory store.
 *
 * Demo users ("demo" and per-browser "guest-<id>" users) see the shared demo history plus whatever they
 * added themselves. The demo history is never copied per user: it is generated in memory (or read from
 * src/data/transactions.json when present) and merged in on every read, so each visitor gets a private
 * copy for free. Seeded demo transactions are shifted to "today" on every read (see demoData.js).
 *
 * DynamoDB layout (single table):
 *   PK = USER#<userId>   SK = TX#<date>#<id>
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSeed, shiftSeeded } from './demoData.js';

const TABLE = process.env.TABLE_NAME;
const __dirname = dirname(fileURLToPath(import.meta.url));

let ddb = null;
async function client() {
  if (ddb) return ddb;
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
  ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  return ddb;
}

// ---- demo history shared by demo and guest users -----------------------------
const DEMO_USER = /^(demo|guest-[a-z0-9-]{8,64})$/;
/** True for the shared "demo" user and per-browser guest users, who start from the demo history. */
export const usesDemoData = (userId) => DEMO_USER.test(userId);

let seedCache = null;
function demoHistory() {
  if (!seedCache) {
    const file = join(__dirname, '../data/transactions.json');
    seedCache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : generateSeed();
  }
  return seedCache;
}

// ---- in-memory store (local demo mode) ------------------------------------------
const memory = new Map(); // userId -> tx[] (only what users add; the demo history is merged in on read)

export const isDemoMode = () => !TABLE;

/** A user's transactions: the demo history (for demo/guest users) plus their own, rolled forward to today. */
export async function listTransactions(userId, { now = new Date() } = {}) {
  const stored = await listStored(userId);
  if (!usesDemoData(userId)) return shiftSeeded(stored, now);
  const own = new Set(stored.map((t) => t.id));
  const history = demoHistory().filter((t) => !own.has(t.id)).map((t) => ({ ...t, userId }));
  return shiftSeeded([...history, ...stored], now);
}

/** Transactions exactly as stored (DynamoDB keys use the stored date). */
async function listStored(userId) {
  if (!TABLE) return [...(memory.get(userId) || [])];
  const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await (await client()).send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'TX#' },
      ExclusiveStartKey,
    }));
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.map(({ PK, SK, ...tx }) => tx);
}

export async function putTransactions(userId, txs) {
  if (!TABLE) {
    if (!memory.has(userId)) memory.set(userId, []);
    const list = memory.get(userId);
    for (const tx of txs) {
      const i = list.findIndex((t) => t.id === tx.id);
      if (i > -1) list[i] = tx; else list.push(tx);
    }
    return txs.length;
  }
  const { BatchWriteCommand } = await import('@aws-sdk/lib-dynamodb');
  for (let i = 0; i < txs.length; i += 25) {
    const chunk = txs.slice(i, i + 25);
    await (await client()).send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map((tx) => ({
          PutRequest: { Item: { PK: `USER#${userId}`, SK: `TX#${tx.date}#${tx.id}`, ...tx, userId } },
        })),
      },
    }));
  }
  return txs.length;
}

export async function deleteTransaction(userId, id) {
  if (!TABLE) {
    const list = memory.get(userId) || [];
    const i = list.findIndex((t) => t.id === id);
    if (i > -1) list.splice(i, 1);
    return i > -1;
  }
  const all = await listStored(userId);
  const tx = all.find((t) => t.id === id);
  if (!tx) return false;
  const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
  await (await client()).send(new DeleteCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `TX#${tx.date}#${tx.id}` } }));
  return true;
}

// ---- per-user metadata (budgets, bank links, sync cursors) ---------------
const meta = new Map(); // `${userId}:${key}` -> value

export async function getMeta(userId, key, fallback = null) {
  if (!TABLE) return meta.has(`${userId}:${key}`) ? meta.get(`${userId}:${key}`) : fallback;
  const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
  const res = await (await client()).send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `META#${key}` } }));
  return res.Item ? res.Item.value : fallback;
}

/** User ids that have a META#<key> item, e.g. everyone subscribed to alerts. */
export async function listUsersWithMeta(key) {
  if (!TABLE) return [...meta.keys()].filter((k) => k.endsWith(`:${key}`)).map((k) => k.slice(0, -key.length - 1));
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const users = [];
  let ExclusiveStartKey;
  do {
    const res = await (await client()).send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'PK',
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': `META#${key}` },
      ExclusiveStartKey,
    }));
    users.push(...(res.Items || []).map((i) => i.PK.slice('USER#'.length)));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return users;
}

export async function putMeta(userId, key, value) {
  if (!TABLE) { meta.set(`${userId}:${key}`, value); return value; }
  const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
  await (await client()).send(new PutCommand({ TableName: TABLE, Item: { PK: `USER#${userId}`, SK: `META#${key}`, value, updatedAt: new Date().toISOString() } }));
  return value;
}

/** Deletes everything a user has stored (their own transactions, budgets, marks, bank links). */
export async function deleteUserData(userId) {
  if (!TABLE) {
    memory.delete(userId);
    for (const k of [...meta.keys()]) if (k.startsWith(`${userId}:`)) meta.delete(k);
    return;
  }
  const { QueryCommand, BatchWriteCommand } = await import('@aws-sdk/lib-dynamodb');
  const keys = [];
  let ExclusiveStartKey;
  do {
    const res = await (await client()).send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `USER#${userId}` },
      ProjectionExpression: 'PK, SK', ExclusiveStartKey,
    }));
    keys.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  for (let i = 0; i < keys.length; i += 25) {
    await (await client()).send(new BatchWriteCommand({ RequestItems: { [TABLE]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) } }));
  }
}
