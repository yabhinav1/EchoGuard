/**
 * Voice in and out with the browser's built-in Web Speech API (free, no external service).
 * Speech recognition works in Chrome, Edge and Safari; speech output works in all modern browsers.
 */
const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const canListen = () => !!Recognition;
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

const ERRORS = {
  'not-allowed': 'Microphone access was blocked. Allow it in the address bar and try again.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in the address bar and try again.',
  'no-speech': "I didn't hear anything. Try again a little closer to the mic.",
  network: "This browser's speech service is unavailable (Brave blocks it). Try Chrome or Edge, or type instead.",
  'audio-capture': 'No microphone was found.',
};

/** Starts listening; returns a stop function. onResult(text, isFinal) fires as words come in. */
export function listen({ onResult, onEnd, onError }) {
  const r = new Recognition();
  r.lang = 'en-US';
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const text = Array.from(e.results).map((res) => res[0].transcript).join('');
    onResult?.(text, e.results[e.results.length - 1].isFinal);
  };
  r.onerror = (e) => { if (e.error !== 'aborted') onError?.(ERRORS[e.error] || `Voice input failed (${e.error}).`); };
  r.onend = () => onEnd?.();
  r.start();
  return () => r.stop();
}

/** Reads text aloud. Links and list bullets are tidied so they sound natural. */
export function speak(text, { onEnd } = {}) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/https?:\/\/\S+/g, 'the link on screen').replace(/[•*#]/g, '').replace(/\n+/g, '. ');
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1.03;
  u.onend = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export const stopSpeaking = () => { if (canSpeak()) window.speechSynthesis.cancel(); };
