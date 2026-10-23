/**
 * CSV import for bank/card exports. Accepts common column names.
 */
import { categorizeByRules } from './categorize.js';

const COL = {
  date: ['date', 'transaction date', 'posted date', 'trans date'],
  merchant: ['merchant', 'description', 'name', 'payee', 'memo'],
  amount: ['amount', 'debit', 'transaction amount'],
  category: ['category'],
};

function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw Object.assign(new Error('CSV needs a header row and at least one transaction'), { status: 400 });
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {};
  for (const [key, names] of Object.entries(COL)) idx[key] = header.findIndex((h) => names.includes(h));
  if (idx.date < 0 || idx.merchant < 0 || idx.amount < 0) {
    throw Object.assign(new Error(`CSV needs date, description/merchant and amount columns. Found: ${header.join(', ')}`), { status: 400 });
  }
  const txs = [];
  const seenIds = new Map(); // base id -> count, so identical same-day charges get distinct (but stable) ids
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const raw = (cols[idx.amount] || '').replace(/[$,]/g, '');
    let amount = Number(raw);
    if (!Number.isFinite(amount)) continue;
    if (amount < 0) amount = -amount; // many exports show charges as negatives
    const date = new Date(cols[idx.date]);
    if (Number.isNaN(date.getTime())) continue;
    const merchant = cols[idx.merchant] || 'Unknown';
    const category = (idx.category >= 0 && cols[idx.category]) || categorizeByRules(merchant);
    const baseId = `csv_${date.toISOString().slice(0, 10)}_${merchant.replace(/\W+/g, '').slice(0, 12)}_${amount.toFixed(2)}`;
    const n = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, n);
    txs.push({
      id: n === 1 ? baseId : `${baseId}_${n}`,
      date: date.toISOString(), merchant, amount: +amount.toFixed(2), category, source: 'csv',
    });
  }
  return txs;
}
