import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { Icon } from './Icon';

/** Step-by-step cancellation help, a ready-to-send request, and "cancelled / keep it" marks. */
export default function CancelModal({ subscription, onClose, onChanged, notify }) {
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    api.cancelGuide(subscription.id).then((g) => live && setGuide(g)).catch((e) => live && setError(e.message));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { live = false; window.removeEventListener('keydown', onKey); };
  }, [subscription.id, onClose]);

  const requestText = guide ? `Subject: ${guide.request.subject}\n\n${guide.request.body}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(requestText); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { notify('Copy failed. Select the text and copy it manually.'); }
  };
  const mark = async (status, msg) => {
    setBusy(true);
    try { await api.setSubscriptionStatus(subscription.id, status); notify(msg); onChanged(); onClose(); }
    catch (e) { notify(`Error: ${e.message}`); } finally { setBusy(false); }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="avatar">{subscription.merchant.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
          <div>
            <h2 id="cancel-title">Cancel {subscription.merchant}</h2>
            <div className="dim">{money(subscription.amount)} {subscription.cadence} · renews {subscription.nextRenewal}</div>
          </div>
          <button className="icon-btn ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        {error && <div className="modal-body"><p className="dim">{error}</p></div>}
        {!guide && !error && <div className="modal-body"><div className="skeleton" style={{ height: 220 }} /></div>}
        {guide && (
          <div className="modal-body">
            <div className="save-banner">
              <Icon name="sparkles" size={18} />
              <span>Cancelling saves <b>{money(guide.monthlySaving)}/month</b>, that's <b>{money(guide.yearlySaving)} a year</b>.</span>
            </div>

            <h3>How to cancel</h3>
            <ol className="steps">{guide.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <a className="btn primary" href={guide.url} target="_blank" rel="noreferrer">
              <Icon name="external" size={15} />{guide.known ? `Open ${guide.merchant} account page` : 'Search how to cancel'}
            </a>

            <h3>{guide.method === 'letter' ? 'Cancellation letter' : 'Cancellation request'}</h3>
            <p className="dim">Send this through their support chat or email{guide.method === 'letter' ? ', or print it for a certified letter' : ''}. Fill in your name and account email.</p>
            <textarea readOnly rows={9} value={requestText} aria-label="Cancellation request" />
            <div className="actions">
              <button onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied' : 'Copy text'}</button>
              <a className="btn" href={`mailto:?subject=${encodeURIComponent(guide.request.subject)}&body=${encodeURIComponent(guide.request.body)}`}>
                <Icon name="mail" size={15} />Open in email
              </a>
            </div>
          </div>
        )}

        <div className="modal-foot">
          {subscription.userStatus && <button onClick={() => mark(null, 'Mark cleared')} disabled={busy}><Icon name="undo" size={15} />Clear mark</button>}
          <button onClick={() => mark('keep', `Keeping ${subscription.merchant}. It won't be suggested for cancelling.`)} disabled={busy}><Icon name="heart" size={15} />I'll keep it</button>
          <button className="primary" onClick={() => mark('cancelled', `Marked ${subscription.merchant} as cancelled`)} disabled={busy}><Icon name="check" size={15} />I've cancelled it</button>
        </div>
      </div>
    </div>
  );
}
