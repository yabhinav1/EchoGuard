/**
 * Synthetic demo data: ~6 months of realistic transactions for the demo user, with planted
 * subscriptions, a price hike, a converted free trial, a cancelled subscription, a duplicate
 * charge and a few spending anomalies.
 *
 * The data is generated deterministically relative to SEED_ANCHOR (so tests are stable), and
 * every transaction is tagged `seeded: true`. When read, seeded transactions are shifted forward
 * by the whole days that have passed since the anchor, so the demo never goes stale: renewals
 * stay upcoming and "this week" anomalies stay in this week.
 */
const DAY = 86400000;
export const SEED_ANCHOR = new Date('2026-10-23T12:00:00Z');

/** Whole days between the anchor and `now` (negative before the anchor). */
export const seedShiftDays = (now = new Date()) => Math.floor((now.getTime() - SEED_ANCHOR.getTime()) / DAY);

/** Moves seeded transactions forward so the demo data always ends "today". User-added transactions are untouched. */
export function shiftSeeded(txs, now = new Date()) {
  const days = seedShiftDays(now);
  if (!days) return txs;
  return txs.map((t) => (t.seeded ? { ...t, date: new Date(new Date(t.date).getTime() + days * DAY).toISOString() } : t));
}

export function generateSeed() {
  // Deterministic PRNG so demos are reproducible
  let seed = 42;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const randBetween = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const NOW = SEED_ANCHOR;
  const START = new Date(NOW.getTime() - 190 * DAY);
  let idCounter = 1;
  const txs = [];
  const add = (date, merchant, amount, category, note) => {
    txs.push({
      id: `tx_${String(idCounter++).padStart(4, '0')}`,
      userId: 'demo',
      date: new Date(date).toISOString(),
      merchant,
      amount: +amount.toFixed(2),
      category,
      seeded: true,
      ...(note ? { note } : {}),
    });
  };

  // ---- Subscriptions -----------------------------------------------------
  // opts: until (Date) stop charging after; since (Date) first charge on/after; trial (bool) first charge is $0;
  //       priceHike: { from: Date, amount } charge the new amount on/after the date
  const monthly = (merchant, amount, category, dayOfMonth, { until, since, trial, priceHike } = {}) => {
    let first = true;
    for (let m = -7; m <= 0; m++) {
      const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + m, dayOfMonth, 9, 0, 0));
      if (d < START || d > NOW) continue;
      if (until && d > until) continue;
      if (since && d < since) continue;
      let amt = amount;
      if (priceHike && d >= priceHike.from) amt = priceHike.amount;
      if (trial && first) amt = 0;
      first = false;
      add(d, merchant, amt, category, trial && amt === 0 ? 'Free trial' : undefined);
    }
  };

  monthly('NETFLIX.COM', 15.49, 'Entertainment', 3, { priceHike: { from: new Date(NOW.getTime() - 25 * DAY), amount: 17.99 } });
  monthly('Spotify USA', 10.99, 'Entertainment', 11);
  monthly('APPLE.COM/BILL', 2.99, 'Software', 15);              // iCloud
  monthly('Google One', 1.99, 'Software', 18);                   // overlapping cloud storage
  monthly('HULU*LLC', 7.99, 'Entertainment', 22);
  monthly('Adobe Creative Cloud', 54.99, 'Software', 27);
  monthly('Planet Fitness', 24.99, 'Health', 1);
  monthly('NYT Digital', 4.00, 'News', 9, { until: new Date(NOW.getTime() - 75 * DAY) }); // cancelled
  monthly('YouTube Music', 10.99, 'Entertainment', 11);          // overlaps with Spotify
  // Free trial started 3 months ago ($0), converted to paid the following month
  monthly('Peloton App', 12.99, 'Health', 8, { since: new Date(NOW.getTime() - 100 * DAY), trial: true });
  // Yearly: Amazon Prime (one charge in window, one from last year so the cadence is detectable)
  add(new Date(NOW.getTime() - 100 * DAY), 'Amazon Prime', 139.0, 'Shopping');
  add(new Date(NOW.getTime() - 465 * DAY), 'Amazon Prime', 139.0, 'Shopping');
  // Weekly: meal kit
  for (let i = 0; i < 20; i++) add(new Date(NOW.getTime() - (3 + i * 7) * DAY), 'HelloFresh', 59.94, 'Groceries');

  // ---- Everyday spending -------------------------------------------------
  const EVERYDAY = [
    { category: 'Groceries', merchants: ['Whole Foods', 'Trader Joes', 'Safeway'], range: [25, 120], perWeek: 2 },
    { category: 'Dining', merchants: ['Chipotle', 'Sweetgreen', 'Starbucks', 'DoorDash', 'Shake Shack'], range: [8, 45], perWeek: 4 },
    { category: 'Transport', merchants: ['Uber', 'Lyft', 'Shell Gas', 'BART'], range: [5, 60], perWeek: 3 },
    { category: 'Shopping', merchants: ['Amazon.com', 'Target', 'Best Buy'], range: [15, 90], perWeek: 1.5 },
    { category: 'Health', merchants: ['CVS Pharmacy', 'Walgreens'], range: [10, 40], perWeek: 0.5 },
  ];
  for (let d = START.getTime(); d < NOW.getTime(); d += DAY) {
    for (const cat of EVERYDAY) {
      if (rand() < cat.perWeek / 7) {
        const t = new Date(d + randBetween(8, 21) * 3600000);
        add(t, pick(cat.merchants), randBetween(...cat.range), cat.category);
      }
    }
  }

  // ---- Planted anomalies -------------------------------------------------
  // Duplicate charge: DoorDash twice, 3 minutes apart, 5 days ago
  const dupTime = new Date(NOW.getTime() - 5 * DAY);
  add(dupTime, 'DoorDash', 38.47, 'Dining');
  add(new Date(dupTime.getTime() + 3 * 60000), 'DoorDash', 38.47, 'Dining');
  // Category outlier: huge dining bill 9 days ago
  add(new Date(NOW.getTime() - 9 * DAY), 'Nobu Palo Alto', 412.0, 'Dining');
  // New merchant, large amount, 2 days ago
  add(new Date(NOW.getTime() - 2 * DAY), 'Zephyr Electronics', 899.0, 'Shopping');
  // Transport spike this week: several Ubers
  for (let i = 0; i < 6; i++) add(new Date(NOW.getTime() - i * 0.4 * DAY), 'Uber', randBetween(30, 70), 'Transport');

  return txs.sort((a, b) => new Date(a.date) - new Date(b.date));
}
