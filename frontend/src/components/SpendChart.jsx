import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { money } from '../api';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** Round axis ticks: steps of 1, 2, 2.5 or 5 x 10^n so labels read $1k, $2k... instead of $0.7k. */
function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}
const axisMoney = (v) => (v >= 1000 ? `$${+(v / 1000).toFixed(1)}k` : `$${v}`);

function TipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="dim">{payload[0].payload.full || label}</div>
      <div className="strong">{money(payload[0].value)}</div>
    </div>
  );
}

export function MonthlySpend({ series }) {
  const [months, setMonths] = useState(6);
  const data = series.slice(-months).map((d) => {
    const dt = new Date(`${d.month}-15T12:00:00Z`);
    return { ...d, label: dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), full: dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  });
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const ticks = niceTicks(Math.max(...data.map((d) => d.total), 0));
  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div>
          <div className="dim">Total spend</div>
          <div className="chart-total">{money(total)}</div>
        </div>
        <select value={months} onChange={(e) => setMonths(+e.target.value)} aria-label="Range">
          <option value={6}>Last 6 months</option>
          <option value={3}>Last 3 months</option>
        </select>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="38%">
          <CartesianGrid vertical={false} stroke={css('--grid')} />
          <XAxis dataKey="label" tick={{ fill: css('--muted'), fontSize: 12 }} axisLine={{ stroke: css('--grid') }} tickLine={false} />
          <YAxis ticks={ticks} domain={[0, ticks.at(-1)]} tick={{ fill: css('--muted'), fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={axisMoney} width={44} />
          <Tooltip content={<TipBox />} cursor={{ fill: css('--primary-light'), opacity: 0.6 }} />
          <Bar dataKey="total" fill={css('--primary')} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBreakdown({ totals }) {
  const data = Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const max = data[0]?.value || 1;
  return (
    <div className="card">
      <h2>Spend by category <span className="count">last 30 days</span></h2>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis type="number" hide domain={[0, max * 1.05]} />
          <YAxis type="category" dataKey="name" width={96} tick={{ fill: css('--ink-2'), fontSize: 13 }} axisLine={false} tickLine={false} />
          <Tooltip content={<TipBox />} cursor={{ fill: css('--secondary-light'), opacity: 0.6 }} />
          <Bar dataKey="value" fill={css('--secondary')} radius={[0, 4, 4, 0]} isAnimationActive={false}
            label={{ position: 'right', fill: css('--ink-2'), fontSize: 12, formatter: (v) => money(v) }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
