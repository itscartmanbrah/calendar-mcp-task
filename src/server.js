#!/usr/bin/env node
// server.js — the MCP server. Exposes calendar + task tools over stdio.
//
// Two tools only — `calendar` and `tasks` — each with an `action`, so the whole
// connector has a small tool footprint. (This matters: clients with many other
// connectors enabled have a limited tool budget, and a 7-tool connector can get
// partially dropped at load time; 2 tools reliably load alongside the rest.)
//
// Destructive/bulk guidance lives in the tool descriptions: the agent is told to
// confirm with the user before deleting events or acting on many items at once.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import * as g from './graphClient.js';

const ok = (obj) => ({
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
});
const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
const wrap = (fn) => async (args) => {
  try {
    return ok(await fn(args));
  } catch (e) {
    return fail(e);
  }
};

export function buildServer() {
  const server = new McpServer({ name: 'calendar-tasks-mcp', version: '0.1.0' });

  // ── calendar ─────────────────────────────────────────────────────────────
  server.tool(
    'calendar',
    'Manage the workshop Outlook calendar. One tool, set `action`:\n' +
      '• "find" — see what is on (e.g. "what\'s on Friday?", "anything next week?"); pass start/end as the search window.\n' +
      '• "create" — add an appointment/meeting/event ("book a 3pm appointment Tuesday", "meeting Friday at 10"); pass subject + start (+ end, default 30 min). Sets a reminder by default.\n' +
      '• "update" — change an event; pass eventId + the fields to change.\n' +
      '• "delete" — cancel an event; pass eventId.\n' +
      'Read natural dates/times ("today", "tomorrow", "next Tuesday", "3pm") as Australia/Melbourne. To update or delete, first "find" to get the eventId. Just do it — only ask for genuinely missing details (like the time). Confirm before deleting.',
    {
      action: z.enum(['find', 'create', 'update', 'delete']).describe('What to do'),
      subject: z.string().optional().describe('Event title (create/update)'),
      start: z.string().optional().describe('create/update: local start ISO, e.g. 2026-07-01T14:00:00. find: window start.'),
      end: z.string().optional().describe('create/update: local end ISO (assume +30 min if only a start is given). find: window end.'),
      timeZone: z.string().optional().describe('IANA timezone; defaults to Australia/Melbourne'),
      location: z.string().optional(),
      body: z.string().optional().describe('Notes / description'),
      attendees: z.array(z.string()).optional().describe('Attendee email addresses (create)'),
      reminderMinutesBeforeStart: z.number().optional().describe('Minutes before start to remind (default 30)'),
      eventId: z.string().optional().describe('Required for update/delete — get it from action="find"'),
    },
    wrap(async (a) => {
      switch (a.action) {
        case 'find': return g.findEvents({ start: a.start, end: a.end, timeZone: a.timeZone });
        case 'create': return g.createEvent(a);
        case 'update': return g.updateEvent(a);
        case 'delete': return g.deleteEvent({ eventId: a.eventId });
        default: throw new Error(`Unknown calendar action: ${a.action}`);
      }
    })
  );

  // ── tasks ────────────────────────────────────────────────────────────────
  server.tool(
    'tasks',
    'Manage the workshop to-do list ("Burrows Ops", Microsoft To Do). One tool, set `action`:\n' +
      '• "create" — add a to-do / reminder ("remind me to…", "add a todo", "I need to…"); pass title, optional dueDate and reminder.\n' +
      '• "find" — see the list ("what\'s on my list?", "what do I still need to do?"); optional status filter.\n' +
      '• "complete" — tick a task off; pass taskId.\n' +
      'Read dates ("Friday", "tomorrow 9am", "end of month") as Australia/Melbourne. To complete a task, first "find" to get its taskId. Just do it — only ask for the wording if it genuinely isn\'t clear.',
    {
      action: z.enum(['create', 'find', 'complete']).describe('What to do'),
      title: z.string().optional().describe('Task text (create)'),
      dueDate: z.string().optional().describe('YYYY-MM-DD or local ISO datetime (Australia/Melbourne)'),
      reminderDateTime: z.string().optional().describe('Local ISO datetime to remind (Australia/Melbourne)'),
      body: z.string().optional(),
      status: z.string().optional().describe('find filter: notStarted | inProgress | completed'),
      taskId: z.string().optional().describe('Required for complete — get it from action="find"'),
      listName: z.string().optional().describe('Override the default "Burrows Ops" list'),
    },
    wrap(async (a) => {
      switch (a.action) {
        case 'create': return g.createTask(a);
        case 'find': return g.findTasks({ listName: a.listName, status: a.status });
        case 'complete': return g.completeTask({ taskId: a.taskId, listName: a.listName });
        default: throw new Error(`Unknown tasks action: ${a.action}`);
      }
    })
  );

  return server;
}

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${new Date().toISOString()}] calendar-tasks-mcp running on stdio`);
}

// Only start the stdio transport when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
