/**
 * Framework-agnostic route handlers. Each takes ({ userId, params, query, body })
 * and returns { status, body }. Wrapped by local-server.js (Express) and lambda.js (API Gateway).
 */
import { analyzeUser } from '../services/analysis.js';
import { listTransactions, putTransactions, deleteTransaction, isDemoMode } from '../services/db.js';
import { chat, weeklyDigest } from '../services/ai.js';
import { sendAlert } from '../services/notify.js';
import { getBudgets, setBudgets, budgetStatus, budgetAlerts } from '../services/budgets.js';
import { scanReceipt } from '../services/receipts.js';
import { parseCsv } from '../services/importers.js';
import { plaidEnabled, createLinkToken, exchangePublicToken, syncTransactions } from '../services/plaid.js';
import { handleAlexaRequest } from '../services/alexa.js';

const ok = (body) => ({ status: 200, body });
const bad = (msg) => ({ status: 400, body: { error: msg } });

export const routes = {
  'GET /health': async () => ok({
    ok: true, demoMode: isDemoMode(), time: new Date().toISOString(),
    features: {
      bedrock: process.env.USE_BEDROCK === 'true' || !isDemoMode(),
      textract: process.env.USE_TEXTRACT === 'true' || !isDemoMode(),
      plaid: plaidEnabled(),
      sns: !!process.env.SNS_TOPIC_ARN,
    },
  }),

  'GET /dashboard': async ({ userId }) => ok(await analyzeUser(userId)),

  'GET /subscriptions': async ({ userId }) => {
    const { subscriptions, summary } = await analyzeUser(userId);
    return ok({ summary, subscriptions });
  },

  'GET /anomalies': async ({ userId }) => ok({ anomalies: (await analyzeUser(userId)).anomalies }),

  'GET /insights': async ({ userId }) => ok({ tips: (await analyzeUser(userId)).tips }),

  'GET /transactions': async ({ userId, query }) => {
    let txs = await listTransactions(userId);
    txs.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (query?.category) txs = txs.filter((t) => t.category === query.category);
    const limit = Number(query?.limit) || 100;
    return ok({ transactions: txs.slice(0, limit), total: txs.length });
  },

  'POST /transactions': async ({ userId, body }) => {
    const list = Array.isArray(body) ? body : [body];
    for (const tx of list) {
      if (!tx?.merchant || typeof tx.amount !== 'number' || !tx.date) return bad('Each transaction needs merchant, amount (number), and date.');
      tx.id ||= `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      tx.category ||= 'Uncategorized';
      tx.date = new Date(tx.date).toISOString();
    }
    const count = await putTransactions(userId, list);
    return ok({ inserted: count, transactions: list });
  },

  'DELETE /transactions/:id': async ({ userId, params }) => {
    const removed = await deleteTransaction(userId, params.id);
    return removed ? ok({ removed: params.id }) : { status: 404, body: { error: 'Not found' } };
  },

  'POST /chat': async ({ userId, body }) => {
    if (!body?.question) return bad('question is required');
    const context = await analyzeUser(userId);
    return ok(await chat(body.question, context));
  },

  'GET /digest': async ({ userId }) => ok(await weeklyDigest(await analyzeUser(userId))),

  // ---- Budgets ----
  'GET /budgets': async ({ userId }) => {
    const budgets = await getBudgets(userId);
    return ok({ budgets, status: budgetStatus(budgets, await listTransactions(userId)) });
  },
  'PUT /budgets': async ({ userId, body }) => {
    if (!body || typeof body !== 'object') return bad('Send an object of { category: monthlyLimit }');
    const budgets = await setBudgets(userId, body);
    return ok({ budgets, status: budgetStatus(budgets, await listTransactions(userId)) });
  },

  // ---- Receipt scanning (Textract or pasted text) ----
  'POST /receipts': async ({ userId, body }) => {
    const parsed = await scanReceipt({ imageBase64: body?.imageBase64, text: body?.text });
    if (parsed.amount == null) return { status: 422, body: { error: 'Could not find a total on this receipt', parsed } };
    let saved = null;
    if (body?.save) {
      const tx = { id: `rcpt_${Date.now()}`, date: parsed.date, merchant: parsed.merchant, amount: parsed.amount, category: parsed.category, source: 'receipt', items: parsed.items };
      await putTransactions(userId, [tx]);
      saved = tx;
    }
    return ok({ parsed, saved });
  },

  // ---- CSV import ----
  'POST /transactions/import': async ({ userId, body }) => {
    if (!body?.csv) return bad('csv (string) is required');
    const txs = parseCsv(body.csv);
    const inserted = await putTransactions(userId, txs);
    return ok({ inserted, sample: txs.slice(0, 5) });
  },

  // ---- Plaid bank sync ----
  'POST /plaid/link-token': async ({ userId }) => {
    if (!plaidEnabled()) return { status: 501, body: { error: 'Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.' } };
    return ok(await createLinkToken(userId));
  },
  'POST /plaid/exchange': async ({ userId, body }) => {
    if (!plaidEnabled()) return { status: 501, body: { error: 'Plaid is not configured.' } };
    if (!body?.publicToken) return bad('publicToken is required');
    await exchangePublicToken(userId, body.publicToken);
    return ok(await syncTransactions(userId));
  },
  'POST /plaid/sync': async ({ userId }) => {
    if (!plaidEnabled()) return { status: 501, body: { error: 'Plaid is not configured.' } };
    return ok(await syncTransactions(userId));
  },

  // ---- Alexa (also exposed as its own Lambda) ----
  'POST /alexa': async ({ body }) => ok(await handleAlexaRequest(body || {})),

  // Manually trigger the reminder job (the scheduled Lambda does the same thing)
  'POST /reminders/run': async ({ userId }) => ok(await runReminders(userId)),
};

export async function runReminders(userId, { daysAhead = 3 } = {}) {
  const { summary, anomalies, budgets } = await analyzeUser(userId);
  const sent = [];
  for (const s of summary.renewingSoon.filter((x) => x.daysUntilRenewal <= daysAhead)) {
    const msg = `${s.merchant} renews on ${s.nextRenewal} for $${s.amount.toFixed(2)} (${s.cadence}).` +
      (s.priceChange?.pct > 0 ? ` Note: price went up ${s.priceChange.pct.toFixed(0)}% recently.` : '');
    sent.push({ type: 'renewal', merchant: s.merchant, ...(await sendAlert(`EchoGuard: ${s.merchant} renews soon`, msg, { userId })) });
  }
  for (const a of anomalies.filter((x) => x.severity === 'high')) {
    sent.push({ type: 'anomaly', ...(await sendAlert('EchoGuard: unusual charge detected', a.reason, { userId })) });
  }
  for (const msg of budgetAlerts(budgets)) {
    sent.push({ type: 'budget', ...(await sendAlert('EchoGuard: budget alert', msg, { userId })) });
  }
  return { userId, remindersSent: sent.length, details: sent };
}
