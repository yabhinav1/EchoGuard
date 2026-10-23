import { money } from '../api';

export default function Tips({ tips }) {
  const total = tips.reduce((s, t) => s + t.monthlySaving, 0);
  return (
    <div className="card">
      <h2>Ways to save <span className="count">up to {money(total)}/mo</span></h2>
      {tips.length === 0 && <div className="empty">No savings found right now.</div>}
      <div className="list">
        {tips.map((t, i) => (
          <div className="item" key={i}>
            <div>
              <div className="title">{t.title}</div>
              <div className="detail">{t.detail}</div>
            </div>
            {t.monthlySaving > 0 && <div className="saving">{money(t.monthlySaving)}/mo</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
