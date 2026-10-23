/**
 * Transaction store. Uses DynamoDB when TABLE_NAME is set, otherwise an
 * in-memory store seeded from src/data/transactions.json (demo mode).
 *
 * DynamoDB layout (single table):
 *   PK = USER#<userId>   SK = TX#<date>#<id>
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ---- in-memory demo store ------------------------------------------------
const memory = new Map(); // userId -> tx[]
function loadSeed() {
  const file = join(__dirname, '../data/transactions.json');
  if (!existsSync(file)) return;
  const txs = JSON.parse(readFileSync(file, 'utf8'));
  for (const tx of txs) {
    if (!memory.has(tx.userId)) memory.set(tx.userId, []);
    memory.get(tx.userId).push(tx);
  }
}
if (!TABLE) loadSeed();

export const isDemoMode = () => !TABLE;

export async function listTransactions(userId) {
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
  const all = await listTransactions(userId);
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
