/**
 * Writes the synthetic demo transactions to src/data/transactions.json (optional: the API generates
 * them in memory when the file is missing). Edit the file to customize the local demo.
 *
 * Usage: node scripts/generate-seed.js [--out path]
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSeed } from '../src/services/demoData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : join(__dirname, '../src/data/transactions.json');

const txs = generateSeed();
writeFileSync(OUT, JSON.stringify(txs, null, 2));
console.log(`Wrote ${txs.length} transactions to ${OUT}`);
