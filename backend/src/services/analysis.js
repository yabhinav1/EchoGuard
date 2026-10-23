/**
 * Pulls everything together for a user: subscriptions, anomalies, tips, category totals.
 */
import { listTransactions } from './db.js';
import { detectSubscriptions, subscriptionSummary } from './subscriptionDetector.js';
import { detectAnomalies } from './anomalyDetector.js';
import { suggestSavings } from './insights.js';
import { getBudgets, budgetStatus } from './budgets.js';

export async function analyzeUser(userId, { now = new Date() } = {}) {
  const transactions = await listTransactions(userId);
  const subscriptions = detectSubscriptions(transactions, { now });
  const summary = subscriptionSummary(subscriptions);
  const anomalies = detectAnomalies(transactions, { now });
  const tips = suggestSavings(subscriptions);
  const budgets = budgetStatus(await getBudgets(userId), transactions, { now });

  const cutoff = now.getTime() - 30 * 86400000;
  const categoryTotals = {};
  let last30Total = 0;
  for (const tx of transactions) {
    if (new Date(tx.date).getTime() < cutoff || tx.amount <= 0) continue;
    categoryTotals[tx.category] = +((categoryTotals[tx.category] || 0) + tx.amount).toFixed(2);
    last30Total += tx.amount;
  }

  // Monthly spend series for the chart (last 6 months)
  const monthly = {};
  for (const tx of transactions) {
    if (tx.amount <= 0) continue;
    const k = tx.date.slice(0, 7);
    monthly[k] = +((monthly[k] || 0) + tx.amount).toFixed(2);
  }
  const monthlySeries = Object.entries(monthly).sort().slice(-6).map(([month, total]) => ({ month, total }));

  return {
    userId,
    generatedAt: now.toISOString(),
    transactionCount: transactions.length,
    summary: { ...summary, last30DaysSpend: +last30Total.toFixed(2) },
    subscriptions,
    anomalies,
    tips,
    budgets,
    categoryTotals,
    monthlySeries,
  };
}
