import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const SUGGESTIONS = ['What can I cancel?', 'What renews next?', 'Anything unusual?', 'How much on dining?', 'Any price hikes?'];

export default function Chat({ chat, onClose }) {
  const { log, busy, ask } = chat;
  const [q, setQ] = useState('');
  const logRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll only the message list, never the page
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log, busy]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = (text) => { ask(text); setQ(''); };

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-avatar"><Icon name="sparkles" size={18} /></span>
        <div>
          <div className="title">Ask EchoGuard</div>
          <div className="dim">Answers come from your own transactions</div>
        </div>
        {onClose && <button className="icon-btn ghost" onClick={onClose} aria-label="Close assistant"><Icon name="x" /></button>}
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
      <div className="chips">{SUGGESTIONS.map((s) => <button key={s} onClick={() => submit(s)} disabled={busy}>{s}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); submit(q); }}>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your money..." disabled={busy} aria-label="Question" />
        <button className="primary icon-btn" type="submit" disabled={busy || !q.trim()} aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  );
}
