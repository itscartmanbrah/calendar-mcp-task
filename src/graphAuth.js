// graphAuth.js — delegated device-code flow + silent refresh.
//
// Mirrors the dashboard's xeroClient token lifecycle: mint once, then
// getValidAccessToken() refreshes with a 60s buffer and persists the (possibly
// rotated) refresh token each time. Public client — no client secret.

import { AUTH_BASE, CLIENT_ID, SCOPE_STR, assertConfigured } from './config.js';
import { loadTokens, saveTokens } from './tokenStore.js';

const form = (obj) => new URLSearchParams(obj).toString();

function toStored(data, prev) {
  return {
    account: (prev && prev.account) || null,
    access_token: data.access_token,
    // A refresh response may or may not rotate the refresh token; keep the old one if absent.
    refresh_token: data.refresh_token || (prev && prev.refresh_token),
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

// Step 1 of device-code flow. Returns { user_code, verification_uri, message, device_code, interval, expires_in }.
export async function requestDeviceCode() {
  assertConfigured();
  const resp = await fetch(`${AUTH_BASE}/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: CLIENT_ID, scope: SCOPE_STR }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`devicecode request failed: ${resp.status} ${JSON.stringify(data)}`);
  return data;
}

// Step 2 — poll until the user authorizes. Persists tokens on success.
export async function pollForToken(deviceCode, intervalSec = 5, expiresInSec = 900) {
  const deadline = Date.now() + expiresInSec * 1000;
  let interval = intervalSec * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const resp = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: CLIENT_ID,
        device_code: deviceCode,
      }),
    });
    const data = await resp.json();
    if (resp.ok) {
      const tok = toStored(data);
      await saveTokens(tok);
      return tok;
    }
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    throw new Error(`device token poll failed: ${data.error} — ${data.error_description || ''}`);
  }
  throw new Error('Device code expired before authorization was completed.');
}

export async function refreshAccessToken(refreshToken, prev) {
  const resp = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      scope: SCOPE_STR,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`token refresh failed: ${resp.status} ${JSON.stringify(data)}`);
  const tok = toStored(data, prev);
  await saveTokens(tok);
  return tok;
}

// Returns a valid access token, refreshing if needed (60s buffer).
export async function getValidAccessToken() {
  assertConfigured();
  const stored = await loadTokens();
  if (!stored) {
    throw new Error('Not signed in yet. Run `npm run login` (device-code sign-in) first.');
  }
  const stillValid = stored.access_token && stored.expires_at - Date.now() > 60_000;
  if (stillValid) return stored.access_token;
  const refreshed = await refreshAccessToken(stored.refresh_token, stored);
  return refreshed.access_token;
}
