#!/usr/bin/env node
// server.js — the MCP server. Exposes calendar + task tools over stdio.
//
// Tools: create_event, update_event, delete_event, find_events,
//        create_task, complete_task, find_tasks
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

  server.tool(
    'create_event',
    'Create an Outlook calendar event in the workshop@ mailbox. Times are local wall-clock (e.g. 2026-07-01T14:00:00), interpreted in the default timezone unless timeZone is given. Sets a phone reminder by default.',
    {
      subject: z.string(),
      start: z.string().describe('Local start, ISO with no offset, e.g. 2026-07-01T14:00:00'),
      end: z.string().describe('Local end, ISO with no offset'),
      timeZone: z.string().optional().describe('IANA timezone, e.g. Australia/Adelaide'),
      location: z.string().optional(),
      body: z.string().optional().describe('Notes / description'),
      attendees: z.array(z.string()).optional().describe('Attendee email addresses'),
      reminderMinutesBeforeStart: z.number().optional().describe('Minutes before start to remind (default 30)'),
    },
    wrap(g.createEvent)
  );

  server.tool(
    'update_event',
    'Update an existing calendar event by id. Only the fields you pass are changed.',
    {
      eventId: z.string(),
      subject: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      timeZone: z.string().optional(),
      location: z.string().optional(),
      body: z.string().optional(),
      reminderMinutesBeforeStart: z.number().optional(),
    },
    wrap(g.updateEvent)
  );

  server.tool(
    'delete_event',
    'Delete a single calendar event by id. For deleting multiple events, confirm with the user first.',
    { eventId: z.string() },
    wrap(g.deleteEvent)
  );

  server.tool(
    'find_events',
    'List events between two datetimes (use this to resolve an event id before updating or deleting). start/end are ISO datetimes.',
    {
      start: z.string().describe('Window start, ISO datetime'),
      end: z.string().describe('Window end, ISO datetime'),
      timeZone: z.string().optional(),
    },
    wrap(g.findEvents)
  );

  server.tool(
    'create_task',
    'Create a Microsoft To Do task in the "Burrows Ops" list (created on first use). Optional due date and reminder.',
    {
      title: z.string(),
      dueDate: z.string().optional().describe('YYYY-MM-DD or local ISO datetime'),
      reminderDateTime: z.string().optional().describe('Local ISO datetime to remind'),
      body: z.string().optional(),
      listName: z.string().optional().describe('Override the default list name'),
    },
    wrap(g.createTask)
  );

  server.tool(
    'complete_task',
    'Mark a Microsoft To Do task complete by id.',
    { taskId: z.string(), listName: z.string().optional() },
    wrap(g.completeTask)
  );

  server.tool(
    'find_tasks',
    'List tasks in the "Burrows Ops" list (use this to resolve a task id before completing it). Optional status filter: notStarted | inProgress | completed.',
    { listName: z.string().optional(), status: z.string().optional() },
    wrap(g.findTasks)
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
