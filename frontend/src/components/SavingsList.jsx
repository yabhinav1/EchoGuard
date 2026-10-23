import { money } from '../api';
import { Icon } from './Icon';

const TIP_ICON = { overlap: 'layers', price_hike: 'trending-up', trial_converted: 'clock', info: 'x-circle' };

export default function SavingsList({ tips }) {
  const total = tips.reduce((s, t) => s + t.monthlySaving, 0);
  return (
    <div className="card">
      <h2>Ways to save <span className="count">up to {money(total)}/mo</span></h2>
      {tips.length === 0 && <div className="empty"><Icon name="check" /> Your subscriptions look lean.</div>}
      <ul className="tip-list">
        {tips.map((t, i) => (
          <li key={i}>
            <span className={`tip-icon ${t.type}`}><Icon name={TIP_ICON[t.type] || 'sparkles'} size={16} /></span>
            <div className="tip-text">
              <div className="title">{t.title}</div>
              <div className="detail">{t.detail}</div>
            </div>
            {t.monthlySaving > 0 && <span className="tip-saving">{money(t.monthlySaving)}<small>/mo</small></span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
