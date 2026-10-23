/**
 * Pulls everything together for a user: subscriptions, anomalies, tips, budgets, forecast, category totals.
 * User feedback (kept / cancelled subscriptions, dismissed anomalies) is applied here.
 */
import { listTransactions } from './db.js';
import { detectSubscriptions, subscriptionSummary } from './subscriptionDetector.js';
import { detectAnomalies } from './anomalyDetector.js';
import { suggestSavings } from './insights.js';
import { getBudgets, budgetStatus } from './budgets.js';
import { getPrefs } from './prefs.js';
import { forecastSpend } from './forecast.js';

export async function analyzeUser(userId, { now = new Date() } = {}) {
  const [transactions, prefs] = await Promise.all([listTransactions(userId, { now }), getPrefs(userId)]);

  const subscriptions = detectSubscriptions(transactions, { now }).map((s) => {
    const mark = prefs.subscriptions[s.id];
    if (!mark) return s;
    // A user-cancelled subscription stops counting toward totals, renewals and tips
    return { ...s, userStatus: mark.status, ...(mark.status === 'cancelled' && s.status === 'active' ? { status: 'cancelled' } : {}) };
  });
  const summary = subscriptionSummary(subscriptions);
  const allAnomalies = detectAnomalies(transactions, { now });
  const anomalies = allAnomalies.filter((a) => !prefs.dismissed.includes(a.id));
  const tips = suggestSavings(subscriptions);
  const budgets = budgetStatus(await getBudgets(userId), transactions, { now });
  const forecast = forecastSpend(transactions, subscriptions, { now });

  const cutoff = now.getTime() - 30 * 86400000;
  const categoryTotals = {};
  let last30Total = 0;
  for (const tx of transactions) {
    const t = new Date(tx.date).getTime();
    if (t < cutoff || t > now.getTime() || tx.amount <= 0) continue;
    categoryTotals[tx.category] = +((categoryTotals[tx.category] || 0) + tx.amount).toFixed(2);
    last30Total += tx.amount;
  }

  // Monthly spend series for the chart (last 6 months)
  const monthly = {};
  for (const tx of transactions) {
    if (tx.amount <= 0 || new Date(tx.date) > now) continue;
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
    dismissedCount: allAnomalies.length - anomalies.length,
    tips,
    budgets,
    forecast,
    categoryTotals,
    monthlySeries,
  };
}
