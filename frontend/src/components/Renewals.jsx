import { money, renewalDate, inDays } from '../api';
import { Icon } from './Icon';

const fmt = (ymd) => renewalDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function Renewals({ subscriptions, limit = 5 }) {
  const soon = subscriptions
    .filter((s) => s.status === 'active' && s.daysUntilRenewal >= 0 && s.daysUntilRenewal <= 30)
    .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal)
    .slice(0, limit);
  const [next, ...rest] = soon;

  return (
    <div className="card renewals">
      <h2>Coming up <span className="count">next 30 days</span></h2>
      {!next && <div className="empty">Nothing renews in the next 30 days.</div>}
      {next && (
        <div className="next-up">
          <div className="next-row">
            <span className="next-name">{next.merchant}</span>
            <span className="next-amt">{money(next.amount)}</span>
          </div>
          <div className="next-sub">{inDays(next.daysUntilRenewal)} · {fmt(next.nextRenewal)} · <span className="cap">{next.cadence}</span></div>
          <div className="next-bar" aria-hidden="true"><span style={{ width: `${Math.max(6, 100 - (next.daysUntilRenewal / 30) * 100)}%` }} /></div>
        </div>
      )}
      <ul className="renewal-list">
        {rest.map((s) => (
          <li key={s.id}>
            <div className="renewal-main">
              <div className="merchant">{s.merchant}</div>
              <div className={`renewal-when ${s.priceChange?.pct > 0 ? 'bad' : ''}`}>
                {s.priceChange?.pct > 0 ? `Price up ${s.priceChange.pct.toFixed(0)}%` : <span className="cap">{s.cadence}</span>} · {fmt(s.nextRenewal)}
              </div>
            </div>
            <div className="renewal-amt">{money(s.amount)}</div>
            <span className={`day-chip ${s.daysUntilRenewal <= 3 ? 'soon' : ''}`} title={inDays(s.daysUntilRenewal)}>
              {s.priceChange?.pct > 0 ? <Icon name="trending-up" size={13} /> : `${s.daysUntilRenewal}d`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
