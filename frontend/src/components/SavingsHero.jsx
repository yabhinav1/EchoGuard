import { money } from '../api';
import { Icon } from './Icon';

const TIP_ICON = { overlap: 'layers', price_hike: 'trending-up', trial_converted: 'clock', info: 'x-circle' };

export default function SavingsHero({ tips, summary }) {
  const monthly = tips.reduce((s, t) => s + t.monthlySaving, 0);
  const actionable = tips.filter((t) => t.monthlySaving > 0).length;
  const share = summary.monthlyTotal > 0 ? Math.round((monthly / summary.monthlyTotal) * 100) : 0;

  return (
    <section className="card hero" aria-label="Potential savings">
      <div className="hero-main">
        <div className="eyebrow"><Icon name="sparkles" size={14} /> Potential savings</div>
        <div className="hero-value">{money(monthly)}<span>/mo</span></div>
        {tips.length > 0
          ? <p className="hero-sub">That's <strong>{money(monthly * 12)} a year</strong> from {actionable} change{actionable === 1 ? '' : 's'}, about {share}% of your {money(summary.monthlyTotal)} monthly subscription bill.</p>
          : <p className="hero-sub">Your subscriptions look lean. Nothing to cut right now.</p>}
      </div>
      {tips.length > 0 && (
        <ul className="hero-tips">
          {tips.map((t, i) => (
            <li key={i}>
              <span className="tip-icon"><Icon name={TIP_ICON[t.type] || 'sparkles'} size={15} /></span>
              <div className="tip-text">
                <div className="title">{t.title}</div>
                <div className="detail">{t.detail}</div>
              </div>
              {t.monthlySaving > 0 && <span className="tip-saving">{money(t.monthlySaving)}/mo</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
