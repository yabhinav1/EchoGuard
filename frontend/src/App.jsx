import { useEffect, useState } from 'react';
import { api } from './api';
import { Logo } from './components/Logo';
import { Icon } from './components/Icon';
import SavingsHero from './components/SavingsHero';
import StatTiles from './components/StatTiles';
import { MonthlySpend, CategoryBreakdown } from './components/SpendChart';
import Subscriptions from './components/Subscriptions';
import Anomalies from './components/Anomalies';
import Renewals from './components/Renewals';
import Chat from './components/Chat';
import Budgets from './components/Budgets';
import Import from './components/Import';
import { authEnabled, currentUser, signIn, signOut, completeSignIn } from './auth';
import { useTheme } from './theme';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [digest, setDigest] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [features, setFeatures] = useState(null);
  const [user, setUser] = useState(null);
  const [theme, toggleTheme] = useTheme();

  const load = () => api.dashboard().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  useEffect(() => {
    (async () => {
      try { if (authEnabled()) await completeSignIn(); } catch (e) { setError(e.message); return; }
      setUser(currentUser());
      if (authEnabled() && !currentUser()) return; // show sign-in screen
      api.health().then((h) => setFeatures(h.features)).catch(() => {});
      load();
    })();
  }, []);

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const onReminders = async () => {
    setBusy(true);
    try {
      const r = await api.runReminders();
      notify(r.remindersSent ? `Sent ${r.remindersSent} reminder${r.remindersSent > 1 ? 's' : ''}${features?.sns ? '' : ' (logged to the API console in demo mode)'}` : 'Nothing due in the next 3 days');
    } catch (e) { notify(`Error: ${e.message}`); } finally { setBusy(false); }
  };
  const onDigest = async () => {
    setBusy(true);
    try { setDigest((await api.digest()).text); } catch (e) { notify(`Error: ${e.message}`); } finally { setBusy(false); }
  };

  const themeButton = (
    <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle theme">
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );

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

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <Logo size={34} />
            <div>
              <div className="brand-name">EchoGuard</div>
              <div className="brand-sub">{data ? `${data.transactionCount} transactions analyzed` : 'Loading your data...'}</div>
            </div>
          </div>
          <div className="actions">
            <span className={`status-pill ${live ? 'live' : ''}`} title={live ? 'Answers come from Claude on Amazon Bedrock' : 'Running offline with rule-based answers'}>
              <span className="dot" />{live ? 'Claude on Bedrock' : 'Demo mode'}
            </span>
            {user && <span className="user">{user.email}</span>}
            <button onClick={onDigest} disabled={busy || !data}><Icon name="mail" />Weekly digest</button>
            <button className="primary" onClick={onReminders} disabled={busy || !data}><Icon name="bell" />Send reminders</button>
            {themeButton}
            {user && <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>}
          </div>
        </div>
      </header>

      {!data ? (
        <div className="wrap layout" aria-busy="true">
          <main className="main">
            <div className="skeleton" style={{ height: 220 }} />
            <div className="tiles">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 104 }} />)}</div>
            <div className="grid two"><div className="skeleton" style={{ height: 280 }} /><div className="skeleton" style={{ height: 280 }} /></div>
          </main>
          <aside className="side"><div className="skeleton" style={{ height: 260 }} /><div className="skeleton" style={{ flex: 1, minHeight: 300 }} /></aside>
        </div>
      ) : (
        <div className="wrap layout">
          <main className="main">
            {digest && (
              <div className="card digest-card">
                <h2><span className="h-icon"><Icon name="mail" size={15} /></span>Weekly digest
                  <button className="icon-btn" onClick={() => setDigest(null)} aria-label="Close digest"><Icon name="x" /></button>
                </h2>
                <div className="digest">{digest}</div>
              </div>
            )}
            <SavingsHero tips={data.tips} summary={data.summary} />
            <StatTiles summary={data.summary} anomalies={data.anomalies} />
            <div className="grid two">
              <MonthlySpend series={data.monthlySeries} />
              <CategoryBreakdown totals={data.categoryTotals} />
            </div>
            <Anomalies anomalies={data.anomalies} />
            <Subscriptions subscriptions={data.subscriptions} />
            <div className="grid two">
              <Budgets budgets={data.budgets} onChange={load} />
              <Import features={features} onImported={load} notify={notify} />
            </div>
          </main>
          <aside className="side">
            <Renewals subscriptions={data.subscriptions} />
            <Chat />
          </aside>
        </div>
      )}

      <footer className="wrap footer">
        Built on AWS Lambda · DynamoDB · Amazon Bedrock · Textract · SNS · EventBridge · Cognito · Alexa
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
