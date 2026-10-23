import { useState } from 'react';
import { money, renewalDate, inDays } from '../api';
import { Icon } from './Icon';

const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const renewLabel = (s) => {
  if (s.status === 'cancelled') return <span className="badge good"><Icon name="check" size={11} /> you cancelled</span>;
  if (s.status === 'inactive') return <span className="badge muted">stopped</span>;
  if (s.daysUntilRenewal < 0) return <span className="dim">overdue</span>;
  if (s.daysUntilRenewal <= 7) return <span className="badge warning">{inDays(s.daysUntilRenewal)}</span>;
  return <span className="dim">{renewalDate(s.nextRenewal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>;
};

export default function Subscriptions({ subscriptions, onCancel }) {
  const [filter, setFilter] = useState('active');
  const active = subscriptions.filter((s) => s.status === 'active');
  const shown = filter === 'active' ? active : subscriptions;
  const monthly = active.reduce((sum, s) => sum + s.monthlyCost, 0);

  return (
    <div className="card">
      <h2>
        Recurring payments
        <span className="segmented" role="tablist" aria-label="Filter subscriptions">
          {[['active', `Active ${active.length}`], ['all', `All ${subscriptions.length}`]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </span>
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Service</th><th className="hide-sm">Cadence</th><th className="num hide-sm">Charge</th><th className="num">Per month</th><th>Next renewal</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className={s.status !== 'active' ? 'inactive' : undefined}>
                <td>
                  <div className="service">
                    <span className="avatar" aria-hidden="true">{initials(s.merchant)}</span>
                    <div>
                      <div className="merchant">{s.merchant}</div>
                      <div className="dim">
                        {s.category}
                        {s.priceChange?.pct > 0 && <> <span className="badge critical"><Icon name="trending-up" size={11} /> +{s.priceChange.pct.toFixed(0)}%</span></>}
                        {s.trialConverted && <> <span className="badge serious">trial converted</span></>}
                        {s.userStatus === 'keep' && <> <span className="badge"><Icon name="heart" size={11} /> keeping</span></>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="dim cap hide-sm">{s.cadence}</td>
                <td className="num hide-sm">{money(s.amount)}</td>
                <td className="num strong">{money(s.monthlyCost)}</td>
                <td>{renewLabel(s)}</td>
                <td className="row-action">
                  {(s.status === 'active' || s.userStatus) && (
                    <button className="sm" onClick={() => onCancel(s)} aria-label={`${s.status === 'active' ? 'Cancel' : 'Manage'} ${s.merchant}`}>
                      {s.status === 'active' ? 'Cancel' : 'Manage'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="total-label">Total for active subscriptions</td><td className="num strong">{money(monthly)}</td><td className="dim" colSpan={2}>{money(monthly * 12)} / yr</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
