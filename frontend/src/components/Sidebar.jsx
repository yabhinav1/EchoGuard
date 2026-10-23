import { Icon } from './Icon';
import { NAV } from '../nav';

const REPO = 'https://github.com/yabhinav1/EchoGuard';

export default function Sidebar({ view, onNavigate, alertCount, live, busy, onDigest, onReminders }) {
  return (
    <nav className="sidebar" aria-label="Main">
      {NAV.map((g) => (
        <div className="nav-group" key={g.group}>
          <div className="nav-title">{g.group}</div>
          {g.caption && <div className="nav-caption">{g.caption}</div>}
          {g.items.map((it) => (
            <a key={it.id} href={`#/${it.id}`} className={`nav-item ${view === it.id ? 'active' : ''}`}
              aria-current={view === it.id ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); onNavigate(it.id); }}>
              <Icon name={it.icon} size={18} />
              <span>{it.label}</span>
              {it.badge === 'alerts' && alertCount > 0 && <span className="nav-badge">{alertCount}</span>}
            </a>
          ))}
        </div>
      ))}
      <div className="nav-group">
        <div className="nav-title">Resources</div>
        <a className="nav-item" href={REPO} target="_blank" rel="noreferrer"><Icon name="github" size={18} /><span>Source code</span></a>
        <a className="nav-item" href={`${REPO}/blob/main/docs/ARCHITECTURE.md`} target="_blank" rel="noreferrer"><Icon name="book" size={18} /><span>Architecture</span></a>
      </div>

      <div className="side-card">
        <div className="side-card-title">Stay ahead of renewals</div>
        <p>Get a digest of this week, or send renewal and alert reminders now.</p>
        <div className="side-card-actions">
          <button onClick={onDigest} disabled={busy}><Icon name="mail" size={14} />Digest</button>
          <button className="primary" onClick={onReminders} disabled={busy}><Icon name="bell" size={14} />Remind</button>
        </div>
        <div className={`status-line ${live ? 'live' : ''}`}><span className="dot" />{live ? 'Claude on Amazon Bedrock' : 'Demo mode · rule-based AI'}</div>
      </div>
    </nav>
  );
}
