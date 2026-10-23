import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { canListen, canSpeak, listen, speak, stopSpeaking } from '../speech';

const SUGGESTIONS = ['What can I cancel?', 'What renews next?', 'Anything unusual?', 'How much on dining?', 'Any price hikes?'];

export default function Chat({ chat, onClose }) {
  const { log, busy, ask } = chat;
  const [q, setQ] = useState('');
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [speakOn, setSpeakOn] = useState(false);
  const stopRef = useRef(null);
  const spokenRef = useRef(log.length);

  // Read new answers aloud when voice replies are on (speech output is an external system, so an effect fits)
  useEffect(() => {
    const last = log.at(-1);
    if (speakOn && log.length > spokenRef.current && last?.role === 'bot') speak(last.text);
    spokenRef.current = log.length;
  }, [log, speakOn]);
  useEffect(() => () => { stopRef.current?.(); stopSpeaking(); }, []);

  // Scroll only the message list, never the page
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log, busy]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = (text) => { ask(text); setQ(''); };
  const mic = () => {
    if (listening) { stopRef.current?.(); return; }
    stopSpeaking();
    setVoiceError(null);
    setListening(true);
    let finalText = '';
    stopRef.current = listen({
      onResult: (t, isFinal) => { setQ(t); if (isFinal) finalText = t; },
      onError: (msg) => setVoiceError(msg),
      onEnd: () => { setListening(false); stopRef.current = null; if (finalText) submit(finalText); },
    });
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-avatar"><Icon name="sparkles" size={18} /></span>
        <div>
          <div className="title">Ask EchoGuard</div>
          <div className="dim">Answers come from your own transactions</div>
        </div>
        {canSpeak() && (
          <button className={`icon-btn ghost ${speakOn ? 'on' : ''}`} onClick={() => { setSpeakOn((v) => !v); stopSpeaking(); }}
            aria-pressed={speakOn} aria-label={speakOn ? 'Stop reading answers aloud' : 'Read answers aloud'} title={speakOn ? 'Voice replies on' : 'Voice replies off'}>
            <Icon name={speakOn ? 'volume' : 'volume-x'} />
          </button>
        )}
        {onClose && <button className="icon-btn ghost" onClick={onClose} aria-label="Close assistant"><Icon name="x" /></button>}
      </div>
      <div className="log" ref={logRef} aria-live="polite">
        {log.map((m, i) => (
          <div className={`msg ${m.role}`} key={i}>
            {m.text}
            {m.source && <span className="src">{m.source === 'bedrock' ? 'Claude on Amazon Bedrock' : 'Built-in assistant'}</span>}
          </div>
        ))}
        {busy && <div className="msg bot typing" aria-label="EchoGuard is typing"><span /><span /><span /></div>}
      </div>
      <div className="chips">{SUGGESTIONS.map((s) => <button key={s} onClick={() => submit(s)} disabled={busy}>{s}</button>)}</div>
      {voiceError && <div className="voice-error">{voiceError}</div>}
      <form onSubmit={(e) => { e.preventDefault(); submit(q); }}>
        {canListen() && (
          <button type="button" className={`icon-btn mic-sm ${listening ? 'on' : ''}`} onClick={mic} aria-label={listening ? 'Stop listening' : 'Ask by voice'} title="Ask by voice">
            <Icon name="mic" />
          </button>
        )}
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={listening ? 'Listening...' : 'Ask about your money...'} disabled={busy} aria-label="Question" />
        <button className="primary icon-btn" type="submit" disabled={busy || !q.trim()} aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  );
}
