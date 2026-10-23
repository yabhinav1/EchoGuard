/**
 * Detects recurring payments from a list of transactions.
 * A transaction: { id, date (ISO), merchant, amount, category }
 */

const DAY = 24 * 60 * 60 * 1000;

const CADENCES = [
  { name: 'weekly', days: 7, tolerance: 2 },
  { name: 'monthly', days: 30, tolerance: 5 },
  { name: 'yearly', days: 365, tolerance: 15 },
];

export function normalizeMerchant(name) {
  return name
    .toLowerCase()
    .replace(/\*.*$/, '')          // strip "NETFLIX*ABC123" suffixes
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b\d+\b/g, '')       // strip stray numbers
    .replace(/\s+/g, ' ')
    .trim();
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function matchCadence(gapsInDays) {
  const med = median(gapsInDays);
  for (const c of CADENCES) {
    if (Math.abs(med - c.days) <= c.tolerance) {
      const consistent = gapsInDays.filter((g) => Math.abs(g - c.days) <= c.tolerance).length;
      if (consistent / gapsInDays.length >= 0.7) return c;
    }
  }
  return null;
}

export function detectSubscriptions(transactions, { now = new Date() } = {}) {
  const groups = new Map();
  for (const tx of transactions) {
    if (tx.amount < 0) continue; // skip refunds; keep $0 trial charges so trials are detectable
    const key = normalizeMerchant(tx.merchant);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  const subs = [];
  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;
    txs.sort((a, b) => new Date(a.date) - new Date(b.date));

    const gaps = [];
    for (let i = 1; i < txs.length; i++) {
      gaps.push((new Date(txs[i].date) - new Date(txs[i - 1].date)) / DAY);
    }
    const cadence = matchCadence(gaps);
    if (!cadence) continue;

    const last = txs[txs.length - 1];
    const prev = txs[txs.length - 2];
    const nextRenewal = new Date(new Date(last.date).getTime() + cadence.days * DAY);
    const daysUntilRenewal = Math.round((nextRenewal - now) / DAY);

    // Price change: last charge differs from the previous one by >2%
    const priceChange =
      Math.abs(last.amount - prev.amount) / prev.amount > 0.02
        ? { from: prev.amount, to: last.amount, pct: ((last.amount - prev.amount) / prev.amount) * 100 }
        : null;

    // Trial conversion: first charge was tiny/zero, then jumped
    const trialConverted = txs[0].amount < 1 && txs[1] && txs[1].amount > 1;

    // Likely cancelled: expected renewal is well in the past
    const status = daysUntilRenewal < -cadence.tolerance * 2 ? 'inactive' : 'active';

    subs.push({
      id: key.replace(/\s+/g, '-'),
      merchant: last.merchant,
      category: last.category,
      cadence: cadence.name,
      amount: last.amount,
      monthlyCost: toMonthly(last.amount, cadence.name),
      occurrences: txs.length,
      firstSeen: txs[0].date,
      lastCharged: last.date,
      nextRenewal: nextRenewal.toISOString().slice(0, 10),
      daysUntilRenewal,
      status,
      priceChange,
      trialConverted,
      transactionIds: txs.map((t) => t.id),
    });
  }

  return subs.sort((a, b) => b.monthlyCost - a.monthlyCost);
}

export function toMonthly(amount, cadence) {
  if (cadence === 'weekly') return +(amount * 52 / 12).toFixed(2);
  if (cadence === 'yearly') return +(amount / 12).toFixed(2);
  return +amount.toFixed(2);
}

export function subscriptionSummary(subs) {
  const active = subs.filter((s) => s.status === 'active');
  return {
    activeCount: active.length,
    monthlyTotal: +active.reduce((sum, s) => sum + s.monthlyCost, 0).toFixed(2),
    yearlyTotal: +active.reduce((sum, s) => sum + s.monthlyCost * 12, 0).toFixed(2),
    renewingSoon: active.filter((s) => s.daysUntilRenewal >= 0 && s.daysUntilRenewal <= 7),
    priceHikes: active.filter((s) => s.priceChange && s.priceChange.pct > 0),
  };
}
