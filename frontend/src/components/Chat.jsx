import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from './Icon';

const SUGGESTIONS = ['What can I cancel?', 'What renews next?', 'Anything unusual?', 'How much on dining?', 'Any price hikes?'];

export default function Chat() {
  const [log, setLog] = useState([{ role: 'bot', text: 'Hi, I am EchoGuard. Ask me about your subscriptions, renewals, or spending.' }]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  // Scroll only the message list, never the page
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log, busy]);

  const ask = async (question) => {
    if (!question.trim() || busy) return;
    setLog((l) => [...l, { role: 'user', text: question }]);
    setQ('');
    setBusy(true);
    try {
      const res = await api.chat(question);
      setLog((l) => [...l, { role: 'bot', text: res.answer, source: res.source }]);
    } catch (err) {
      setLog((l) => [...l, { role: 'bot', text: `Error: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card chat">
      <div className="chat-head">
        <span className="chat-avatar"><Icon name="sparkles" size={16} /></span>
        <div>
          <div className="title">Ask EchoGuard</div>
          <div className="dim">Answers come from your own transactions</div>
        </div>
      </div>
      <div className="log" ref={logRef} aria-live="polite">
        {log.map((m, i) => (
          <div className={`msg ${m.role}`} key={i}>
            {m.text}
            {m.source && <span className="src">{m.source === 'bedrock' ? 'Claude on Amazon Bedrock' : 'Demo mode · rule-based'}</span>}
          </div>
        ))}
        {busy && <div className="msg bot typing" aria-label="EchoGuard is typing"><span /><span /><span /></div>}
      </div>
      <div className="chips">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} disabled={busy}>{s}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your money..." disabled={busy} aria-label="Question" />
        <button className="primary icon-btn" type="submit" disabled={busy || !q.trim()} aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  );
}
