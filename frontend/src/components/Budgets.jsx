import { useState } from 'react';
import { api, money } from '../api';

const COLOR = { ok: 'var(--good)', pace: 'var(--warning)', warning: 'var(--serious)', over: 'var(--critical)' };
const LABEL = { ok: 'on track', pace: 'on pace to exceed', warning: 'near limit', over: 'over budget' };

export default function Budgets({ budgets, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const start = () => { setDraft(Object.fromEntries(budgets.map((b) => [b.category, b.limit]))); setEditing(true); };
  const save = async () => {
    setBusy(true);
    try { await api.setBudgets(draft); setEditing(false); onChange?.(); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h2>
        Budgets <span className="count">this month</span>
        {editing
          ? <span className="actions"><button onClick={() => setEditing(false)} disabled={busy}>Cancel</button><button className="primary" onClick={save} disabled={busy}>Save</button></span>
          : <button onClick={start}>Edit</button>}
      </h2>
      <div className="list">
        {budgets.map((b) => (
          <div className="budget" key={b.category}>
            <div className="budget-row">
              <span className="merchant">{b.category}</span>
              {editing
                ? <span className="dim">$ <input type="number" min="0" step="10" value={draft[b.category] ?? ''} onChange={(e) => setDraft({ ...draft, [b.category]: e.target.value })} style={{ width: 80 }} /></span>
                : <span className="dim">{money(b.spent)} of {money(b.limit)} · <span style={{ color: COLOR[b.state] }}>{LABEL[b.state]}</span></span>}
            </div>
            <div className="bar" role="progressbar" aria-valuenow={b.pct} aria-valuemin="0" aria-valuemax="100" aria-label={`${b.category} budget ${b.pct}% used`}>
              <div className="bar-fill" style={{ width: `${Math.min(100, b.pct)}%`, background: COLOR[b.state] }} />
              {b.pct < 100 && b.projected > b.limit && <div className="bar-mark" style={{ left: `${Math.min(100, (b.projected / b.limit) * 100)}%` }} title={`Projected ${money(b.projected)}`} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
