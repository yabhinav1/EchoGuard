/**
 * Flags unusual transactions. Returns a list of anomalies with a plain-English reason.
 */
import { normalizeMerchant, displayMerchant } from './subscriptionDetector.js';

const MIN = 60 * 1000;

function stats(nums) {
  const n = nums.length;
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance), n };
}

export function detectAnomalies(transactions, { zThreshold = 2.5, lookbackDays = 90, now = new Date() } = {}) {
  const anomalies = [];
  const seen = new Set();
  const push = (tx, type, severity, reason, extra = {}) => {
    const key = `${tx.id}:${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    anomalies.push({ id: key, transactionId: tx.id, type, severity, reason, transaction: tx, ...extra });
  };

  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

  // 1. Duplicate charges: same merchant + amount within 10 minutes (other charges may sit in between)
  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i];
    const bTime = new Date(b.date).getTime();
    for (let j = i - 1; j >= 0 && bTime - new Date(sorted[j].date).getTime() <= 10 * MIN; j--) {
      const a = sorted[j];
      if (normalizeMerchant(a.merchant) === normalizeMerchant(b.merchant) && a.amount === b.amount) {
        push(b, 'duplicate_charge', 'high', `Charged twice by ${displayMerchant(b.merchant)} for $${b.amount.toFixed(2)} within minutes.`, {
          relatedTransactionId: a.id,
        });
        break;
      }
    }
  }

  // 2. Category outliers: z-score against the category's own history
  const byCategory = new Map();
  for (const tx of sorted) {
    if (tx.amount <= 0) continue;
    if (!byCategory.has(tx.category)) byCategory.set(tx.category, []);
    byCategory.get(tx.category).push(tx);
  }
  const cutoff = now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  for (const [category, txs] of byCategory) {
    if (txs.length < 5) continue;
    const { mean, std } = stats(txs.map((t) => t.amount));
    if (std === 0) continue;
    for (const tx of txs) {
      if (new Date(tx.date).getTime() < cutoff) continue;
      const z = (tx.amount - mean) / std;
      if (z >= zThreshold) {
        const multiple = (tx.amount / mean).toFixed(1);
        push(tx, 'category_outlier', z >= 4 ? 'high' : 'medium',
          `$${tx.amount.toFixed(2)} at ${displayMerchant(tx.merchant)} is ${multiple}x your typical ${category} purchase ($${mean.toFixed(2)}).`,
          { zScore: +z.toFixed(2), categoryMean: +mean.toFixed(2) });
      }
    }
  }

  // 3. New merchant with a large amount
  const merchantFirstSeen = new Map();
  for (const tx of sorted) {
    const key = normalizeMerchant(tx.merchant);
    if (!merchantFirstSeen.has(key)) merchantFirstSeen.set(key, tx);
  }
  const overall = stats(sorted.filter((t) => t.amount > 0).map((t) => t.amount));
  for (const tx of merchantFirstSeen.values()) {
    if (new Date(tx.date).getTime() < cutoff) continue;
    if (seen.has(`${tx.id}:category_outlier`)) continue; // already flagged with a stronger reason
    if (tx.amount > overall.mean + 2 * overall.std && tx.amount > 100) {
      push(tx, 'new_merchant_large', 'medium',
        `First time seeing ${displayMerchant(tx.merchant)}, and it was a large charge of $${tx.amount.toFixed(2)}.`);
    }
  }

  // 4. Weekly spend spike per category
  const weekly = new Map(); // category -> Map(weekKey -> total)
  for (const tx of sorted) {
    if (tx.amount <= 0) continue;
    const d = new Date(tx.date);
    const week = `${d.getUTCFullYear()}-W${Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / (7 * 24 * 3600 * 1000))}`;
    if (!weekly.has(tx.category)) weekly.set(tx.category, new Map());
    const m = weekly.get(tx.category);
    m.set(week, (m.get(week) || 0) + tx.amount);
  }
  for (const [category, weeks] of weekly) {
    const entries = [...weeks.entries()];
    if (entries.length < 6) continue;
    const totals = entries.map(([, v]) => v);
    const { mean, std } = stats(totals);
    const [lastWeek, lastTotal] = entries[entries.length - 1];
    if (std > 0 && (lastTotal - mean) / std >= 2 && lastTotal > mean * 2) {
      const rep = sorted.filter((t) => t.category === category).at(-1);
      push(rep, 'weekly_spike', 'low',
        `${category} spend this week is $${lastTotal.toFixed(2)}, about ${(lastTotal / mean).toFixed(1)}x your usual weekly ${category} spend.`,
        { week: lastWeek, weekTotal: +lastTotal.toFixed(2), weeklyMean: +mean.toFixed(2) });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  return anomalies.sort((a, b) => order[a.severity] - order[b.severity] || new Date(b.transaction.date) - new Date(a.transaction.date));
}
