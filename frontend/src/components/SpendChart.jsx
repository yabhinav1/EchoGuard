import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { money } from '../api';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function TipBox({ active, payload, label, prefix }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: css('--surface'), border: `1px solid ${css('--border')}`, borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
      <div style={{ color: css('--muted') }}>{prefix}{label}</div>
      <div style={{ fontWeight: 600 }}>{money(payload[0].value)}</div>
    </div>
  );
}

export function MonthlySpend({ series }) {
  const data = series.map((d) => ({ ...d, label: new Date(d.month + '-02').toLocaleDateString('en-US', { month: 'short' }) }));
  return (
    <div className="card">
      <h2>Monthly spend <span className="count">last 6 months</span></h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={css('--grid')} />
          <XAxis dataKey="label" tick={{ fill: css('--muted'), fontSize: 12 }} axisLine={{ stroke: css('--grid') }} tickLine={false} />
          <YAxis tick={{ fill: css('--muted'), fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} width={44} />
          <Tooltip content={<TipBox />} cursor={{ fill: css('--accent-soft'), opacity: 0.4 }} />
          <Bar dataKey="total" fill={css('--accent')} radius={[4, 4, 0, 0]} isAnimationActive={false} />
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
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis type="number" hide domain={[0, max * 1.05]} />
          <YAxis type="category" dataKey="name" width={96} tick={{ fill: css('--ink-2'), fontSize: 13 }} axisLine={false} tickLine={false} />
          <Tooltip content={<TipBox />} cursor={{ fill: css('--accent-soft'), opacity: 0.4 }} />
          <Bar dataKey="value" fill={css('--accent')} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fill: css('--ink-2'), fontSize: 12, formatter: (v) => money(v) }}>
            {data.map((d) => <Cell key={d.name} fill={css('--accent')} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
