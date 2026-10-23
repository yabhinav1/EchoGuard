import { useState } from 'react';
import { money } from '../api';
import { Icon } from './Icon';

const DAY = 86400000;
const CADENCE_DAYS = { weekly: 7, monthly: 30, yearly: 365 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymd = (d) => d.toISOString().slice(0, 10);

/** Every charge of each active subscription that falls in the given month (UTC calendar days). */
function chargesInMonth(subscriptions, year, month) {
  const start = Date.UTC(year, month, 1, 12);
  const end = Date.UTC(year, month + 1, 0, 12);
  const out = [];
  for (const s of subscriptions.filter((x) => x.status === 'active')) {
    const step = (CADENCE_DAYS[s.cadence] || 30) * DAY;
    const anchor = new Date(`${s.nextRenewal}T12:00:00Z`).getTime();
    const first = new Date(s.firstSeen).getTime();
    // walk back to the first occurrence on/after the month start, then forward through the month
    let t = anchor - Math.ceil((anchor - start) / step) * step;
    for (; t <= end; t += step) if (t >= start && t >= first - DAY) out.push({ date: ymd(new Date(t)), sub: s });
  }
  return out;
}

export default function RenewalCalendar({ subscriptions, onCancel }) {
  const [today] = useState(() => new Date());
  const [cursor, setCursor] = useState({ y: today.getUTCFullYear(), m: today.getUTCMonth() });
  const charges = chargesInMonth(subscriptions, cursor.y, cursor.m);
  const byDay = Object.groupBy ? Object.groupBy(charges, (c) => c.date) : charges.reduce((acc, c) => ((acc[c.date] ||= []).push(c), acc), {});
  const total = charges.reduce((s, c) => s + c.sub.amount, 0);

  const firstWeekday = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const todayKey = ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12)));
  const move = (delta) => setCursor(({ y, m }) => { const d = new Date(Date.UTC(y, m + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const title = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="card calendar">
      <div className="cal-head">
        <div>
          <h2 className="cal-title">{title}</h2>
          <div className="dim">{charges.length} renewals · {money(total)} this month</div>
        </div>
        <div className="actions">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month"><Icon name="chevron-left" /></button>
          <button onClick={() => setCursor({ y: today.getUTCFullYear(), m: today.getUTCMonth() })}>Today</button>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Next month"><Icon name="chevron-right" /></button>
        </div>
      </div>
      <div className="cal-grid" role="grid" aria-label={`Renewals in ${title}`}>
        {WEEKDAYS.map((w) => <div key={w} className="cal-weekday" role="columnheader">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="cal-cell empty" />;
          const key = ymd(new Date(Date.UTC(cursor.y, cursor.m, d, 12)));
          const items = byDay[key] || [];
          return (
            <div key={key} className={`cal-cell ${key === todayKey ? 'today' : ''} ${key < todayKey ? 'past' : ''}`} role="gridcell">
              <span className="cal-day">{d}</span>
              {items.slice(0, 3).map(({ sub }) => (
                <button key={sub.id} className={`cal-chip ${sub.priceChange?.pct > 0 ? 'hike' : ''}`} onClick={() => onCancel(sub)}
                  title={`${sub.merchant} · ${money(sub.amount)}`}>
                  <span className="cal-chip-name">{sub.merchant}</span><span className="cal-chip-amt">{money(sub.amount)}</span>
                </button>
              ))}
              {items.length > 3 && <span className="dim">+{items.length - 3} more</span>}
            </div>
          );
        })}
      </div>
      <ul className="cal-list" aria-label="Renewals this month">
        {charges.sort((a, b) => a.date.localeCompare(b.date)).map(({ date, sub }) => (
          <li key={date + sub.id}>
            <span className="dim">{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
            <span className="merchant">{sub.merchant}</span>
            <span className="renewal-amt">{money(sub.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
