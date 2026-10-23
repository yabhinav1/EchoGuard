import { useState } from 'react';

const KEY = 'echoguard.theme';
const systemDark = () => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Apply a saved light/dark choice before the first render so charts read the right colors. */
export function initTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) document.documentElement.dataset.theme = saved;
  } catch {}
}

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || (systemDark() ? 'dark' : 'light'));
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; // set before re-render: charts read CSS variables while rendering
    try { localStorage.setItem(KEY, next); } catch {}
    setTheme(next);
  };
  return [theme, toggle];
}
