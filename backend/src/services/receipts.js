/**
 * Receipt scanning. Images go through Amazon Textract AnalyzeExpense; plain text (or demo mode)
 * goes through a regex parser. The merchant is then categorized by Bedrock, with a keyword fallback.
 */
import { categorize } from './categorize.js';

const textractEnabled = () => process.env.USE_TEXTRACT === 'true' || !!process.env.TABLE_NAME;

async function analyzeWithTextract(imageBase64) {
  const { TextractClient, AnalyzeExpenseCommand } = await import('@aws-sdk/client-textract');
  const client = new TextractClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const res = await client.send(new AnalyzeExpenseCommand({ Document: { Bytes: Buffer.from(imageBase64, 'base64') } }));
  const doc = res.ExpenseDocuments?.[0];
  if (!doc) throw new Error('Textract found no receipt in the image');

  const fields = {};
  for (const f of doc.SummaryFields || []) {
    const type = f.Type?.Text;
    if (type && !fields[type]) fields[type] = { text: f.ValueDetection?.Text, confidence: f.ValueDetection?.Confidence };
  }
  const items = [];
  for (const group of doc.LineItemGroups || []) {
    for (const li of group.LineItems || []) {
      const f = Object.fromEntries((li.LineItemExpenseFields || []).map((x) => [x.Type?.Text, x.ValueDetection?.Text]));
      if (f.ITEM) items.push({ name: f.ITEM, price: parseMoney(f.PRICE) });
    }
  }
  const total = parseMoney(fields.TOTAL?.text) ?? parseMoney(fields.AMOUNT_PAID?.text);
  return {
    merchant: fields.VENDOR_NAME?.text || fields.NAME?.text || 'Unknown merchant',
    amount: total,
    date: parseDate(fields.INVOICE_RECEIPT_DATE?.text),
    items,
    confidence: Math.round(fields.TOTAL?.confidence || 0),
    source: 'textract',
  };
}

export function parseMoney(str) {
  if (str == null) return null;
  const m = String(str).replace(/,/g, '').match(/-?\d+(?:\.\d{1,2})?/);
  return m ? +m[0] : null;
}

export function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  const noon = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d, 12)); return Number.isNaN(dt.getTime()) ? null : dt.toISOString(); };
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return noon(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) return noon(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  const d = new Date(s); // "Oct 21, 2026" etc. Use the local calendar date, pinned to noon UTC.
  if (!Number.isNaN(d.getTime())) return noon(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return null;
}

/** Fallback parser for plain receipt text (OCR output, email receipts, demo mode). */
export function parseReceiptText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const merchant = lines.find((l) => !/^\d/.test(l) && !/total|subtotal|tax|date|receipt|thank/i.test(l)) || 'Unknown merchant';

  let amount = null;
  for (const l of lines) {
    if (/\b(grand\s*)?total\b/i.test(l) && !/sub\s*total/i.test(l)) { amount = parseMoney(l.replace(/.*total/i, '')); if (amount != null) break; }
  }
  if (amount == null) {
    const nums = lines.flatMap((l) => (l.match(/\$?\d+\.\d{2}/g) || []).map(parseMoney));
    amount = nums.length ? Math.max(...nums) : null;
  }
  let date = null;
  for (const l of lines) { date = parseDate((l.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}/) || [])[0]); if (date) break; }

  const items = [];
  for (const l of lines) {
    const m = l.match(/^(.+?)\s+\$?(\d+\.\d{2})$/);
    if (m && !/total|tax|tip|change|cash|visa|card/i.test(m[1])) items.push({ name: m[1].trim(), price: +m[2] });
  }
  return { merchant, amount, date, items, confidence: amount != null ? 60 : 20, source: 'text' };
}

export async function scanReceipt({ imageBase64, text }) {
  let parsed;
  if (imageBase64) {
    if (!textractEnabled()) {
      throw Object.assign(new Error('Image scanning needs Amazon Textract. Run with USE_TEXTRACT=true and AWS credentials, or paste the receipt text instead.'), { status: 400 });
    }
    parsed = await analyzeWithTextract(imageBase64);
  } else if (text) {
    parsed = parseReceiptText(text);
  } else {
    throw Object.assign(new Error('Provide imageBase64 or text'), { status: 400 });
  }
  const cat = await categorize(parsed.merchant, parsed.items.map((i) => i.name));
  return {
    ...parsed,
    date: parsed.date || new Date().toISOString(),
    category: cat.category,
    categorySource: cat.source,
  };
}
