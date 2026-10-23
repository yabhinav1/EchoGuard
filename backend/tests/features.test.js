import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed, shiftSeeded, SEED_ANCHOR } from '../src/services/demoData.js';
import { detectSubscriptions } from '../src/services/subscriptionDetector.js';
import { suggestSavings } from '../src/services/insights.js';
import { forecastSpend } from '../src/services/forecast.js';
import { cancelGuide } from '../src/services/cancelGuide.js';
import { matchUtterance } from '../src/services/alexa.js';
import { ruleBasedAnswer } from '../src/services/ai.js';
import { analyzeUser } from '../src/services/analysis.js';
import { setSubscriptionStatus, dismissAnomaly, restoreAnomalies } from '../src/services/prefs.js';

const DAY = 86400000;
const NOW = SEED_ANCHOR;
const txs = generateSeed();
const subs = detectSubscriptions(txs, { now: NOW });
const byName = Object.fromEntries(subs.map((s) => [s.merchant, s]));

test('demo data rolls forward so it never goes stale', () => {
  const later = new Date(NOW.getTime() + 45 * DAY);
  const shifted = shiftSeeded(txs, later);
  const latest = (list) => Math.max(...list.map((t) => new Date(t.date).getTime()));
  assert.equal(latest(shifted) - latest(txs), 45 * DAY);
  // Subscriptions detected "45 days later" look exactly as fresh as on the anchor date
  const laterSubs = detectSubscriptions(shifted, { now: later });
  assert.equal(laterSubs.filter((s) => s.status === 'active').length, subs.filter((s) => s.status === 'active').length);
  // User-added transactions are never moved
  const mine = { id: 'mine', date: NOW.toISOString(), amount: 5, merchant: 'X', category: 'Other' };
  assert.equal(shiftSeeded([mine], later)[0].date, mine.date);
});

test('forecast adds scheduled renewals to everyday spending', () => {
  const f = forecastSpend(txs, subs, { now: NOW });
  assert.equal(f.series.length, 30);
  assert.ok(f.renewals.some((r) => r.merchant === 'Netflix'));
  assert.ok(f.renewals.filter((r) => r.merchant === 'HelloFresh').length >= 4, 'weekly renewals repeat');
  assert.ok(Math.abs(f.total - (f.subscriptions + f.everyday)) < 0.05);
  assert.ok(f.everyday > 500 && f.everyday < 4000, `everyday=${f.everyday}`);
});

test('cancel guide gives steps, a link and a ready-to-send request', () => {
  const g = cancelGuide(byName.Netflix);
  assert.equal(g.known, true);
  assert.match(g.url, /netflix\.com/);
  assert.ok(g.steps.length >= 3);
  assert.match(g.request.body, /Netflix/);
  const unknown = cancelGuide({ ...byName.Netflix, id: 'x', merchant: 'Obscure Box Club' });
  assert.equal(unknown.known, false);
  assert.match(unknown.url, /google\.com\/search/);
  assert.equal(cancelGuide(byName['Planet Fitness']).method, 'letter');
  assert.equal(cancelGuide(byName.Netflix).steps.length, g.steps.length, 'repeat calls return the same steps');
});

test('savings tips never suggest dropping a subscription marked keep', () => {
  const kept = subs.map((s) => (s.merchant === 'Spotify' ? { ...s, userStatus: 'keep' } : s));
  const music = suggestSavings(kept).find((t) => t.title.includes('music'));
  assert.ok(music.detail.includes('dropping YouTube Music would save about $10.99'));
  const trialKept = subs.map((s) => (s.merchant === 'Peloton App' ? { ...s, userStatus: 'keep' } : s));
  assert.ok(!suggestSavings(trialKept).some((t) => t.type === 'trial_converted'));
});

test('user feedback flows through the analysis', async () => {
  const user = 'feedback-test';
  const { putTransactions } = await import('../src/services/db.js');
  await putTransactions(user, txs.map((t) => ({ ...t, userId: user })));
  const before = await analyzeUser(user, { now: NOW });
  const netflix = before.subscriptions.find((s) => s.merchant === 'Netflix');
  await setSubscriptionStatus(user, netflix.id, 'cancelled');
  await dismissAnomaly(user, before.anomalies[0].id);
  const after = await analyzeUser(user, { now: NOW });
  assert.equal(after.subscriptions.find((s) => s.id === netflix.id).status, 'cancelled');
  assert.ok(Math.abs(after.summary.monthlyTotal - (before.summary.monthlyTotal - netflix.monthlyCost)) < 0.01);
  assert.equal(after.anomalies.length, before.anomalies.length - 1);
  assert.equal(after.dismissedCount, 1);
  await restoreAnomalies(user);
  assert.equal((await analyzeUser(user, { now: NOW })).anomalies.length, before.anomalies.length);
});

test('Alexa simulator maps utterances to the skill intents', () => {
  assert.equal(matchUtterance('Alexa, ask Echo Guard what renews this week').intent, 'RenewalsIntent');
  assert.equal(matchUtterance('open echo guard').type, 'LaunchRequest');
  assert.deepEqual(matchUtterance('how is my dining budget').slots, { category: 'dining' });
  assert.equal(matchUtterance('forecast my spending').intent, 'ForecastIntent');
  const free = matchUtterance('how much did I spend on dining');
  assert.equal(free.intent, 'AskIntent');
});

test('built-in assistant answers service-specific questions', () => {
  const ctx = { summary: { activeCount: 11, monthlyTotal: 417, yearlyTotal: 5004, priceHikes: [], renewingSoon: [], last30DaysSpend: 3000 }, subscriptions: subs, anomalies: [], tips: [], categoryTotals: { Dining: 790 }, budgets: [], forecast: forecastSpend(txs, subs, { now: NOW }) };
  assert.match(ruleBasedAnswer('How much is Netflix?', ctx), /Netflix costs \$17\.99/);
  assert.match(ruleBasedAnswer('how do I cancel hulu', ctx), /To cancel Hulu/);
  assert.match(ruleBasedAnswer('how much will I spend this month', ctx), /next 30 days/);
  assert.match(ruleBasedAnswer('how much did I spend on dining', ctx), /\$790\.00 on Dining/);
});
