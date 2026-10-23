import { useRef, useState } from 'react';
import { api, money } from '../api';
import { Icon } from './Icon';
import BankLink from './BankLink';

const SAMPLE_RECEIPT = `Blue Bottle Coffee
10/23/2026
Latte            5.75
Croissant        4.25
Subtotal        10.00
Tax              0.95
TOTAL           10.95`;

/** A small bank export dated relative to today: a new monthly Disney+ charge (which EchoGuard will detect
 *  as a subscription overlapping your other video services) plus a few everyday purchases. */
function sampleCsv() {
  const d = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  return [
    'Date,Description,Amount',
    `${d(61)},DISNEY PLUS,-13.99`,
    `${d(31)},DISNEY PLUS,-13.99`,
    `${d(1)},DISNEY PLUS,-13.99`,
    `${d(1)},UBER *TRIP,-23.10`,
    `${d(2)},STARBUCKS #1234,-6.45`,
    `${d(3)},WHOLE FOODS MARKET,-84.20`,
  ].join('\n');
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
          <div className="actions">
            <button onClick={() => setCsv(sampleCsv())}>Use sample</button>
            <button className="primary" onClick={importCsv} disabled={busy || !csv.trim()}>Import</button>
          </div>
          <div className="dim">The sample adds a monthly Disney+ charge: after importing, it shows up as a new subscription and a video-overlap saving.</div>
        </div>
      )}

      {tab === 'bank' && <BankLink enabled={!!features?.plaid} notify={notify} onImported={onImported} onUseCsv={() => setTab('csv')} />}
    </div>
  );
}
