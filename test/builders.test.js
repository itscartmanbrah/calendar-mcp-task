// builders.test.js — unit tests for the pure payload builders (no network/token).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventPayload, buildTaskPayload } from '../src/graphClient.js';

test('buildEventPayload: well-formed Graph event with reminder + timezone', () => {
  const p = buildEventPayload({
    subject: 'Stocktake',
    start: '2026-07-01T14:00:00',
    end: '2026-07-01T15:00:00',
    timeZone: 'Australia/Adelaide',
    location: 'Workshop',
    body: 'count the rings',
    attendees: ['dani@burrowsjewellers.com.au'],
    reminderMinutesBeforeStart: 45,
  });
  assert.equal(p.subject, 'Stocktake');
  assert.deepEqual(p.start, { dateTime: '2026-07-01T14:00:00', timeZone: 'Australia/Adelaide' });
  assert.deepEqual(p.end, { dateTime: '2026-07-01T15:00:00', timeZone: 'Australia/Adelaide' });
  assert.equal(p.isReminderOn, true);
  assert.equal(p.reminderMinutesBeforeStart, 45);
  assert.equal(p.location.displayName, 'Workshop');
  assert.equal(p.body.contentType, 'text');
  assert.equal(p.attendees[0].emailAddress.address, 'dani@burrowsjewellers.com.au');
  assert.equal(p.attendees[0].type, 'required');
});

test('buildEventPayload: defaults reminder on, requires fields', () => {
  const p = buildEventPayload({ subject: 'x', start: '2026-07-01T09:00:00', end: '2026-07-01T09:30:00' });
  assert.equal(p.isReminderOn, true);
  assert.equal(typeof p.reminderMinutesBeforeStart, 'number');
  assert.throws(() => buildEventPayload({ subject: 'x' }), /start and end are required/);
  assert.throws(() => buildEventPayload({ start: 'a', end: 'b' }), /subject is required/);
});

test('buildTaskPayload: title only, plus due-date normalisation', () => {
  const p1 = buildTaskPayload({ title: 'Call supplier' });
  assert.equal(p1.title, 'Call supplier');
  assert.equal(p1.dueDateTime, undefined);

  const p2 = buildTaskPayload({ title: 'Order', dueDate: '2026-07-05', timeZone: 'Australia/Adelaide' });
  assert.deepEqual(p2.dueDateTime, { dateTime: '2026-07-05T00:00:00', timeZone: 'Australia/Adelaide' });

  const p3 = buildTaskPayload({ title: 'Remind', reminderDateTime: '2026-07-05T08:00:00' });
  assert.equal(p3.isReminderOn, true);
  assert.equal(p3.reminderDateTime.dateTime, '2026-07-05T08:00:00');

  assert.throws(() => buildTaskPayload({}), /title is required/);
});
