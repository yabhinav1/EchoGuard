import { money, renewalDate, inDays } from '../api';
import { Icon } from './Icon';

export default function Renewals({ subscriptions }) {
  const soon = subscriptions
    .filter((s) => s.status === 'active' && s.daysUntilRenewal >= 0 && s.daysUntilRenewal <= 30)
    .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal)
    .slice(0, 5);

  return (
    <div className="card renewals">
      <h2><span className="h-icon"><Icon name="calendar" size={15} /></span>Coming up <span className="count">next 30 days</span></h2>
      {soon.length === 0 && <div className="empty">Nothing renews in the next 30 days.</div>}
      <ul className="renewal-list">
        {soon.map((s) => {
          const d = renewalDate(s.nextRenewal);
          return (
            <li key={s.id}>
              <div className="date-chip">
                <span className="m">{d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
                <span className="d">{d.getUTCDate()}</span>
              </div>
              <div className="renewal-main">
                <div className="merchant">{s.merchant}</div>
                <div className="dim"><span className="cap">{s.cadence}</span> · <span className={s.daysUntilRenewal <= 3 ? 'soon' : ''}>{inDays(s.daysUntilRenewal)}</span></div>
              </div>
              <div className="renewal-amt">
                {money(s.amount)}
                {s.priceChange?.pct > 0 && <span className="up">+{s.priceChange.pct.toFixed(0)}%</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
