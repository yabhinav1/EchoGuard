import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText, parseMoney, parseDate } from '../src/services/receipts.js';
import { parseCsv } from '../src/services/importers.js';
import { categorizeByRules } from '../src/services/categorize.js';
import { budgetStatus } from '../src/services/budgets.js';

test('parses a plain-text receipt', () => {
  const r = parseReceiptText(`Whole Foods Market
123 Main St
10/21/2026
Bananas        2.49
Oat Milk       4.99
Subtotal       7.48
Tax            0.00
TOTAL          7.48
Thank you!`);
  assert.equal(r.merchant, 'Whole Foods Market');
  assert.equal(r.amount, 7.48);
  assert.equal(r.date.slice(0, 10), '2026-10-21');
  assert.equal(r.items.length, 2);
});

test('money and date helpers', () => {
  assert.equal(parseMoney('$1,234.56'), 1234.56);
  assert.equal(parseMoney('TOTAL 12.5'), 12.5);
  assert.equal(parseDate('2026-03-04').slice(0, 10), '2026-03-04');
  assert.equal(parseDate('3/4/26').slice(0, 10), '2026-03-04');
});

test('parses a bank CSV with negative charges', () => {
  const txs = parseCsv(`Date,Description,Amount
2026-10-01,STARBUCKS #1234,-5.75
2026-10-02,"Uber, Trip",-18.20
2026-10-03,PAYROLL,2500.00`);
  assert.equal(txs.length, 3);
  assert.equal(txs[0].amount, 5.75);
  assert.equal(txs[0].category, 'Dining');
  assert.equal(txs[1].merchant, 'Uber, Trip');
  assert.equal(txs[1].category, 'Transport');
});

test('keyword categorizer', () => {
  assert.equal(categorizeByRules('NETFLIX.COM'), 'Entertainment');
  assert.equal(categorizeByRules('Some Unknown Store'), 'Other');
});

test('budget status thresholds', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const txs = [
    { date: '2026-10-02T00:00:00Z', amount: 500, category: 'Dining' },
    { date: '2026-10-03T00:00:00Z', amount: 50, category: 'Groceries' },
    { date: '2026-09-03T00:00:00Z', amount: 999, category: 'Groceries' }, // last month, ignored
  ];
  const status = budgetStatus({ Dining: 600, Groceries: 700 }, txs, { now });
  const dining = status.find((b) => b.category === 'Dining');
  assert.equal(dining.state, 'warning');
  assert.equal(dining.pct, 83);
  assert.equal(status.find((b) => b.category === 'Groceries').spent, 50);
});

test('identical same-day CSV rows get distinct, stable ids', () => {
  const csv = `Date,Description,Amount
2026-10-01,STARBUCKS,-5.75
2026-10-01,STARBUCKS,-5.75`;
  const first = parseCsv(csv);
  assert.equal(new Set(first.map((t) => t.id)).size, 2);
  assert.deepEqual(parseCsv(csv).map((t) => t.id), first.map((t) => t.id), 're-importing the same file must not duplicate');
});

test('bank sync skips transfers and card payments', async () => {
  const { isSpending } = await import('../src/services/plaid.js');
  const t = (primary, amount = 25, pending = false) => ({ amount, pending, personal_finance_category: { primary } });
  assert.equal(isSpending(t('FOOD_AND_DRINK')), true);
  assert.equal(isSpending(t('LOAN_PAYMENTS')), false, 'credit card payment');
  assert.equal(isSpending(t('TRANSFER_OUT')), false);
  assert.equal(isSpending(t('FOOD_AND_DRINK', -25)), false, 'refund');
  assert.equal(isSpending(t('FOOD_AND_DRINK', 25, true)), false, 'pending');
});
