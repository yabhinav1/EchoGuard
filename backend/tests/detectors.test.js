import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSubscriptions, subscriptionSummary, normalizeMerchant, displayMerchant } from '../src/services/subscriptionDetector.js';
import { detectAnomalies } from '../src/services/anomalyDetector.js';
import { suggestSavings } from '../src/services/insights.js';

import { generateSeed, SEED_ANCHOR } from '../src/services/demoData.js';

const NOW = SEED_ANCHOR;
const txs = generateSeed();

test('normalizes merchant names', () => {
  assert.equal(normalizeMerchant('NETFLIX*ABC123'), 'netflix');
  assert.equal(normalizeMerchant('HULU*LLC'), 'hulu');
  assert.equal(normalizeMerchant('Spotify USA'), 'spotify usa');
});

test('detects monthly, weekly and yearly subscriptions', () => {
  const subs = detectSubscriptions(txs, { now: NOW });
  const byName = Object.fromEntries(subs.map((s) => [s.merchant, s]));
  assert.equal(byName['Netflix'].cadence, 'monthly');
  assert.equal(byName['HelloFresh'].cadence, 'weekly');
  assert.equal(byName['Amazon Prime'].cadence, 'yearly');
  assert.ok(!byName['Chipotle'], 'random dining should not be a subscription');
});

test('flags price hike, trial conversion, and cancelled subscription', () => {
  const subs = detectSubscriptions(txs, { now: NOW });
  const byName = Object.fromEntries(subs.map((s) => [s.merchant, s]));
  assert.ok(byName['Netflix'].priceChange, 'netflix should have a price change');
  assert.ok(byName['Netflix'].priceChange.pct > 10);
  assert.equal(byName['Peloton App'].trialConverted, true);
  assert.equal(byName['NYT Digital'].status, 'inactive');
});

test('summary totals are sane', () => {
  const summary = subscriptionSummary(detectSubscriptions(txs, { now: NOW }));
  assert.ok(summary.activeCount >= 8);
  assert.ok(summary.monthlyTotal > 300 && summary.monthlyTotal < 600, `monthlyTotal=${summary.monthlyTotal}`);
  assert.equal(summary.priceHikes.length, 1);
});

test('detects planted anomalies', () => {
  const anomalies = detectAnomalies(txs, { now: NOW });
  const types = new Set(anomalies.map((a) => a.type));
  assert.ok(types.has('duplicate_charge'));
  assert.ok(types.has('category_outlier'));
  const nobu = anomalies.find((a) => a.transaction.merchant === 'Nobu Palo Alto');
  assert.ok(nobu && nobu.severity === 'high');
  // A transaction that is both a new merchant and a category outlier is flagged once, with the stronger reason
  const zephyr = anomalies.filter((a) => a.transaction.merchant === 'Zephyr Electronics' && a.type !== 'weekly_spike');
  assert.equal(zephyr.length, 1);
  assert.equal(zephyr[0].type, 'category_outlier');
});

test('savings tips find overlapping music services', () => {
  const tips = suggestSavings(detectSubscriptions(txs, { now: NOW }));
  const overlap = tips.find((t) => t.type === 'overlap' && t.title.includes('music'));
  assert.ok(overlap, 'should flag Spotify + YouTube Music');
  assert.ok(tips.some((t) => t.type === 'price_hike'));
  assert.ok(tips.some((t) => t.type === 'trial_converted'));
});

test('duplicate charge is caught even with another charge in between', () => {
  const t = (id, min, merchant, amount) => ({ id, date: new Date(NOW.getTime() - 3600000 + min * 60000).toISOString(), merchant, amount, category: 'Dining' });
  const anomalies = detectAnomalies([t('a', 0, 'DoorDash', 20), t('b', 2, 'Starbucks', 5), t('c', 4, 'DoorDash', 20)], { now: NOW });
  const dup = anomalies.find((a) => a.type === 'duplicate_charge');
  assert.ok(dup && dup.transactionId === 'c' && dup.relatedTransactionId === 'a');
});

test('display names are human-friendly', () => {
  assert.equal(displayMerchant('NETFLIX.COM'), 'Netflix');
  assert.equal(displayMerchant('HULU*LLC'), 'Hulu');
  assert.equal(displayMerchant('APPLE.COM/BILL'), 'Apple');
  assert.equal(displayMerchant('Spotify USA'), 'Spotify');
  assert.equal(displayMerchant('NYT Digital'), 'NYT Digital');
  assert.equal(displayMerchant('Peloton App'), 'Peloton App');
});
