import { useRef, useState } from 'react';
import { api, money } from '../api';
import { Icon } from './Icon';

const SAMPLE_RECEIPT = `Blue Bottle Coffee
10/23/2026
Latte            5.75
Croissant        4.25
Subtotal        10.00
Tax              0.95
TOTAL           10.95`;

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

export default function Import({ features, onImported, notify }) {
  const [tab, setTab] = useState('receipt');
  const [text, setText] = useState('');
  const [image, setImage] = useState(null); // { name, base64 }
  const [parsed, setParsed] = useState(null);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);


  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setImage({ name: f.name, base64: String(r.result).split(',')[1] });
    r.readAsDataURL(f);
  };

  const scan = async () => {
    setBusy(true);
    try {
      const payload = image ? { imageBase64: image.base64 } : { text };
      const res = await api.scanReceipt(payload);
      setParsed(res.parsed);
    } catch (e) { notify(`Scan failed: ${e.message}`); } finally { setBusy(false); }
  };

  const saveParsed = async () => {
    setBusy(true);
    try {
      await api.addTransaction({ merchant: parsed.merchant, amount: parsed.amount, date: parsed.date, category: parsed.category, source: 'receipt', items: parsed.items });
      notify(`Added ${money(parsed.amount)} at ${parsed.merchant}`);
      setParsed(null); setText(''); setImage(null); if (fileRef.current) fileRef.current.value = '';
      onImported();
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  };

  const importCsv = async () => {
    setBusy(true);
    try {
      const res = await api.importCsv(csv);
      notify(`Imported ${res.inserted} transactions`);
      setCsv(''); onImported();
    } catch (e) { notify(`Import failed: ${e.message}`); } finally { setBusy(false); }
  };

  const pickCsv = (e) => {
    const f = e.target.files?.[0];
    if (f) f.text().then(setCsv);
  };

  const linkBank = async () => {
    setBusy(true);
    try {
      const { linkToken } = await api.plaidLinkToken();
      const Plaid = await loadPlaidScript();
      Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken) => {
          try { const r = await api.plaidExchange(publicToken); notify(`Linked. Imported ${r.imported} transactions`); onImported(); }
          catch (e) { notify(e.message); }
        },
        onExit: () => setBusy(false),
      }).open();
    } catch (e) { notify(e.message); setBusy(false); }
  };

  return (
    <div className="card">
      <h2>Add transactions</h2>
      <div className="segmented wide" role="tablist" aria-label="Import method">
        {[['receipt', 'Scan receipt', 'receipt'], ['csv', 'Import CSV', 'file'], ['bank', 'Link bank', 'bank']].map(([k, label, icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setParsed(null); }}><Icon name={icon} size={14} />{label}</button>
        ))}
      </div>

      {tab === 'receipt' && (
        <div className="stack">
          {features?.textract
            ? <label className="file"><input ref={fileRef} type="file" accept="image/*,.pdf" onChange={pickFile} /> {image ? image.name : 'Choose a receipt photo (Amazon Textract)'}</label>
            : <div className="dim">Photo scanning uses Amazon Textract, which is off to keep costs at zero. Paste the receipt text instead.</div>}
          <textarea rows={6} placeholder="...or paste receipt text" value={text} onChange={(e) => setText(e.target.value)} disabled={!!image} />
          <div className="actions">
            <button onClick={() => setText(SAMPLE_RECEIPT)}>Use sample</button>
            <button className="primary" onClick={scan} disabled={busy || (!text && !image)}>Scan</button>
          </div>
          {parsed && (
            <div className="preview">
              <div><span className="dim">Merchant</span> {parsed.merchant}</div>
              <div><span className="dim">Total</span> {parsed.amount != null ? money(parsed.amount) : 'not found'}</div>
              <div><span className="dim">Date</span> {new Date(parsed.date).toLocaleDateString()}</div>
              <div><span className="dim">Category</span> {parsed.category} <span className="badge muted">{parsed.categorySource}</span></div>
              {parsed.items?.length > 0 && <div className="dim">{parsed.items.length} line item{parsed.items.length > 1 ? 's' : ''} · parsed via {parsed.source}</div>}
              <div className="actions" style={{ marginTop: 8 }}><button className="primary" onClick={saveParsed} disabled={busy || parsed.amount == null}>Add transaction</button></div>
            </div>
          )}
        </div>
      )}

      {tab === 'csv' && (
        <div className="stack">
          <label className="file"><input type="file" accept=".csv,text/csv" onChange={pickCsv} /> Choose a bank or card CSV export</label>
          <textarea rows={6} placeholder={'Date,Description,Amount\n2026-10-20,STARBUCKS,-5.75'} value={csv} onChange={(e) => setCsv(e.target.value)} />
          <div className="actions"><button className="primary" onClick={importCsv} disabled={busy || !csv.trim()}>Import</button></div>
        </div>
      )}

      {tab === 'bank' && (
        <div className="stack">
          {features?.plaid
            ? <>
                <div className="dim">Connect a bank through Plaid. In sandbox, use user_good / pass_good.</div>
                <div className="actions"><button className="primary" onClick={linkBank} disabled={busy}>Link bank account</button><button onClick={() => api.plaidSync().then((r) => { notify(`Synced ${r.imported} new`); onImported(); }).catch((e) => notify(e.message))} disabled={busy}>Sync now</button></div>
              </>
            : <div className="dim">Bank sync uses Plaid. Set PLAID_CLIENT_ID and PLAID_SECRET on the API to enable it. Until then, import a CSV export.</div>}
        </div>
      )}
    </div>
  );
}
