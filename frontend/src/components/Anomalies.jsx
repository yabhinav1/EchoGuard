import { shortDate } from '../api';

const TYPE_LABEL = {
  duplicate_charge: 'Duplicate charge',
  category_outlier: 'Unusual amount',
  new_merchant_large: 'New merchant',
  weekly_spike: 'Spending spike',
};

export default function Anomalies({ anomalies }) {
  return (
    <div className="card">
      <h2>Unusual activity <span className="count">{anomalies.length} flagged</span></h2>
      {anomalies.length === 0 && <div className="empty">Nothing unusual. Nice.</div>}
      <div className="list">
        {anomalies.map((a) => (
          <div className="item" key={a.id}>
            <span className={`sev ${a.severity}`} title={a.severity} />
            <div>
              <div className="title">{TYPE_LABEL[a.type] || a.type} <span className="dim">· {shortDate(a.transaction.date)} · {a.severity}</span></div>
              <div className="detail">{a.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
