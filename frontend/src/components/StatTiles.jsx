import { money } from '../api';
import { Icon } from './Icon';

export default function StatTiles({ summary, anomalies }) {
  const high = anomalies.filter((a) => a.severity === 'high').length;
  const tiles = [
    { icon: 'repeat', label: 'Subscriptions / month', value: money(summary.monthlyTotal), hint: `${money(summary.yearlyTotal)} per year` },
    { icon: 'calendar', label: 'Active subscriptions', value: summary.activeCount, hint: `${summary.renewingSoon.length} renewing in 7 days` },
    { icon: 'wallet', label: 'Spent last 30 days', value: money(summary.last30DaysSpend), hint: 'all categories' },
    { icon: 'alert', label: 'Alerts', value: anomalies.length, hint: high ? `${high} high severity` : 'nothing urgent', tone: high ? 'critical' : '' },
  ];
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div className={`card tile ${t.tone}`} key={t.label}>
          <div className="tile-head"><span className="tile-icon"><Icon name={t.icon} size={15} /></span>{t.label}</div>
          <div className="value">{t.value}</div>
          <div className="hint">{t.hint}</div>
        </div>
      ))}
    </div>
  );
}
