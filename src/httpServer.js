#!/usr/bin/env node
// httpServer.js — expose the MCP server over Streamable HTTP, so any Claude client
// can connect by URL (no SSH, no per-PC local install). Bearer-token auth; intended
// to run behind nginx/TLS as a long-lived service (pm2).
//
//   node src/httpServer.js
//
// Env:
//   MCP_HTTP_PORT (4100)  MCP_HTTP_HOST (127.0.0.1)  MCP_HTTP_PATH (/mcp/calendar)
//   MCP_AUTH_TOKEN        shared bearer secret; if unset the endpoint is OPEN (don't do that in prod)

import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from './server.js';

const PORT = parseInt(process.env.MCP_HTTP_PORT || '4100', 10);
const HOST = process.env.MCP_HTTP_HOST || '127.0.0.1';
const MCP_PATH = process.env.MCP_HTTP_PATH || '/mcp/calendar';
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function authed(req, url) {
  if (!AUTH_TOKEN) return true; // no token set => open
  const m = /^Bearer\s+(.+)$/i.exec(req.headers['authorization'] || '');
  if (m && m[1] === AUTH_TOKEN) return true;
  // Also accept the token in the URL (?token= or ?key=) for clients whose
  // "remote MCP server URL" field can't attach an Authorization header
  // (e.g. Cowork's custom-connector dialog, which only offers URL + OAuth).
  if (url) {
    const q = url.searchParams.get('token') || url.searchParams.get('key');
    if (q && q === AUTH_TOKEN) return true;
  }
  return false;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 4_000_000) { req.destroy(); reject(new Error('payload too large')); }
    });
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Unauthenticated health check (for nginx / monitoring).
  if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
    return send(res, 200, { ok: true, service: 'calendar-tasks-mcp', transport: 'streamable-http' });
  }

  if (url.pathname !== MCP_PATH) return send(res, 404, { error: 'Not found' });
  if (!authed(req, url)) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }));
  }

  try {
    if (req.method === 'POST') {
      const body = await readJson(req);
      console.error(`[mcp] POST rpc=${body?.method || '?'} (stateless)`);
      // Stateless: a fresh server + transport per request. There is no session
      // map to be orphaned by a restart or idle cleanup, so a client can never
      // get stuck reusing a session the server has forgotten — every call is
      // self-contained.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => { try { transport.close(); } catch { /* ignore */ } });
      const mcp = buildServer();
      await mcp.connect(transport);
      return transport.handleRequest(req, res, body);
    }

    // Stateless mode: no server-push SSE stream and no session deletes.
    return send(res, 405, { error: 'This MCP endpoint is POST-only (stateless server).' });
  } catch (e) {
    if (!res.headersSent) rpcError(res, -32603, String(e?.message || e), 500);
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`[${new Date().toISOString()}] calendar-tasks-mcp HTTP on http://${HOST}:${PORT}${MCP_PATH}` +
    (AUTH_TOKEN ? ' (bearer auth on)' : ' (NO AUTH — set MCP_AUTH_TOKEN)'));
});
