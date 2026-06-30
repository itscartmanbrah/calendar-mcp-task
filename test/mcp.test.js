// mcp.test.js — integration test. Spawns the MCP server over stdio, lists its
// tools, and calls one to confirm requests route through to the auth boundary.
//
// Runs with GRAPH_TOKEN_STORE=file and no token file present, so the call should
// come back as a clean handled error ("Not signed in yet...") rather than a
// crash — proving the whole pipeline is wired up without needing live Graph.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));
const EXPECTED_TOOLS = ['calendar', 'tasks'];

test('server registers all tools and routes a call to the auth boundary', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      GRAPH_CLIENT_ID: 'test-client-id',
      GRAPH_TENANT_ID: 'test-tenant',
      GRAPH_TOKEN_STORE: 'file',
      GRAPH_TOKEN_FILE: '/tmp/__nonexistent_graph_token__.json',
    },
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(transport);

  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [...EXPECTED_TOOLS].sort());

    // Call calendar/find — no token on disk, so it should be a graceful error.
    const res = await client.callTool({
      name: 'calendar',
      arguments: { action: 'find', start: '2026-07-01T00:00:00', end: '2026-07-02T00:00:00' },
    });
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /Not signed in/);
  } finally {
    await client.close();
  }
});
