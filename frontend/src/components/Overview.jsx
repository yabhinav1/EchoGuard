import { useState } from 'react';
import { money } from '../api';
import { Icon } from './Icon';

/** The top row of colored summary cards. */
export default function Overview({ summary, tips, anomalies, onNavigate }) {
  const [period, setPeriod] = useState('month');
  const saving = tips.reduce((s, t) => s + t.monthlySaving, 0);
  const high = anomalies.filter((a) => a.severity === 'high').length;

  return (
    <div className="overview">
      <div className="stat-card purple">
        <div className="stat-top">
          <span className="stat-icon"><Icon name="sparkles" size={20} /></span>
        </div>
        <div className="stat-value">{money(saving)}<span className="stat-chip"><Icon name="arrow-up-right" size={14} /></span></div>
        <div className="stat-label">Potential savings per month</div>
        <div className="stat-foot">≈ {money(saving * 12)} a year from {tips.filter((t) => t.monthlySaving > 0).length} changes</div>
      </div>

      <div className="stat-card blue">
        <div className="stat-top">
          <span className="stat-icon"><Icon name="repeat" size={20} /></span>
          <div className="toggle" role="tablist" aria-label="Period">
            {[['month', 'Month'], ['year', 'Year']].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="stat-value">{money(period === 'month' ? summary.monthlyTotal : summary.yearlyTotal)}</div>
        <div className="stat-label">Subscriptions per {period}</div>
        <div className="stat-foot">{summary.activeCount} active · {summary.renewingSoon.length} renewing this week</div>
      </div>

      <div className="mini-stack">
        <div className="mini-card blue">
          <span className="mini-icon"><Icon name="wallet" size={20} /></span>
          <div>
            <div className="mini-value">{money(summary.last30DaysSpend)}</div>
            <div className="mini-label">Spent in the last 30 days</div>
          </div>
        </div>
        <button className="mini-card light" onClick={() => onNavigate('activity')}>
          <span className="mini-icon warn"><Icon name="alert" size={20} /></span>
          <div>
            <div className="mini-value">{anomalies.length} alerts</div>
            <div className="mini-label">{high ? `${high} high severity` : 'Nothing urgent'}</div>
          </div>
        </button>
      </div>
    </div>
  );
}
