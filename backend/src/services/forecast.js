/**
 * Cash-out forecast for the next N days: scheduled subscription renewals plus everyday spending
 * at the user's recent daily rate (non-recurring purchases over the lookback window, with the
 * largest 2% left out so one-off splurges don't inflate the baseline).
 */
const DAY = 86400000;
const CADENCE_DAYS = { weekly: 7, monthly: 30, yearly: 365 };

export function forecastSpend(transactions, subscriptions, { now = new Date(), days = 30, lookbackDays = 90 } = {}) {
  const recurring = new Set(subscriptions.flatMap((s) => s.transactionIds || []));
  const since = now.getTime() - lookbackDays * DAY;
  const everyday = transactions
    .filter((t) => t.amount > 0 && !recurring.has(t.id) && new Date(t.date).getTime() >= since && new Date(t.date) <= now)
    .map((t) => t.amount)
    .sort((a, b) => a - b);
  const kept = everyday.slice(0, Math.ceil(everyday.length * 0.98));
  const dailyEveryday = kept.reduce((s, a) => s + a, 0) / lookbackDays;

  // Project each active subscription's charges into the window
  const end = now.getTime() + days * DAY;
  const charges = [];
  for (const s of subscriptions.filter((x) => x.status === 'active')) {
    const step = (CADENCE_DAYS[s.cadence] || 30) * DAY;
    let t = new Date(`${s.nextRenewal}T12:00:00Z`).getTime();
    while (t <= now.getTime()) t += step; // overdue-but-active renewals roll to their next cycle
    for (; t <= end; t += step) charges.push({ date: new Date(t).toISOString().slice(0, 10), merchant: s.merchant, amount: s.amount });
  }
  charges.sort((a, b) => a.date.localeCompare(b.date));

  const series = [];
  let cumulative = 0;
  for (let i = 1; i <= days; i++) {
    const date = new Date(now.getTime() + i * DAY).toISOString().slice(0, 10);
    const renewals = charges.filter((c) => c.date === date);
    cumulative += dailyEveryday + renewals.reduce((s, c) => s + c.amount, 0);
    series.push({ date, cumulative: +cumulative.toFixed(2), renewals });
  }

  const subscriptionTotal = charges.reduce((s, c) => s + c.amount, 0);
  return {
    days,
    total: +cumulative.toFixed(2),
    subscriptions: +subscriptionTotal.toFixed(2),
    everyday: +(dailyEveryday * days).toFixed(2),
    dailyEveryday: +dailyEveryday.toFixed(2),
    renewals: charges,
    series,
  };
}
