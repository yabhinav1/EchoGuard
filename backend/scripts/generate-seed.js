/**
 * Generates ~6 months of realistic synthetic transactions for the demo user.
 * Includes: several subscriptions, a price hike, a free trial that converted,
 * a cancelled subscription, a duplicate charge, and a couple of spending anomalies.
 *
 * Usage: node scripts/generate-seed.js [--out path]
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : join(__dirname, '../src/data/transactions.json');

// Deterministic PRNG so demos are reproducible
let seed = 42;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const randBetween = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const DAY = 86400000;
const NOW = new Date('2026-10-23T12:00:00Z');
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
    ...(note ? { note } : {}),
  });
};

// ---- Subscriptions -------------------------------------------------------
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
// Yearly: Amazon Prime (one charge in window)
add(new Date(NOW.getTime() - 100 * DAY), 'Amazon Prime', 139.0, 'Shopping');
add(new Date(NOW.getTime() - 465 * DAY), 'Amazon Prime', 139.0, 'Shopping'); // out of window, kept so yearly cadence is detectable
// Weekly: meal kit
for (let i = 0; i < 20; i++) add(new Date(NOW.getTime() - (3 + i * 7) * DAY), 'HelloFresh', 59.94, 'Groceries');

// ---- Everyday spending ---------------------------------------------------
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

// ---- Planted anomalies ---------------------------------------------------
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

txs.sort((a, b) => new Date(a.date) - new Date(b.date));
writeFileSync(OUT, JSON.stringify(txs, null, 2));
console.log(`Wrote ${txs.length} transactions to ${OUT}`);
