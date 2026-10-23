import { money, shortDate } from '../api';
import { Icon } from './Icon';

const TYPE = {
  duplicate_charge: { label: 'Duplicate charge', icon: 'copy' },
  category_outlier: { label: 'Unusual amount', icon: 'alert' },
  new_merchant_large: { label: 'New merchant', icon: 'tag' },
  weekly_spike: { label: 'Spending spike', icon: 'zap' },
};

export default function Anomalies({ anomalies }) {
  return (
    <div className="card">
      <h2>Unusual activity <span className="count">{anomalies.length} flagged</span></h2>
      {anomalies.length === 0 && <div className="empty"><Icon name="check" /> Nothing unusual. Nice.</div>}
      <div className="alerts">
        {anomalies.map((a) => {
          const t = TYPE[a.type] || { label: a.type, icon: 'alert' };
          return (
            <div className={`alert ${a.severity}`} key={a.id}>
              <span className="alert-icon"><Icon name={t.icon} size={15} /></span>
              <div className="alert-body">
                <div className="title">{t.label} <span className={`sev-pill ${a.severity}`}>{a.severity}</span></div>
                <div className="detail">{a.reason}</div>
              </div>
              <div className="alert-meta">
                {/* A weekly spike is about the week's total, not the one charge that represents it */}
                <div className="amt">{money(a.weekTotal ?? a.transaction.amount)}</div>
                <div className="dim">{a.type === 'weekly_spike' ? 'this week' : shortDate(a.transaction.date)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
