import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Logo } from './components/Logo';
import { Icon } from './components/Icon';
import Sidebar from './components/Sidebar';
import { NAV } from './nav';
import Overview from './components/Overview';
import SavingsList from './components/SavingsList';
import { MonthlySpend, CategoryBreakdown } from './components/SpendChart';
import Subscriptions from './components/Subscriptions';
import Anomalies from './components/Anomalies';
import Renewals from './components/Renewals';
import Chat from './components/Chat';
import { useChat } from './useChat';
import Budgets from './components/Budgets';
import Import from './components/Import';
import Forecast from './components/Forecast';
import RenewalCalendar from './components/RenewalCalendar';
import AlexaSimulator from './components/AlexaSimulator';
import CancelModal from './components/CancelModal';
import { authEnabled, currentUser, signIn, signOut, completeSignIn } from './auth';
import { useTheme } from './theme';

const VIEWS = NAV.flatMap((g) => g.items).filter((i) => i.id !== 'assistant');
const viewFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return VIEWS.some((v) => v.id === id) ? id : 'dashboard';
};

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [digest, setDigest] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [features, setFeatures] = useState(null);
  const [user, setUser] = useState(null);
  const [view, setView] = useState(viewFromHash);
  const [navOpen, setNavOpen] = useState(() => window.innerWidth > 1024);
  const [chatOpen, setChatOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [theme, toggleTheme] = useTheme();
  const chat = useChat();

  const load = () => api.dashboard().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  const closeCancel = useCallback(() => setCancelTarget(null), []);
  // Accepts a subscription object or its id (savings tips only carry ids)
  const openCancel = (subOrId) => setCancelTarget(typeof subOrId === 'string' ? data?.subscriptions.find((s) => s.id === subOrId) || null : subOrId);
  useEffect(() => {
    (async () => {
      try { if (authEnabled()) await completeSignIn(); } catch (e) { setError(e.message); return; }
      setUser(currentUser());
      if (authEnabled() && !currentUser()) return; // show sign-in screen
      api.health().then((h) => setFeatures(h.features)).catch(() => {});
      load();
    })();
  }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setChatOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = (id) => {
    if (id === 'assistant') { setChatOpen(true); } else {
      window.location.hash = `/${id}`;
      setView(id);
      window.scrollTo({ top: 0 });
    }
    if (window.innerWidth <= 1024) setNavOpen(false);
  };

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };
  const onReminders = async () => {
    setBusy(true);
    try {
      const r = await api.runReminders();
      notify(r.remindersSent ? `Sent ${r.remindersSent} reminder${r.remindersSent > 1 ? 's' : ''}${features?.sns ? '' : ' (logged to the API console in demo mode)'}` : 'Nothing due in the next 3 days');
    } catch (e) { notify(`Error: ${e.message}`); } finally { setBusy(false); }
  };
  const onResetDemo = async () => {
    if (!window.confirm('Reset your demo? Your linked banks, imports, marks and budget changes in this browser are cleared.')) return;
    setBusy(true);
    try { await api.resetDemo(); setDigest(null); await load(); notify('Your demo is back to the original data'); }
    catch (e) { notify(`Error: ${e.message}`); } finally { setBusy(false); }
  };
  const onDigest = async () => {
    setBusy(true);
    try { setDigest((await api.digest()).text); navigate('dashboard'); } catch (e) { notify(`Error: ${e.message}`); } finally { setBusy(false); }
  };
  const onSearch = (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    chat.ask(search);
    setSearch('');
    setChatOpen(true);
  };

  if (error) {
    return (
      <div className="center-screen">
        <div className="card center-card">
          <Logo size={44} />
          <h1>Can't reach the EchoGuard API</h1>
          <p className="dim">{error}. Is the backend running on port 4000?</p>
          <button className="primary" onClick={() => { setError(null); load(); }}>Try again</button>
        </div>
      </div>
    );
  }
  if (authEnabled() && !user) {
    return (
      <div className="center-screen">
        <div className="card center-card">
          <Logo size={48} />
          <h1>EchoGuard</h1>
          <p className="dim">Find every subscription, catch sneaky price hikes and surprise charges, and see exactly what to cancel.</p>
          <button className="primary" onClick={signIn}>Sign in</button>
        </div>
      </div>
    );
  }

  const live = !!features?.bedrock;
  const title = VIEWS.find((v) => v.id === view)?.label;

  return (
    <div className={`shell ${navOpen ? 'nav-open' : 'nav-closed'}`}>
      <header className="topbar">
        <div className="topbar-brand">
          <a className="brand" href="#/dashboard" onClick={(e) => { e.preventDefault(); navigate('dashboard'); }}>
            <Logo size={32} /><span className="brand-name">EchoGuard</span>
          </a>
          <button className="square-btn primary-soft" onClick={() => setNavOpen((o) => !o)} aria-label="Toggle navigation" aria-expanded={navOpen}>
            <Icon name="menu" size={18} />
          </button>
        </div>
        <form className="search" onSubmit={onSearch} role="search">
          <Icon name="search" size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='Ask anything, e.g. "what can I cancel?"' aria-label="Ask EchoGuard" />
          <button type="submit" className="square-btn primary-soft sm" aria-label="Ask"><Icon name="sparkles" size={16} /></button>
        </form>
        <div className="topbar-actions">
          <button className="square-btn warn-soft" onClick={() => navigate('activity')} aria-label={`${data?.anomalies.length ?? 0} alerts`} title="Unusual activity">
            <Icon name="bell" size={18} />
            {data?.anomalies.length > 0 && <span className="dot-badge">{data.anomalies.length}</span>}
          </button>
          <div className="profile-pill">
            <span className="avatar-circle" title={user?.email || 'Demo user'}>{(user?.email?.[0] || 'D').toUpperCase()}</span>
            <button className="pill-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle theme">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
            {user && <button className="pill-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" size={18} /></button>}
          </div>
        </div>
      </header>

      <Sidebar view={view} onNavigate={navigate} alertCount={data?.anomalies.length || 0} live={live} busy={busy || !data}
        onDigest={onDigest} onReminders={onReminders} />
      {navOpen && <div className="scrim nav-scrim" onClick={() => setNavOpen(false)} />}

      <main className="content">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <div className="dim">{data ? `${data.transactionCount} transactions analyzed · ${user ? 'your account' : 'your private copy of the demo: changes only show in this browser'}` : 'Loading your data...'}</div>
          </div>
          {!user && data && (
            <button className="sm" onClick={onResetDemo} disabled={busy} title="Undo everything you changed in this browser">
              <Icon name="undo" size={14} />Reset my demo
            </button>
          )}
        </div>

        {!data ? (
          <div className="page" aria-busy="true">
            <div className="overview">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 190 }} />)}</div>
            <div className="row"><div className="skeleton span-8" style={{ height: 380 }} /><div className="skeleton span-4" style={{ height: 380 }} /></div>
          </div>
        ) : (
          <div className="page">
            {digest && (
              <div className="card digest-card">
                <h2>Weekly digest <button className="icon-btn ghost" onClick={() => setDigest(null)} aria-label="Close digest"><Icon name="x" /></button></h2>
                <div className="digest">{digest}</div>
              </div>
            )}

            {view === 'dashboard' && <>
              <Overview summary={data.summary} tips={data.tips} anomalies={data.anomalies} onNavigate={navigate} />
              <div className="row">
                <div className="span-8"><MonthlySpend series={data.monthlySeries} /></div>
                <div className="span-4"><Renewals subscriptions={data.subscriptions} /></div>
              </div>
              <div className="row">
                <div className="span-6"><Forecast forecast={data.forecast} /></div>
                <div className="span-6"><SavingsList tips={data.tips} subscriptions={data.subscriptions} onCancel={openCancel} /></div>
              </div>
              <Anomalies anomalies={data.anomalies} dismissedCount={data.dismissedCount} onChange={load} notify={notify} />
              <div className="row">
                <div className="span-6"><CategoryBreakdown totals={data.categoryTotals} /></div>
                <div className="span-6"><Budgets budgets={data.budgets} onChange={load} /></div>
              </div>
            </>}

            {view === 'subscriptions' && (
              <div className="row">
                <div className="span-8"><Subscriptions subscriptions={data.subscriptions} onCancel={openCancel} /></div>
                <div className="span-4 stack-col"><Renewals subscriptions={data.subscriptions} limit={8} /><SavingsList tips={data.tips} subscriptions={data.subscriptions} onCancel={openCancel} /></div>
              </div>
            )}

            {view === 'calendar' && (
              <div className="row">
                <div className="span-8"><RenewalCalendar subscriptions={data.subscriptions} onCancel={openCancel} /></div>
                <div className="span-4 stack-col"><Forecast forecast={data.forecast} /><Renewals subscriptions={data.subscriptions} limit={6} /></div>
              </div>
            )}

            {view === 'alexa' && <AlexaSimulator />}

            {view === 'activity' && <>
              <Anomalies anomalies={data.anomalies} dismissedCount={data.dismissedCount} onChange={load} notify={notify} />
              <div className="row">
                <div className="span-6"><CategoryBreakdown totals={data.categoryTotals} /></div>
                <div className="span-6"><MonthlySpend series={data.monthlySeries} /></div>
              </div>
            </>}

            {view === 'budgets' && (
              <div className="row">
                <div className="span-6"><Budgets budgets={data.budgets} onChange={load} /></div>
                <div className="span-6"><CategoryBreakdown totals={data.categoryTotals} /></div>
              </div>
            )}

            {view === 'import' && (
              <div className="row">
                <div className="span-6"><Import features={features} onImported={load} notify={notify} /></div>
                <div className="span-6 import-help card">
                  <h2>Where your data comes from</h2>
                  <ul className="help-list">
                    <li><Icon name="receipt" size={18} /><div><b>Receipts</b><span>Photos go through Amazon Textract; Bedrock picks the category.</span></div></li>
                    <li><Icon name="file" size={18} /><div><b>CSV exports</b><span>Any bank or card export with date, description and amount columns.</span></div></li>
                    <li><Icon name="bank" size={18} /><div><b>Bank sync</b><span>Plaid Link with incremental sync; banks you link stay private to your browser.</span></div></li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
        <footer className="footer">Built on AWS Lambda · DynamoDB · Amazon Bedrock · Textract · SNS · EventBridge · Cognito · Alexa</footer>
      </main>

      <button className="fab" onClick={() => setChatOpen(true)} aria-label="Ask EchoGuard" title="Ask EchoGuard">
        <Icon name="sparkles" size={22} />
      </button>
      {chatOpen && <div className="scrim" onClick={() => setChatOpen(false)} />}
      <aside className={`drawer ${chatOpen ? 'open' : ''}`} aria-hidden={!chatOpen} aria-label="Assistant">
        {chatOpen && <Chat chat={chat} onClose={() => setChatOpen(false)} />}
      </aside>

      {cancelTarget && <CancelModal subscription={cancelTarget} onClose={closeCancel} onChanged={load} notify={notify} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
