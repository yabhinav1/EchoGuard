import { useState } from 'react';
import { api, money, shortDate } from '../api';
import { Icon } from './Icon';

const TYPE = {
  duplicate_charge: { label: 'Duplicate charge', icon: 'copy' },
  category_outlier: { label: 'Unusual amount', icon: 'alert' },
  new_merchant_large: { label: 'New merchant', icon: 'tag' },
  weekly_spike: { label: 'Spending spike', icon: 'zap' },
};

export default function Anomalies({ anomalies, dismissedCount = 0, onChange, notify }) {
  const [busy, setBusy] = useState(null);

  const dismiss = async (a) => {
    setBusy(a.id);
    try { await api.dismissAnomaly(a.id); notify?.('Marked as not suspicious. EchoGuard will stop flagging it.'); await onChange?.(); }
    catch (e) { notify?.(`Error: ${e.message}`); } finally { setBusy(null); }
  };
  const restore = async () => {
    setBusy('restore');
    try { await api.restoreAnomalies(); await onChange?.(); } finally { setBusy(null); }
  };

  return (
    <div className="card">
      <h2>
        Unusual activity <span className="count">{anomalies.length} flagged</span>
        {dismissedCount > 0 && (
          <button className="sm ghost-btn" onClick={restore} disabled={busy === 'restore'}><Icon name="undo" size={13} />Show {dismissedCount} dismissed</button>
        )}
      </h2>
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
                <button className="link-btn" onClick={() => dismiss(a)} disabled={busy === a.id}>
                  <Icon name="eye-off" size={13} />{a.type === 'duplicate_charge' ? 'Not a duplicate' : 'Not suspicious'}
                </button>
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
