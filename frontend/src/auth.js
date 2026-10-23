/**
 * Cognito Hosted UI sign-in with PKCE. Active only when VITE_COGNITO_DOMAIN and VITE_COGNITO_CLIENT_ID are set;
 * otherwise the app runs as the shared "demo" user.
 */
const DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;      // e.g. https://echoguard-abc.auth.us-east-1.amazoncognito.com
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const REDIRECT = import.meta.env.VITE_COGNITO_REDIRECT || window.location.origin + '/';
const KEY = 'echoguard.auth';

export const authEnabled = () => !!(DOMAIN && CLIENT_ID);

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 64) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function save(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} }

export function decodeJwt(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}

export function currentUser() {
  const a = load();
  if (!a?.idToken) return null;
  const claims = decodeJwt(a.idToken);
  if (!claims || claims.exp * 1000 < Date.now()) { save(null); return null; }
  return { email: claims.email, sub: claims.sub, idToken: a.idToken };
}

export async function signIn() {
  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem('pkce', JSON.stringify({ verifier, state }));
  const url = new URL(`${DOMAIN}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, scope: 'openid email profile',
    code_challenge_method: 'S256', code_challenge: await sha256(verifier), state,
  });
  window.location.assign(url);
}

export function signOut() {
  save(null);
  const url = new URL(`${DOMAIN}/logout`);
  url.search = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: REDIRECT });
  window.location.assign(url);
}

/** Call once on page load: exchanges ?code= for tokens if we are returning from the Hosted UI. */
export async function completeSignIn() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;
  const pkce = JSON.parse(sessionStorage.getItem('pkce') || 'null');
  sessionStorage.removeItem('pkce');
  if (!pkce || pkce.state !== params.get('state')) throw new Error('Sign-in state mismatch');
  const res = await fetch(`${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, code, redirect_uri: REDIRECT, code_verifier: pkce.verifier }),
  });
  if (!res.ok) throw new Error('Token exchange failed');
  const t = await res.json();
  save({ idToken: t.id_token, accessToken: t.access_token, refreshToken: t.refresh_token });
  window.history.replaceState({}, '', window.location.pathname);
}
