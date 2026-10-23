/**
 * Per-category monthly budgets with 80% warning and 100% over thresholds.
 */
import { getMeta, putMeta } from './db.js';

export const DEFAULT_BUDGETS = { Dining: 750, Groceries: 700, Transport: 600, Shopping: 900, Entertainment: 100, Health: 150 };

export async function getBudgets(userId) {
  return getMeta(userId, 'budgets', DEFAULT_BUDGETS);
}

export async function setBudgets(userId, budgets) {
  const clean = {};
  for (const [cat, limit] of Object.entries(budgets || {})) {
    const n = Number(limit);
    if (cat && Number.isFinite(n) && n >= 0) clean[cat] = +n.toFixed(2);
  }
  return putMeta(userId, 'budgets', clean);
}

/** Month-to-date spend per category vs. budget. */
export function budgetStatus(budgets, transactions, { now = new Date() } = {}) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const spent = {};
  for (const tx of transactions) {
    const d = new Date(tx.date);
    if (d < monthStart || d > now || tx.amount <= 0) continue;
    spent[tx.category] = (spent[tx.category] || 0) + tx.amount;
  }
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const monthProgress = now.getUTCDate() / daysInMonth;

  return Object.entries(budgets).map(([category, limit]) => {
    const used = +(spent[category] || 0).toFixed(2);
    const pct = limit > 0 ? +((used / limit) * 100).toFixed(0) : 0;
    const projected = monthProgress > 0 ? +(used / monthProgress).toFixed(2) : used;
    const state = pct >= 100 ? 'over' : pct >= 80 ? 'warning' : projected > limit ? 'pace' : 'ok';
    return { category, limit, spent: used, remaining: +(limit - used).toFixed(2), pct, projected, state };
  }).sort((a, b) => b.pct - a.pct);
}

export function budgetAlerts(status) {
  return status
    .filter((b) => b.state === 'over' || b.state === 'warning')
    .map((b) => b.state === 'over'
      ? `You are over your ${b.category} budget: $${b.spent.toFixed(2)} of $${b.limit.toFixed(2)} this month.`
      : `You have used ${b.pct}% of your ${b.category} budget ($${b.spent.toFixed(2)} of $${b.limit.toFixed(2)}).`);
}
