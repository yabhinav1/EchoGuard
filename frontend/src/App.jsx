import { useEffect, useState } from 'react';
import { api } from './api';
import StatTiles from './components/StatTiles';
import { MonthlySpend, CategoryBreakdown } from './components/SpendChart';
import Subscriptions from './components/Subscriptions';
import Anomalies from './components/Anomalies';
import Tips from './components/Tips';
import Chat from './components/Chat';
import Budgets from './components/Budgets';
import Import from './components/Import';
import { authEnabled, currentUser, signIn, signOut, completeSignIn } from './auth';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [digest, setDigest] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [features, setFeatures] = useState(null);
  const [user, setUser] = useState(null);

  const load = () => api.dashboard().then(setData).catch((e) => setError(e.message));
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
      notify(r.remindersSent ? `Sent ${r.remindersSent} reminder${r.remindersSent > 1 ? 's' : ''} (check API console in demo mode)` : 'Nothing due in the next 3 days');
    } catch (e) { notify(`Error: ${e.message}`); } finally { setBusy(false); }
  };
  const onDigest = async () => {
    setBusy(true);
    try { setDigest((await api.digest()).text); } catch (e) { notify(`Error: ${e.message}`); } finally { setBusy(false); }
  };

  if (error) return <div className="error">Could not reach the API ({error}). Is the backend running on port 4000?</div>;
  if (authEnabled() && !user) {
    return (
      <div className="app" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h1>🔐 EchoGuard</h1>
        <p className="sub" style={{ color: 'var(--muted)' }}>Sign in to see your subscriptions and spending.</p>
        <button className="primary" onClick={signIn}>Sign in</button>
      </div>
    );
  }
  if (!data) return <div className="app"><p className="empty">Loading...</p></div>;

  return (
    <div className="app">
      <header>
        <div>
          <h1>🔐 EchoGuard</h1>
          <div className="sub">AI subscription and spending tracker · {data.transactionCount} transactions analyzed</div>
        </div>
        <div className="actions">
          {user && <span className="user">{user.email} <button onClick={signOut}>Sign out</button></span>}
          {!user && <span className="badge muted">demo user</span>}
          <button onClick={onDigest} disabled={busy}>Weekly digest</button>
          <button className="primary" onClick={onReminders} disabled={busy}>Send reminders</button>
        </div>
      </header>

      <StatTiles summary={data.summary} anomalies={data.anomalies} />

      {digest && <div className="card" style={{ marginBottom: 16 }}><h2>Weekly digest <button onClick={() => setDigest(null)}>Close</button></h2><div className="digest">{digest}</div></div>}

      <div className="grid two" style={{ marginBottom: 16 }}>
        <MonthlySpend series={data.monthlySeries} />
        <CategoryBreakdown totals={data.categoryTotals} />
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <Anomalies anomalies={data.anomalies} />
        <Tips tips={data.tips} />
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <Budgets budgets={data.budgets} onChange={load} />
        <Import features={features} onImported={load} notify={notify} />
      </div>

      <div className="grid two">
        <Subscriptions subscriptions={data.subscriptions} />
        <Chat />
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
