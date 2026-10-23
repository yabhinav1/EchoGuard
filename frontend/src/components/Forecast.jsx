import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { money } from '../api';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const day = (ymd, opts) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });

function TipBox({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="dim">{day(p.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div className="strong">{money(p.cumulative)} so far</div>
      {p.renewals.map((r) => <div key={r.merchant} className="tip-renewal">{r.merchant} renews · {money(r.amount)}</div>)}
    </div>
  );
}

// Marks only the days a renewal lands, with a ring in the surface color so it separates from the line
function RenewalDot({ cx, cy, payload }) {
  if (!payload?.renewals?.length) return null;
  return <circle cx={cx} cy={cy} r={5} fill={css('--primary')} stroke={css('--surface')} strokeWidth={2} />;
}

export default function Forecast({ forecast }) {
  const data = forecast.series.map((p) => ({ ...p, label: day(p.date, { month: 'short', day: 'numeric' }) }));
  const subShare = forecast.total > 0 ? (forecast.subscriptions / forecast.total) * 100 : 0;
  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div>
          <div className="dim">Next {forecast.days} days, projected</div>
          <div className="chart-total">{money(forecast.total)}</div>
        </div>
        <div className="split">
          <div><span className="key renewals" />Renewals <b>{money(forecast.subscriptions)}</b></div>
          <div><span className="key everyday" />Everyday <b>{money(forecast.everyday)}</b></div>
        </div>
      </div>
      <div className="split-bar" aria-hidden="true"><span style={{ width: `${subShare}%` }} /></div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="fc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={css('--primary')} stopOpacity={0.28} />
              <stop offset="100%" stopColor={css('--primary')} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={css('--grid')} />
          <XAxis dataKey="label" tick={{ fill: css('--muted'), fontSize: 12 }} axisLine={{ stroke: css('--grid') }} tickLine={false} interval={6} />
          <YAxis tick={{ fill: css('--muted'), fontSize: 12 }} axisLine={false} tickLine={false} width={44}
            tickFormatter={(v) => (v >= 1000 ? `$${+(v / 1000).toFixed(1)}k` : `$${v}`)} />
          <Tooltip content={<TipBox />} cursor={{ stroke: css('--muted'), strokeDasharray: '3 3' }} />
          <Area type="monotone" dataKey="cumulative" stroke={css('--primary')} strokeWidth={2} fill="url(#fc-fill)"
            dot={<RenewalDot />} activeDot={{ r: 5, fill: css('--primary'), stroke: css('--surface'), strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="dim chart-note">Dots mark renewal days. Everyday spending uses your average from the last 90 days, without one-off splurges.</div>
    </div>
  );
}
