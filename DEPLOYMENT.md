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

> Note: if you'd rather not give each client SSH access to the droplet, the
> alternative is to switch the server from stdio to an HTTP/SSE transport and run
> it as a long-lived service — a small code change, not done here.
