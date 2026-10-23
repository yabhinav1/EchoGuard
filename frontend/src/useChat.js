import { useState } from 'react';
import { api } from './api';

/** Chat state lives above the drawer so the top search bar can ask questions too. */
export function useChat() {
  const [log, setLog] = useState([{ role: 'bot', text: 'Hi, I am EchoGuard. Ask me about your subscriptions, renewals, or spending.' }]);
  const [busy, setBusy] = useState(false);

  const ask = async (question) => {
    if (!question.trim() || busy) return;
    setLog((l) => [...l, { role: 'user', text: question }]);
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
  return { log, busy, ask };
}
