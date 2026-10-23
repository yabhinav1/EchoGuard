/**
 * Per-user feedback that changes what the detectors report:
 *  - subscriptions: { [subscriptionId]: { status: 'keep' | 'cancelled', at } }
 *  - dismissed: anomaly ids the user marked as "not suspicious"
 */
import { getMeta, putMeta } from './db.js';

const KEY = 'prefs';
export const SUBSCRIPTION_STATUSES = ['keep', 'cancelled'];

export async function getPrefs(userId) {
  const p = (await getMeta(userId, KEY, null)) || {};
  return { subscriptions: { ...(p.subscriptions || {}) }, dismissed: [...(p.dismissed || [])] };
}

/** status: 'keep' | 'cancelled' | null (null clears the mark) */
export async function setSubscriptionStatus(userId, subscriptionId, status) {
  const prefs = await getPrefs(userId);
  if (status) prefs.subscriptions[subscriptionId] = { status, at: new Date().toISOString() };
  else delete prefs.subscriptions[subscriptionId];
  return putMeta(userId, KEY, prefs);
}

export async function dismissAnomaly(userId, anomalyId) {
  const prefs = await getPrefs(userId);
  if (!prefs.dismissed.includes(anomalyId)) prefs.dismissed.push(anomalyId);
  return putMeta(userId, KEY, prefs);
}

export async function restoreAnomalies(userId) {
  const prefs = await getPrefs(userId);
  prefs.dismissed = [];
  return putMeta(userId, KEY, prefs);
}
