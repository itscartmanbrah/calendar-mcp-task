# Deployment & registration

## Live deployment (done 2026-06-29)

The server is deployed and verified working against the live
`workshop@burrowsjewellers.com.au` mailbox.

- **Entra app:** `burrows-calendar-tasks-mcp` — single-tenant, public client,
  device-code flow. The 4 delegated permissions are admin-consented. The
  Application (client) ID and Directory (tenant) ID live in the droplet `.env`
  (not in this repo).
- **Host:** the DigitalOcean droplet (`170.64.193.208`), at
  `/var/www/calendar-tasks-mcp`. `.env` is configured there (Graph IDs +
  `burrows_jewellers` Postgres creds). `GRAPH_DEFAULT_TIMEZONE=Australia/Melbourne`.
- **Token:** minted via `npm run login` (signed in as `workshop@`); the refresh
  token is stored in the `graph_tokens` table in `burrows_jewellers` and refreshes
  silently — same pattern as the dashboard's `xero_tokens`.
- **Verified:** `npm run smoke` passed — create/find/update/delete event and
  create/complete task all round-trip against the real mailbox.

To update the droplet copy later: `cd /var/www/calendar-tasks-mcp && git pull && npm install`.

## Registering it with an MCP client

The server speaks MCP over **stdio**, and everything it needs (`.env`, the token,
the Postgres DB) lives **on the droplet**. So a client running on a laptop should
**spawn it over SSH** rather than locally. Copy `.mcp.json.example` and fill in
your own SSH user/key/host:

```json
{
  "mcpServers": {
    "calendar-tasks": {
      "command": "ssh",
      "args": ["-i", "<path-to-your-ssh-key>",
               "<user>@<droplet-ip>",
               "cd /var/www/calendar-tasks-mcp && node src/server.js"]
    }
  }
}
```

Each person uses their **own** droplet SSH access (key + user) — that part is
per-PC, which is why it isn't committed. Once registered, the client exposes the
7 calendar/task tools.

## Shared HTTP mode (any client connects by URL — no SSH, no local install)

`src/httpServer.js` (`npm run start:http`) exposes the same MCP server over
**Streamable HTTP** with bearer-token auth. Deployed on the droplet under pm2
(`calendar-tasks-mcp-http`, `127.0.0.1:MCP_HTTP_PORT`) behind nginx/TLS at:

```
https://dashboard.burrowsjewellers.com.au/mcp/calendar
```

Clients send `Authorization: Bearer <MCP_AUTH_TOKEN>` (value in the droplet `.env`).
Register it as a **remote MCP server** in the client — e.g. Claude Code:

```bash
claude mcp add --transport http calendar-tasks https://dashboard.burrowsjewellers.com.au/mcp/calendar \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

or in a client that takes JSON (via `mcp-remote`):

```json
{ "mcpServers": { "calendar-tasks": {
  "command": "npx",
  "args": ["mcp-remote", "https://dashboard.burrowsjewellers.com.au/mcp/calendar",
           "--header", "Authorization: Bearer <MCP_AUTH_TOKEN>"]
}}}
```

This is the cleanest option for multiple people on different PCs: nobody needs SSH
or a local clone — just the URL + the bearer token.
