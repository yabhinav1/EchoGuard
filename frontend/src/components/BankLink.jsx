import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from './Icon';

function loadPlaidScript() {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve(window.Plaid);
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.onload = () => resolve(window.Plaid);
    s.onerror = () => reject(new Error('Could not load Plaid Link'));
    document.head.appendChild(s);
  });
}

const ago = (iso) => {
  if (!iso) return 'not synced yet';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'synced just now';
  if (mins < 60) return `synced ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `synced ${hours} h ago` : `synced ${new Date(iso).toLocaleDateString()}`;
};

/** Plaid bank linking: the banks this visitor linked, plus link / sync / disconnect. */
export default function BankLink({ enabled, notify, onImported, onUseCsv }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => api.plaidStatus().then((r) => setItems(r.items)).catch(() => setItems([])), []);
  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);

  const link = async () => {
    setBusy(true);
    try {
      const { linkToken } = await api.plaidLinkToken();
      const Plaid = await loadPlaidScript();
      Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const r = await api.plaidExchange(publicToken, metadata?.institution);
            notify(`Linked ${metadata?.institution?.name || 'your bank'}. Imported ${r.imported} transactions`);
            await refresh();
            onImported();
          } catch (e) { notify(e.message); } finally { setBusy(false); }
        },
        onExit: () => setBusy(false),
      }).open();
    } catch (e) { notify(e.message); setBusy(false); }
  };

  const sync = async () => {
    setBusy(true);
    try { const r = await api.plaidSync(); notify(r.imported ? `Synced ${r.imported} new transactions` : 'Already up to date'); await refresh(); onImported(); }
    catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  const unlink = async (item) => {
    if (!window.confirm(`Disconnect ${item.institution}? Its imported transactions are removed too.`)) return;
    setBusy(true);
    try { const r = await api.plaidUnlink(item.itemId); notify(`Disconnected ${item.institution} (${r.transactionsRemoved} transactions removed)`); await refresh(); onImported(); }
    catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  if (!enabled) {
    return (
      <div className="stack">
        <div className="dim">Bank sync isn't switched on in this demo. When it is, you pick your bank, sign in on Plaid's secure page, and EchoGuard imports new transactions automatically.</div>
        <div className="actions"><button className="primary" onClick={onUseCsv}><Icon name="file" size={14} />Try a CSV import instead</button></div>
      </div>
    );
  }

  return (
    <div className="stack">
      {items === null && <div className="skeleton" style={{ height: 56 }} />}
      {items?.length > 0 && (
        <ul className="bank-list">
          {items.map((i) => (
            <li key={i.itemId}>
              <span className="bank-icon"><Icon name="bank" size={16} /></span>
              <div className="bank-main">
                <div className="merchant">{i.institution} <span className="badge good"><Icon name="check" size={11} /> linked</span></div>
                <div className="dim">Linked {new Date(i.linkedAt).toLocaleDateString()} · {ago(i.lastSync)}</div>
              </div>
              <button className="sm" onClick={() => unlink(i)} disabled={busy}>Disconnect</button>
            </li>
          ))}
        </ul>
      )}
      {items?.length === 0 && <div className="dim">No bank linked yet. Connect one through Plaid; new transactions are imported automatically.</div>}
      <div className="actions">
        <button className="primary" onClick={link} disabled={busy}><Icon name="bank" size={14} />{items?.length ? 'Link another bank' : 'Link bank account'}</button>
        {items?.length > 0 && <button onClick={sync} disabled={busy}><Icon name="repeat" size={14} />Sync now</button>}
      </div>
      <div className="dim">Test mode: pick any bank and sign in with <b>user_good</b> / <b>pass_good</b>. Banks you link are private to this browser.</div>
    </div>
  );
}
