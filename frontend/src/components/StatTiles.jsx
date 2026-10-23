import { money } from '../api';

export default function StatTiles({ summary, anomalies }) {
  const tiles = [
    { label: 'Subscriptions / month', value: money(summary.monthlyTotal), hint: `${money(summary.yearlyTotal)} per year` },
    { label: 'Active subscriptions', value: summary.activeCount, hint: `${summary.renewingSoon.length} renewing in 7 days` },
    { label: 'Spent last 30 days', value: money(summary.last30DaysSpend), hint: 'all categories' },
    { label: 'Alerts', value: anomalies.length, hint: `${anomalies.filter((a) => a.severity === 'high').length} high severity` },
  ];
  return (
    <div className="grid tiles">
      {tiles.map((t) => (
        <div className="card tile" key={t.label}>
          <div className="label">{t.label}</div>
          <div className="value">{t.value}</div>
          <div className="hint">{t.hint}</div>
        </div>
      ))}
    </div>
  );
}
