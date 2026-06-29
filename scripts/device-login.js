#!/usr/bin/env node
// device-login.js — one-time interactive sign-in to mint the workshop@ refresh
// token. Run once after the Entra app is registered and .env is filled in:
//
//   npm run login
//
// It prints a short code + URL; open the URL, enter the code, and sign in as
// workshop@burrowsjewellers.com.au. The refresh token is then stored (Postgres
// by default, or a local file when GRAPH_TOKEN_STORE=file).

import { requestDeviceCode, pollForToken } from '../src/graphAuth.js';
import { getMe } from '../src/graphClient.js';
import { loadTokens, saveTokens } from '../src/tokenStore.js';

const dc = await requestDeviceCode();

console.log('\n=== Sign in to mint the workshop@ token ===\n');
console.log(dc.message || `Open ${dc.verification_uri} and enter code: ${dc.user_code}`);
console.log('\nWaiting for authorization (this window will update once you finish)...\n');

await pollForToken(dc.device_code, dc.interval, dc.expires_in);

// Label the stored token with the signed-in account for clarity.
try {
  const me = await getMe();
  const stored = await loadTokens();
  if (stored) {
    stored.account = me.userPrincipalName || me.mail || null;
    await saveTokens(stored);
  }
  console.log(`\n✓ Signed in as ${me.userPrincipalName || me.mail}. Tokens stored.\n`);
} catch {
  console.log('\n✓ Signed in. Tokens stored.\n');
}

process.exit(0);
