// Availability is allowed to span booked sessions - that is the shape of
// this schedule, not a clash - and only a blocked session can conflict
// with another one. Run: node tests/install-shim.mjs && node tests/conflicts.test.mjs
import { findBlockedConflicts } from '../netlify/functions/api.mjs';

let ran = 0;
const fails = [];
const is = (name, got, want) => {
  ran++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fails.push(`${name}\n    got  ${g}\n    want ${w}`);
  else console.log('  ok ' + name);
};

const blocked = {
  id: 'session-1', type: 'BLOCKED', title: 'Maya - Algebra II',
  start: '2026-09-02T10:00', end: '2026-09-02T11:00', recurrence: null,
};
const weeklyBlocked = {
  id: 'series-1', type: 'BLOCKED', title: 'Maya - Algebra II',
  start: '2026-09-02T10:00', end: '2026-09-02T11:00',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [3], endType: 'NEVER' },
};

// The reported bug: Wednesday-morning availability wrapping a booked session.
const availability = {
  id: 'avail-1', type: 'AVAILABLE', title: 'Open',
  start: '2026-09-02T09:00', end: '2026-09-02T12:00', recurrence: null,
};
is('availability may span a booked session',
   findBlockedConflicts(availability, [blocked]).total, 0);

// The same availability as a weekly series, which is what the schedule holds.
const weeklyAvailability = {
  id: 'avail-1', type: 'AVAILABLE', title: 'Open',
  start: '2026-09-02T09:00', end: '2026-09-02T12:00',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [3], endType: 'NEVER' },
};
is('a weekly availability series may span a weekly session',
   findBlockedConflicts(weeklyAvailability, [weeklyBlocked]).total, 0);

// Truncating that series - what "delete this and following" saves - must pass.
const truncated = {
  ...weeklyAvailability,
  recurrence: { ...weeklyAvailability.recurrence, endType: 'ON', until: '2026-09-01' },
};
is('ending an availability series early is not a clash',
   findBlockedConflicts(truncated, [weeklyBlocked]).total, 0);

// The check still does its real job: session on top of session.
const secondSession = {
  id: 'session-2', type: 'BLOCKED', title: 'Noah - Geometry',
  start: '2026-09-02T10:30', end: '2026-09-02T11:30', recurrence: null,
};
is('a session overlapping another session still conflicts',
   findBlockedConflicts(secondSession, [blocked]).total, 1);

// And an event is never in conflict with itself.
is('an event does not conflict with itself',
   findBlockedConflicts(blocked, [blocked]).total, 0);

// A session that merely sits beside another is fine.
const afterwards = {
  id: 'session-3', type: 'BLOCKED', title: 'Later',
  start: '2026-09-02T11:00', end: '2026-09-02T12:00', recurrence: null,
};
is('back-to-back sessions do not conflict',
   findBlockedConflicts(afterwards, [blocked]).total, 0);

if (fails.length) {
  console.error('\nFAILED:\n' + fails.join('\n'));
  process.exit(1);
}
console.log(`conflicts: all ${ran} checks passed`);
