# calendar-tasks-mcp

An MCP server that lets Claude manage the **`workshop@burrowsjewellers.com.au`** Outlook calendar and Microsoft To Do, via Microsoft Graph. Built as a sibling to `burrows-mcp`, in the dashboard's Node/ESM style, with the same token-lifecycle pattern as `xeroClient.js` (mint once → silent refresh, refresh token stored in Postgres).

Delegated, least-privilege: it signs in **as** `workshop@` and can only touch that mailbox's **calendar and tasks** — no mail, no files.

## Tools

| Tool | What it does |
|------|--------------|
| `create_event` | Create a calendar event (local wall-clock time + timezone), with a phone reminder. |
| `update_event` | Change fields on an event by id. |
| `delete_event` | Delete one event by id. |
| `find_events` | List events in a window (resolve an id before update/delete). |
| `create_task` | Add a task to the **"Burrows Ops"** To Do list (due date + reminder optional). |
| `complete_task` | Mark a task complete. |
| `find_tasks` | List tasks (resolve an id before completing). |

> The agent is instructed (via tool descriptions) to **confirm before deleting events or acting on many items at once** — this is write access to a live calendar.

---

## One-time setup

### 1. Register the Entra (Azure AD) app

In the [Entra admin center](https://entra.microsoft.com) → **Identity → Applications → App registrations → New registration**:

1. **Name:** `burrows-calendar-tasks-mcp`
2. **Supported account types:** *Accounts in this organizational directory only* (single tenant).
3. **Register.** Copy the **Application (client) ID** and **Directory (tenant) ID** → these become `GRAPH_CLIENT_ID` / `GRAPH_TENANT_ID`.
4. **Authentication → Advanced settings → Allow public client flows → Yes.** (Device-code flow needs this; no client secret is created.)
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add exactly:
   - `Calendars.ReadWrite`
   - `Tasks.ReadWrite`
   - `offline_access`
   - `User.Read`
6. **Grant admin consent** (button at the top) using the Global Admin `adm_mark.burrows@…onmicrosoft.com`.

### 2. Configure

```bash
cp .env.example .env
# set GRAPH_CLIENT_ID, GRAPH_TENANT_ID, confirm GRAPH_DEFAULT_TIMEZONE, fill PG* for the token table
npm install
```

### 3. Sign in once (mint the refresh token)

```bash
npm run login
```

Open the printed URL, enter the code, and sign in as **`workshop@burrowsjewellers.com.au`**. The refresh token is stored (Postgres `graph_tokens` table by default). After this the server refreshes access tokens silently.

### 4. (Optional) Verify live

```bash
npm run smoke    # creates + cleans up a test event and task against the real mailbox
```

---

## Run / deploy

Locally, the MCP runs over stdio:

```bash
npm start
```

On the droplet, run it under **pm2** like `burrows-dashboard-api`:

```bash
pm2 start src/server.js --name calendar-tasks-mcp --interpreter node
pm2 save
```

Register it with your MCP client (e.g. `burrows-mcp`'s host config):

```json
{
  "mcpServers": {
    "calendar-tasks": {
      "command": "node",
      "args": ["/path/to/calendar-tasks-mcp/src/server.js"]
    }
  }
}
```

---

## Config (`.env`)

| Key | Purpose |
|-----|---------|
| `GRAPH_CLIENT_ID` / `GRAPH_TENANT_ID` | From the Entra app registration. |
| `GRAPH_DEFAULT_TIMEZONE` | IANA tz applied to events/tasks. **Confirm the store's timezone.** |
| `GRAPH_DEFAULT_REMINDER_MINUTES` | Default event reminder lead time (30). |
| `GRAPH_TODO_LIST_NAME` | To Do list for tasks (`Burrows Ops`). |
| `GRAPH_TOKEN_STORE` | `postgres` (default) or `file` (local dev). |
| `PGUSER`/`PGPASSWORD`/`PGHOST`/`PGPORT`/`PGDATABASE` | Token table (reuses `burrows_jewellers`). |

## Tests

```bash
npm test     # payload-builder unit tests + a spawned-server integration test (no live Graph needed)
```

## Notes / cautions

- **Reminders fire on the phone only if `workshop@` is signed into the phone's Outlook app.** Add it if not.
- Conditional-access policies can occasionally force a fresh `npm run login`; the refresh token isn't guaranteed to last forever.
- Token storage mirrors the dashboard's `xero_tokens`: one row, app-owned, never committed to git.
