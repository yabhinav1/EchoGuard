import { currentUser } from './auth';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, opts = {}) {
  const user = currentUser();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (user) headers.Authorization = `Bearer ${user.idToken}`; else headers['X-User-Id'] = 'demo';
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export const api = {
  health: () => request('/health'),
  dashboard: () => request('/dashboard'),
  transactions: (limit = 50) => request(`/transactions?limit=${limit}`),
  chat: (question) => request('/chat', { method: 'POST', body: JSON.stringify({ question }) }),
  digest: () => request('/digest'),
  runReminders: () => request('/reminders/run', { method: 'POST' }),
  addTransaction: (tx) => request('/transactions', { method: 'POST', body: JSON.stringify(tx) }),
  setBudgets: (budgets) => request('/budgets', { method: 'PUT', body: JSON.stringify(budgets) }),
  scanReceipt: (payload) => request('/receipts', { method: 'POST', body: JSON.stringify(payload) }),
  importCsv: (csv) => request('/transactions/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  plaidLinkToken: () => request('/plaid/link-token', { method: 'POST' }),
  plaidExchange: (publicToken) => request('/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken }) }),
  plaidSync: () => request('/plaid/sync', { method: 'POST' }),
  cancelGuide: (id) => request(`/subscriptions/${encodeURIComponent(id)}/cancel-guide`),
  setSubscriptionStatus: (id, status) => request(`/subscriptions/${encodeURIComponent(id)}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  dismissAnomaly: (id) => request(`/anomalies/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }),
  restoreAnomalies: () => request('/anomalies/restore', { method: 'POST' }),
  alexa: (utterance) => request('/alexa/simulate', { method: 'POST', body: JSON.stringify({ utterance }) }),
};

export const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** "YYYY-MM-DD" renewal dates are calendar days; pin them to noon UTC so no timezone shifts the day. */
export const renewalDate = (ymd) => new Date(`${ymd}T12:00:00Z`);
export const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
