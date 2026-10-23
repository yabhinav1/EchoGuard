import { money } from '../api';

const renewLabel = (s) => {
  if (s.status === 'inactive') return <span className="badge muted">inactive</span>;
  if (s.daysUntilRenewal < 0) return <span className="dim">overdue</span>;
  if (s.daysUntilRenewal === 0) return <span className="badge warning">today</span>;
  if (s.daysUntilRenewal <= 7) return <span className="badge warning">in {s.daysUntilRenewal}d</span>;
  return <span className="dim">{s.nextRenewal}</span>;
};

export default function Subscriptions({ subscriptions }) {
  return (
    <div className="card">
      <h2>Recurring payments <span className="count">{subscriptions.filter((s) => s.status === 'active').length} active</span></h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr><th>Service</th><th>Cadence</th><th className="num">Charge</th><th className="num">Per month</th><th>Next renewal</th></tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => (
              <tr key={s.id} style={s.status === 'inactive' ? { opacity: 0.55 } : undefined}>
                <td>
                  <div className="merchant">{s.merchant}</div>
                  <div className="dim">
                    {s.category}
                    {s.priceChange?.pct > 0 && <> · <span className="badge critical">+{s.priceChange.pct.toFixed(0)}% price hike</span></>}
                    {s.trialConverted && <> · <span className="badge serious">trial converted</span></>}
                  </div>
                </td>
                <td className="dim">{s.cadence}</td>
                <td className="num">{money(s.amount)}</td>
                <td className="num">{money(s.monthlyCost)}</td>
                <td>{renewLabel(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
