// tokenStore.js — persists the Graph OAuth tokens.
//
// Default backend is Postgres, mirroring the dashboard's xero_tokens pattern
// (single-row, app-owned table in the burrows_jewellers DB, refresh token never
// in git). A 'file' backend is available for local-first development/testing.
//
// Stored shape: { account, access_token, refresh_token, expires_at (ms epoch) }

import { promises as fs } from 'node:fs';
import { TOKEN_STORE, TOKEN_FILE } from './config.js';

let pgPool = null;
async function getPool() {
  if (pgPool) return pgPool;
  const { default: pg } = await import('pg');
  pgPool = new pg.Pool({
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'burrows_jewellers',
  });
  return pgPool;
}

async function ensureTable() {
  const pool = await getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS graph_tokens (
      id SERIAL PRIMARY KEY,
      account TEXT,
      access_token TEXT,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function saveTokens(tok) {
  if (TOKEN_STORE === 'file') {
    await fs.writeFile(TOKEN_FILE, JSON.stringify(tok, null, 2), { mode: 0o600 });
    return;
  }
  await ensureTable();
  const pool = await getPool();
  const expiresAt = new Date(tok.expires_at);
  // Single-connection setup: replace the existing row.
  await pool.query('DELETE FROM graph_tokens');
  await pool.query(
    `INSERT INTO graph_tokens (account, access_token, refresh_token, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [tok.account || null, tok.access_token, tok.refresh_token, expiresAt]
  );
}

export async function loadTokens() {
  if (TOKEN_STORE === 'file') {
    try {
      return JSON.parse(await fs.readFile(TOKEN_FILE, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  await ensureTable();
  const pool = await getPool();
  const r = await pool.query('SELECT * FROM graph_tokens ORDER BY id DESC LIMIT 1');
  const row = r.rows[0];
  if (!row) return null;
  return {
    account: row.account,
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at ? new Date(row.expires_at).getTime() : 0,
  };
}
