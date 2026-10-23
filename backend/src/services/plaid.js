/**
 * Plaid bank sync via REST (no SDK). Enabled when PLAID_CLIENT_ID and PLAID_SECRET are set.
 * Uses the sandbox environment unless PLAID_ENV=development|production.
 */
import { getMeta, putMeta, putTransactions } from './db.js';
import { categorizeByRules } from './categorize.js';

const ENV = process.env.PLAID_ENV || 'sandbox';
const BASE = `https://${ENV}.plaid.com`;

export const plaidEnabled = () => !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);

// Access tokens are encrypted with KMS before they are stored, bound to the user and item via the
// encryption context. Without KMS_KEY_ID (local demo) they are kept as-is in the in-memory store.
const KMS_KEY = process.env.KMS_KEY_ID;
let kms = null;
async function kmsClient() {
  if (kms) return kms;
  const { KMSClient } = await import('@aws-sdk/client-kms');
  kms = new KMSClient({});
  return kms;
}

async function sealToken(userId, itemId, accessToken) {
  if (!KMS_KEY) {
    if (process.env.TABLE_NAME && ENV !== 'sandbox') console.warn('[plaid] KMS_KEY_ID is not set; storing the access token unencrypted');
    return { accessToken };
  }
  const { EncryptCommand } = await import('@aws-sdk/client-kms');
  const res = await (await kmsClient()).send(new EncryptCommand({
    KeyId: KMS_KEY, Plaintext: Buffer.from(accessToken), EncryptionContext: { userId, itemId },
  }));
  return { accessTokenEnc: Buffer.from(res.CiphertextBlob).toString('base64') };
}

async function openToken(userId, item) {
  if (!item.accessTokenEnc) return item.accessToken; // demo mode, or an item stored before encryption
  const { DecryptCommand } = await import('@aws-sdk/client-kms');
  const res = await (await kmsClient()).send(new DecryptCommand({
    CiphertextBlob: Buffer.from(item.accessTokenEnc, 'base64'), EncryptionContext: { userId, itemId: item.itemId },
  }));
  return Buffer.from(res.Plaintext).toString();
}

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error_message || `Plaid ${path} failed`), { status: 502, plaid: json });
  return json;
}

const PFC_MAP = {
  FOOD_AND_DRINK: 'Dining', GENERAL_MERCHANDISE: 'Shopping', TRANSPORTATION: 'Transport', ENTERTAINMENT: 'Entertainment',
  MEDICAL: 'Health', PERSONAL_CARE: 'Health', RENT_AND_UTILITIES: 'Utilities', TRAVEL: 'Travel', GENERAL_SERVICES: 'Software',
};
// Money moving between the user's own accounts (card payments, loan payments, transfers) is not spending;
// counting a credit card payment would double-count the purchases already made on that card.
const NOT_SPENDING = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'INCOME']);
export const isSpending = (t) => t.amount > 0 && !t.pending && !NOT_SPENDING.has(t.personal_finance_category?.primary);

export async function createLinkToken(userId) {
  const res = await call('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'EchoGuard',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  });
  return { linkToken: res.link_token, expiration: res.expiration };
}

export async function exchangePublicToken(userId, publicToken) {
  const res = await call('/item/public_token/exchange', { public_token: publicToken });
  const items = await getMeta(userId, 'plaidItems', []);
  items.push({ itemId: res.item_id, ...(await sealToken(userId, res.item_id, res.access_token)), cursor: null, linkedAt: new Date().toISOString() });
  await putMeta(userId, 'plaidItems', items);
  return { itemId: res.item_id };
}

export async function syncTransactions(userId) {
  const items = await getMeta(userId, 'plaidItems', []);
  if (!items.length) throw Object.assign(new Error('No bank linked yet'), { status: 400 });
  let added = 0;
  for (const item of items) {
    const accessToken = await openToken(userId, item);
    if (item.accessToken && KMS_KEY) { // re-store items saved before encryption was added
      delete item.accessToken;
      Object.assign(item, await sealToken(userId, item.itemId, accessToken));
    }
    let hasMore = true;
    while (hasMore) {
      const res = await call('/transactions/sync', { access_token: accessToken, cursor: item.cursor || undefined, count: 500 });
      const txs = [...res.added, ...res.modified].filter(isSpending).map((t) => ({
        id: `plaid_${t.transaction_id}`,
        date: new Date(`${t.date}T12:00:00Z`).toISOString(),
        merchant: t.merchant_name || t.name,
        amount: +t.amount.toFixed(2),
        category: PFC_MAP[t.personal_finance_category?.primary] || categorizeByRules(t.merchant_name || t.name),
        source: 'plaid',
      }));
      if (txs.length) added += await putTransactions(userId, txs);
      item.cursor = res.next_cursor;
      hasMore = res.has_more;
    }
  }
  await putMeta(userId, 'plaidItems', items);
  return { linkedAccounts: items.length, imported: added };
}
