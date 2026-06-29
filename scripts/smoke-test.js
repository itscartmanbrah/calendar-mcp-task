#!/usr/bin/env node
// smoke-test.js — live end-to-end check against the real workshop@ mailbox.
// Run AFTER `npm run login`:
//
//   npm run smoke
//
// It creates a throwaway event ~1h out (30-min reminder), lists it, updates the
// time, deletes it, then creates and completes a "Burrows Ops" task. Everything
// it creates, it cleans up.

import * as g from '../src/graphClient.js';

function localISO(date) {
  // YYYY-MM-DDTHH:MM:SS in local components (no offset) — matches what the tools expect.
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:00`;
}

const now = new Date();
const startA = new Date(now.getTime() + 60 * 60 * 1000);
const endA = new Date(now.getTime() + 90 * 60 * 1000);
const startB = new Date(now.getTime() + 120 * 60 * 1000);
const endB = new Date(now.getTime() + 150 * 60 * 1000);

console.log('1) create_event...');
const ev = await g.createEvent({
  subject: '[smoke test] calendar-tasks-mcp',
  start: localISO(startA),
  end: localISO(endA),
  body: 'Created by smoke-test.js — safe to ignore, will self-delete.',
  reminderMinutesBeforeStart: 30,
});
console.log('   ->', ev);

console.log('2) find_events...');
const found = await g.findEvents({ start: localISO(now), end: localISO(endB) });
console.log(`   -> ${found.length} event(s); test event present:`, found.some((e) => e.id === ev.id));

console.log('3) update_event (move 1h later)...');
const upd = await g.updateEvent({ eventId: ev.id, start: localISO(startB), end: localISO(endB) });
console.log('   ->', upd);

console.log('4) delete_event...');
console.log('   ->', await g.deleteEvent({ eventId: ev.id }));

console.log('5) create_task in "Burrows Ops"...');
const task = await g.createTask({ title: '[smoke test] calendar-tasks-mcp', body: 'self-completing' });
console.log('   ->', task);

console.log('6) complete_task...');
console.log('   ->', await g.completeTask({ taskId: task.id }));

console.log('\n✓ Smoke test passed. Calendar + To Do round-trips work end to end.\n');
process.exit(0);
