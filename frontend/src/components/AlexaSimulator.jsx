import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from './Icon';
import { canListen, canSpeak, listen, speak, stopSpeaking } from '../speech';

const SAMPLES = [
  'Alexa, ask Echo Guard what renews this week',
  'Ask Echo Guard what can I cancel',
  'Ask Echo Guard anything unusual',
  'Ask Echo Guard how is my dining budget',
  'Ask Echo Guard how much will I spend this month',
  'Ask Echo Guard what are my subscriptions',
];

/** Try the Alexa skill in the browser: voice or text in, the skill's real response read out loud. */
export default function AlexaSimulator() {
  const [text, setText] = useState('');
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [turns, setTurns] = useState([]);
  const [error, setError] = useState(null);
  const [voiceOut, setVoiceOut] = useState(canSpeak());
  const stopRef = useRef(null);
  const lastRef = useRef(null);

  useEffect(() => () => { stopRef.current?.(); stopSpeaking(); }, []);
  useEffect(() => { lastRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [turns]);

  const ask = async (utterance) => {
    if (!utterance.trim()) return;
    setError(null);
    setState('thinking');
    try {
      const r = await api.alexa(utterance);
      setTurns((t) => [...t, r]);
      setText('');
      if (voiceOut && r.speech) { setState('speaking'); speak(r.speech, { onEnd: () => setState('idle') }); }
      else setState('idle');
    } catch (e) { setError(e.message); setState('idle'); }
  };

  const mic = () => {
    if (state === 'listening') { stopRef.current?.(); return; }
    stopSpeaking();
    setError(null);
    setState('listening');
    let finalText = '';
    stopRef.current = listen({
      onResult: (t, isFinal) => { setText(t); if (isFinal) finalText = t; },
      onError: (msg) => { setError(msg); setState('idle'); },
      onEnd: () => { stopRef.current = null; if (finalText) ask(finalText); else setState((s) => (s === 'listening' ? 'idle' : s)); },
    });
  };

  const last = turns.at(-1);
  return (
    <div className="row">
      <div className="span-7 card alexa-card">
        <div className={`echo ${state}`} aria-hidden="true">
          <div className="echo-ring" />
          <div className="echo-body"><span>echo</span></div>
        </div>
        <div className="alexa-status" aria-live="polite">
          {state === 'listening' && 'Listening...'}
          {state === 'thinking' && 'Thinking...'}
          {state === 'speaking' && 'Speaking...'}
          {state === 'idle' && (canListen() ? 'Tap the mic and talk, or type below' : 'Type a request below (voice input needs Chrome or Edge)')}
        </div>
        {last && <blockquote className="alexa-speech" ref={lastRef}>{last.speech}</blockquote>}
        {error && <div className="alexa-error">{error}</div>}

        <form className="alexa-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          {canListen() && (
            <button type="button" className={`mic-btn ${state === 'listening' ? 'on' : ''}`} onClick={mic} aria-label={state === 'listening' ? 'Stop listening' : 'Speak'}>
              <Icon name="mic" size={20} />
            </button>
          )}
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Try "Alexa, ask Echo Guard what renews this week"' aria-label="What to say to Alexa" />
          <button type="submit" className="primary" disabled={!text.trim() || state === 'thinking'}>Ask</button>
          {canSpeak() && (
            <button type="button" className="icon-btn" onClick={() => { setVoiceOut((v) => !v); stopSpeaking(); }} aria-label={voiceOut ? 'Mute spoken replies' : 'Read replies aloud'} title={voiceOut ? 'Mute' : 'Unmute'}>
              <Icon name={voiceOut ? 'volume' : 'volume-x'} size={18} />
            </button>
          )}
        </form>
        <div className="chips center">{SAMPLES.map((s) => <button key={s} onClick={() => ask(s)} disabled={state === 'thinking'}>{s.replace(/^(Alexa, )?ask Echo Guard /i, '')}</button>)}</div>
      </div>

      <div className="span-5 stack-col">
        <div className="card">
          <h2>What the skill heard</h2>
          {!last && <div className="empty">Ask something to see the intent and the skill's response.</div>}
          {last && (
            <dl className="kv">
              <dt>You said</dt><dd>"{last.utterance}"</dd>
              <dt>Request</dt><dd><code>{last.request.request.type}</code></dd>
              {last.matched.intent && <><dt>Intent</dt><dd><code>{last.matched.intent}</code>{last.matched.confidence ? <span className="dim"> · match {Math.round(last.matched.confidence * 100)}%</span> : null}</dd></>}
              {Object.keys(last.matched.slots || {}).length > 0 && <><dt>Slots</dt><dd><code>{JSON.stringify(last.matched.slots)}</code></dd></>}
            </dl>
          )}
          {last && (
            <details className="json">
              <summary>Alexa response JSON</summary>
              <pre>{JSON.stringify(last.response, null, 2)}</pre>
            </details>
          )}
        </div>
        <div className="card">
          <h2>Use it on a real Echo</h2>
          <ol className="steps">
            <li>Deploy the stack and copy the <code>AlexaFunctionArn</code> output.</li>
            <li>Create a custom skill in the Alexa Developer Console and paste <code>backend/alexa/interaction-model.json</code>.</li>
            <li>Point the skill endpoint at the Lambda ARN, then re-deploy with <code>ALEXA_SKILL_ID</code>.</li>
            <li>Say "Alexa, open Echo Guard". The simulator here runs the exact same handler.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
