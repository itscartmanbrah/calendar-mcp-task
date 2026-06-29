// graphClient.js — thin Microsoft Graph wrappers for Calendar + To Do.
//
// Pure payload builders (buildEventPayload / buildTaskPayload) are exported
// separately so they can be unit-tested without any network or token.

import { GRAPH_BASE, DEFAULT_TIMEZONE, DEFAULT_REMINDER_MINUTES, TODO_LIST_NAME } from './config.js';
import { getValidAccessToken } from './graphAuth.js';

async function graph(method, path, { body, headers } = {}) {
  const token = await getValidAccessToken();
  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 204) return null; // e.g. DELETE
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Graph ${method} ${path} failed: ${resp.status} ${JSON.stringify(data)}`);
  return data;
}

// Accept a date-only (YYYY-MM-DD) or a full local datetime (YYYY-MM-DDTHH:MM:SS).
function toDateTime(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d;
}

// ---------- Pure payload builders (testable) ----------

export function buildEventPayload({
  subject,
  start,
  end,
  timeZone = DEFAULT_TIMEZONE,
  location,
  body,
  attendees = [],
  reminderMinutesBeforeStart = DEFAULT_REMINDER_MINUTES,
}) {
  if (!subject) throw new Error('subject is required');
  if (!start || !end) throw new Error('start and end are required (local ISO, e.g. 2026-07-01T14:00:00)');
  const payload = {
    subject,
    start: { dateTime: toDateTime(start), timeZone },
    end: { dateTime: toDateTime(end), timeZone },
    isReminderOn: true,
    reminderMinutesBeforeStart,
  };
  if (location) payload.location = { displayName: location };
  if (body) payload.body = { contentType: 'text', content: body };
  if (attendees.length) {
    payload.attendees = attendees.map((a) => ({
      emailAddress: { address: typeof a === 'string' ? a : a.address, name: typeof a === 'object' ? a.name : undefined },
      type: 'required',
    }));
  }
  return payload;
}

export function buildTaskPayload({ title, dueDate, reminderDateTime, body, timeZone = DEFAULT_TIMEZONE }) {
  if (!title) throw new Error('title is required');
  const payload = { title };
  if (body) payload.body = { content: body, contentType: 'text' };
  if (dueDate) payload.dueDateTime = { dateTime: toDateTime(dueDate), timeZone };
  if (reminderDateTime) {
    payload.isReminderOn = true;
    payload.reminderDateTime = { dateTime: toDateTime(reminderDateTime), timeZone };
  }
  return payload;
}

// ---------- Calendar ----------

export async function createEvent(args) {
  const data = await graph('POST', '/me/events', { body: buildEventPayload(args) });
  return { id: data.id, subject: data.subject, webLink: data.webLink };
}

export async function updateEvent({ eventId, timeZone = DEFAULT_TIMEZONE, ...patch }) {
  if (!eventId) throw new Error('eventId is required');
  const body = {};
  if (patch.subject) body.subject = patch.subject;
  if (patch.start) body.start = { dateTime: toDateTime(patch.start), timeZone };
  if (patch.end) body.end = { dateTime: toDateTime(patch.end), timeZone };
  if (patch.location) body.location = { displayName: patch.location };
  if (patch.body) body.body = { contentType: 'text', content: patch.body };
  if (patch.reminderMinutesBeforeStart != null) {
    body.isReminderOn = true;
    body.reminderMinutesBeforeStart = patch.reminderMinutesBeforeStart;
  }
  const data = await graph('PATCH', `/me/events/${encodeURIComponent(eventId)}`, { body });
  return { id: data.id, subject: data.subject, webLink: data.webLink };
}

export async function deleteEvent({ eventId }) {
  if (!eventId) throw new Error('eventId is required');
  await graph('DELETE', `/me/events/${encodeURIComponent(eventId)}`);
  return { deleted: true, id: eventId };
}

// Convert a naive local wall-clock string (interpreted in `timeZone`) to a UTC ISO
// string. calendarView interprets its window in UTC, so without this a local-time
// window would be off by the timezone offset. Strings already carrying an offset
// (Z or +hh:mm) pass through unchanged.
function zonedToUtcISO(s, timeZone) {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) return s;
  const naive = s.length === 10 ? `${s}T00:00:00` : s;
  const guess = new Date(`${naive}Z`);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = dtf.formatToParts(guess).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const tzWall = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  const diff = guess.getTime() - new Date(`${tzWall}Z`).getTime();
  return new Date(guess.getTime() + diff).toISOString();
}

export async function findEvents({ start, end, timeZone = DEFAULT_TIMEZONE }) {
  if (!start || !end) throw new Error('start and end are required (ISO datetime window)');
  const qs = new URLSearchParams({
    startDateTime: zonedToUtcISO(start, timeZone),
    endDateTime: zonedToUtcISO(end, timeZone),
    $orderby: 'start/dateTime',
    $select: 'id,subject,start,end,location,webLink',
    $top: '50',
  });
  const data = await graph('GET', `/me/calendarView?${qs.toString()}`, {
    headers: { Prefer: `outlook.timezone="${timeZone}"` },
  });
  return (data.value || []).map((e) => ({
    id: e.id,
    subject: e.subject,
    start: e.start,
    end: e.end,
    location: e.location?.displayName,
    webLink: e.webLink,
  }));
}

// ---------- Microsoft To Do ----------

let cachedListId = null;
export async function getOrCreateListId(name = TODO_LIST_NAME) {
  if (cachedListId) return cachedListId;
  const filter = `displayName eq '${name.replace(/'/g, "''")}'`;
  const data = await graph('GET', `/me/todo/lists?$filter=${encodeURIComponent(filter)}`);
  let list = (data.value || [])[0];
  if (!list) list = await graph('POST', '/me/todo/lists', { body: { displayName: name } });
  cachedListId = list.id;
  return cachedListId;
}

export async function createTask({ listName, ...args }) {
  const listId = await getOrCreateListId(listName);
  const data = await graph('POST', `/me/todo/lists/${listId}/tasks`, { body: buildTaskPayload(args) });
  return { id: data.id, title: data.title, listId };
}

export async function completeTask({ taskId, listName }) {
  if (!taskId) throw new Error('taskId is required');
  const listId = await getOrCreateListId(listName);
  const data = await graph('PATCH', `/me/todo/lists/${listId}/tasks/${encodeURIComponent(taskId)}`, {
    body: { status: 'completed' },
  });
  return { id: data.id, status: data.status };
}

export async function findTasks({ listName, status } = {}) {
  const listId = await getOrCreateListId(listName);
  const qs = new URLSearchParams({ $top: '50', $orderby: 'createdDateTime desc' });
  if (status) qs.set('$filter', `status eq '${status}'`);
  const data = await graph('GET', `/me/todo/lists/${listId}/tasks?${qs.toString()}`);
  return (data.value || []).map((t) => ({ id: t.id, title: t.title, status: t.status, due: t.dueDateTime }));
}

// Used by device-login to label the stored token with the signed-in account.
export async function getMe() {
  return graph('GET', '/me?$select=displayName,userPrincipalName,mail');
}
