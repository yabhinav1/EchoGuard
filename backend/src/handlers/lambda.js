/**
 * AWS Lambda entry points.
 *  - apiHandler: API Gateway HTTP API (payload v2) -> routes in api.js
 *  - reminderHandler: EventBridge scheduled job -> runReminders
 */
import { routes, runReminders } from './api.js';
import { handleAlexaRequest } from '../services/alexa.js';
import { ensureAlertSubscription } from '../services/notify.js';
import { listUsersWithMeta } from '../services/db.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-User-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

function matchRoute(method, path) {
  for (const [key, fn] of Object.entries(routes)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const pp = pattern.split('/');
    const rp = path.split('/');
    if (pp.length !== rp.length) continue;
    const params = {};
    let okMatch = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(rp[i]);
      else if (pp[i] !== rp[i]) { okMatch = false; break; }
    }
    if (okMatch) return { fn, params };
  }
  return null;
}

export async function apiHandler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const rawPath = (event.rawPath || event.path || '/').replace(/^\/(prod|dev|v1)(?=\/)/, '');
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const match = matchRoute(method, rawPath);
  if (!match) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Not found' }) };

  // User identity: Cognito JWT claim if present, else X-User-Id header, else demo
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub || event.headers?.['x-user-id'] || 'demo';
  if (claims?.sub && claims.email) {
    await ensureAlertSubscription(userId, claims.email).catch((err) => console.warn('[alerts] subscribe failed:', err.message));
  }

  let body = null;
  if (event.body) {
    try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body); }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  }

  try {
    const res = await match.fn({ userId, params: match.params, query: event.queryStringParameters || {}, body });
    return { statusCode: res.status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(res.body) };
  } catch (err) {
    console.error(err);
    return { statusCode: err.status || 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
}

export async function reminderHandler(event) {
  // Everyone who has an alert subscription, plus any configured extras (the demo user by default).
  const extra = (process.env.REMINDER_USERS ?? 'demo').split(',').map((u) => u.trim()).filter(Boolean);
  const users = [...new Set([...extra, ...(await listUsersWithMeta('alerts'))])];
  const results = [];
  for (const u of users) {
    try { results.push(await runReminders(u)); }
    catch (err) { console.error(`[reminders] ${u}:`, err); results.push({ userId: u, error: err.message }); }
  }
  console.log(JSON.stringify(results));
  return results;
}

/** Alexa Skills Kit endpoint: point the skill's endpoint at this Lambda's ARN. */
export async function alexaHandler(event) {
  return handleAlexaRequest(event);
}
