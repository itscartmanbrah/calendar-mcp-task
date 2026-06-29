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
    'Add an appointment, meeting, or event to the workshop calendar. Use this whenever the user wants to book or schedule something — e.g. "book a 3pm appointment Tuesday", "put the rep visit on the calendar", "I have a meeting Friday at 10". Read natural dates and times ("today", "tomorrow", "next Tuesday", "3pm") as Australia/Melbourne local time. Sets a reminder by default. Just create it — only ask for details that are genuinely missing (like the time).',
    {
      subject: z.string(),
      start: z.string().describe('Local start, ISO with no offset, e.g. 2026-07-01T14:00:00'),
      end: z.string().describe('Local end, ISO with no offset. If the user gives only a start, assume a 30-minute event.'),
      timeZone: z.string().optional().describe('IANA timezone; defaults to Australia/Melbourne'),
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
    'See what is on the workshop calendar. Use for "what\'s on Friday?", "anything next week?", "when\'s my next appointment?". Also use it to find an event (and its id) before changing or cancelling it. Give a start and end datetime window (Australia/Melbourne).',
    {
      start: z.string().describe('Window start, ISO datetime'),
      end: z.string().describe('Window end, ISO datetime'),
      timeZone: z.string().optional(),
    },
    wrap(g.findEvents)
  );

  server.tool(
    'create_task',
    'Add a to-do, task, or reminder for the workshop. Use this whenever the user says things like "remind me to…", "add a reminder", "add a todo", "I need to…", or "put X on the list". It goes to the "Burrows Ops" list. Give it a due date and/or a reminder time when the user mentions one — read "Friday", "tomorrow 9am", "end of month" as Australia/Melbourne local time. Just create it — only ask for the wording if it genuinely isn\'t clear.',
    {
      title: z.string(),
      dueDate: z.string().optional().describe('YYYY-MM-DD or local ISO datetime (Australia/Melbourne)'),
      reminderDateTime: z.string().optional().describe('Local ISO datetime to remind (Australia/Melbourne)'),
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
    'See the workshop to-do list ("Burrows Ops"). Use for "what\'s on my list?", "what do I still need to do?". Also use it to find a task (and its id) before marking it done. Optional status filter: notStarted | inProgress | completed.',
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
