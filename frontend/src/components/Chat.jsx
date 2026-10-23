import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const SUGGESTIONS = ['What can I cancel?', 'What renews next?', 'Anything unusual?', 'How much on dining?', 'Any price hikes?'];

export default function Chat() {
  const [log, setLog] = useState([{ role: 'bot', text: 'Hi, I am EchoGuard. Ask me about your subscriptions, renewals, or spending.' }]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);

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
      <h2>Ask EchoGuard</h2>
      <div className="chips">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} disabled={busy}>{s}</button>)}</div>
      <div className="log">
        {log.map((m, i) => (
          <div className={`msg ${m.role}`} key={i}>
            {m.text}
            {m.source && <span className="src">{m.source === 'bedrock' ? 'Amazon Bedrock' : 'demo mode (rules)'}</span>}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question..." disabled={busy} />
        <button className="primary" type="submit" disabled={busy || !q.trim()}>{busy ? '...' : 'Send'}</button>
      </form>
    </div>
  );
}
