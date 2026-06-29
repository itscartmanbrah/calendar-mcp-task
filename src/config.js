// config.js — environment + constants. Mirrors the dashboard's dotenv convention.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

export const TENANT_ID = process.env.GRAPH_TENANT_ID || 'common';
export const CLIENT_ID = process.env.GRAPH_CLIENT_ID || '';
export const DEFAULT_TIMEZONE = process.env.GRAPH_DEFAULT_TIMEZONE || 'Australia/Melbourne';
export const TODO_LIST_NAME = process.env.GRAPH_TODO_LIST_NAME || 'Burrows Ops';
export const DEFAULT_REMINDER_MINUTES = parseInt(process.env.GRAPH_DEFAULT_REMINDER_MINUTES || '30', 10);

// Delegated, least-privilege scopes. offline_access => refresh token. Nothing else.
export const SCOPES = ['offline_access', 'User.Read', 'Calendars.ReadWrite', 'Tasks.ReadWrite'];
export const SCOPE_STR = SCOPES.join(' ');

export const AUTH_BASE = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0`;
export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Token store backend: 'postgres' (default, matches xero_tokens) or 'file' (local dev).
export const TOKEN_STORE = (process.env.GRAPH_TOKEN_STORE || 'postgres').toLowerCase();
export const TOKEN_FILE =
  process.env.GRAPH_TOKEN_FILE || fileURLToPath(new URL('../.graph-token.json', import.meta.url));

export function assertConfigured() {
  if (!CLIENT_ID) {
    throw new Error('GRAPH_CLIENT_ID is not set. Register the Entra app and set it in .env (see README).');
  }
}
