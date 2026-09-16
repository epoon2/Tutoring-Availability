// The schedule stays honest about what repeats: a series whittled down to
// one block becomes a standalone; a standalone sitting exactly where a
// newly saved series lands is folded into it.
// Run: node tests/install-shim.mjs && node tests/normalize.test.mjs
import { normalizeSchedule, expandWeeklyEvent, localDateTimeToMinuteKey } from '../netlify/functions/api.mjs';

let ran = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  ran++;
  if (cond) console.log('  ok ' + name);
  else fails.push(name + (extra ? `\n    ${extra}` : ''));
};
const weekly = (over) => ({ frequency: 'WEEKLY', interval: 1, weekdays: [2], endType: 'NEVER', exdates: [], ...over });
const maya = (over) => ({ id: 's', type: 'BLOCKED', title: 'Maya - Algebra II', notes: '',
  start: '2026-09-08T16:00', end: '2026-09-08T17:00', recurrence: weekly(), ...over });
const dates = (event, from = '2026-09-01', to = '2026-12-31') => expandWeeklyEvent(event,
  localDateTimeToMinuteKey(from + 'T00:00'), localDateTimeToMinuteKey(to + 'T00:00')).map(o => o.start.slice(0, 10));

// ---- collapsing
// The reported case: Tuesdays from 9/8; "this and following" from 9/22
// (until 9/21) and "this event only" on 9/8 leave 9/15 alone.
let out = normalizeSchedule([maya({ recurrence: weekly({ endType: 'ON', until: '2026-09-21', exdates: ['2026-09-08'] }) })]);
ok('a series with one block left becomes a standalone on that block',
  out.length === 1 && out[0].recurrence === null && out[0].start === '2026-09-15T16:00' && out[0].end === '2026-09-15T17:00'
  && out[0].id === 's' && out[0].title === 'Maya - Algebra II', JSON.stringify(out));
out = normalizeSchedule([maya({ recurrence: weekly({ endType: 'COUNT', count: 1 }) })]);
ok('a count-of-one series is a standalone too', out[0].recurrence === null && out[0].start === '2026-09-08T16:00');
out = normalizeSchedule([maya({ recurrence: weekly({ endType: 'ON', until: '2026-09-21' }) })]);
ok('two blocks left stay a series', out[0].recurrence && out[0].recurrence.endType === 'ON');
out = normalizeSchedule([maya({ recurrence: weekly({ endType: 'ON', until: '2026-09-21', exdates: ['2026-09-08', '2026-09-15'] }) })]);
ok('a series with nothing left is dropped', out.length === 0);
out = normalizeSchedule([maya({ recurrence: weekly({ exdates: ['2026-09-08'] }) })]);
ok('a never-ending series is never collapsed', out[0].recurrence && out[0].recurrence.endType === 'NEVER');
const loose = { id: 'x', type: 'BLOCKED', title: 'Noah', notes: '', start: '2026-09-10T10:00', end: '2026-09-10T11:00', recurrence: null };
out = normalizeSchedule([loose]);
ok('a standalone passes through untouched', JSON.stringify(out[0]) === JSON.stringify(loose));

// ---- absorbing, only when the save was the series
const standalone = (date, over = {}) => ({ id: 'one-' + date, type: 'BLOCKED', title: 'Maya - Algebra II', notes: '',
  start: date + 'T16:00', end: date + 'T17:00', recurrence: null, ...over });

// the reported wish: 9/15 stands alone, a matching series is added from 9/29
out = normalizeSchedule([standalone('2026-09-15'), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })], { absorbInto: 's' });
ok('a matching standalone before the series joins it: the series starts there', out.length === 1 && out[0].id === 's'
  && out[0].start === '2026-09-15T16:00' && out[0].end === '2026-09-15T17:00', JSON.stringify(out));
ok('and the weeks in between are skipped, not invented', out[0].recurrence.exdates.join() === '2026-09-22'
  && dates(out[0]).slice(0, 3).join() === '2026-09-15,2026-09-29,2026-10-06', JSON.stringify(dates(out[0]).slice(0, 4)));

out = normalizeSchedule([standalone('2026-09-15'), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })]);
ok('but not when the save was the standalone - detached copies are deliberate', out.length === 2 && out[0].id === 'one-2026-09-15');

out = normalizeSchedule([standalone('2026-09-15'), standalone('2026-09-22'), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })], { absorbInto: 's' });
ok('two matching blocks fill two weeks with no skips', out.length === 1 && out[0].start === '2026-09-15T16:00'
  && out[0].recurrence.exdates.length === 0 && dates(out[0]).slice(0, 3).join() === '2026-09-15,2026-09-22,2026-09-29');

out = normalizeSchedule([standalone('2026-09-08'), maya({ recurrence: weekly({ exdates: ['2026-09-08'] }) })], { absorbInto: 's' });
ok('a block on a skipped week lifts the skip', out.length === 1 && out[0].recurrence.exdates.length === 0
  && dates(out[0])[0] === '2026-09-08');

out = normalizeSchedule([standalone('2026-09-15'), maya()], { absorbInto: 's' });
ok('a block on a week the series lands is a duplicate and goes', out.length === 1 && out[0].id === 's' && out[0].start === '2026-09-08T16:00');

out = normalizeSchedule([standalone('2026-10-06'), maya({ recurrence: weekly({ endType: 'ON', until: '2026-09-22' }) })], { absorbInto: 's' });
ok('a block after the last week extends an ending series to it, skipping between',
  out.length === 1 && out[0].recurrence.until === '2026-10-06' && out[0].recurrence.exdates.join() === '2026-09-29'
  && dates(out[0]).join() === '2026-09-08,2026-09-15,2026-09-22,2026-10-06', JSON.stringify(out[0].recurrence));

out = normalizeSchedule([standalone('2026-09-29'), maya({ recurrence: weekly({ endType: 'COUNT', count: 2 }) })], { absorbInto: 's' });
ok('a counted series grows its count to reach a later block', out[0].recurrence.count === 4
  && dates(out[0]).join() === '2026-09-08,2026-09-15,2026-09-29', JSON.stringify(out[0].recurrence) + ' ' + dates(out[0]));

out = normalizeSchedule([standalone('2026-09-01'), maya({ recurrence: weekly({ endType: 'COUNT', count: 2 }) })], { absorbInto: 's' });
ok('a counted series moved earlier keeps its far end', out[0].start === '2026-09-01T16:00' && out[0].recurrence.count === 3
  && dates(out[0]).join() === '2026-09-01,2026-09-08,2026-09-15', dates(out[0]).join());

// ---- what does not match
out = normalizeSchedule([standalone('2026-09-15', { notes: 'bring workbook' }), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })], { absorbInto: 's' });
ok('different notes: not the same block', out.length === 2);
out = normalizeSchedule([standalone('2026-09-15', { start: '2026-09-15T17:00', end: '2026-09-15T18:00' }), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })], { absorbInto: 's' });
ok('different time: not the same block', out.length === 2);
out = normalizeSchedule([standalone('2026-09-15', { end: '2026-09-15T17:30' }), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })], { absorbInto: 's' });
ok('different length: not the same block', out.length === 2);
out = normalizeSchedule([standalone('2026-09-16'), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })], { absorbInto: 's' });
ok('a Wednesday is not on a Tuesday series', out.length === 2);
out = normalizeSchedule([standalone('2026-09-22'), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00', recurrence: weekly({ interval: 2 }) })], { absorbInto: 's' });
ok('one week ahead of an every-other-week series is off its cadence', out.length === 2);
out = normalizeSchedule([standalone('2026-09-15'), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00', recurrence: weekly({ interval: 2 }) })], { absorbInto: 's' });
ok('two weeks ahead is on it', out.length === 1 && out[0].start === '2026-09-15T16:00' && out[0].recurrence.exdates.length === 0);
out = normalizeSchedule([standalone('2026-09-15', { type: 'AVAILABLE' }), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })], { absorbInto: 's' });
ok('availability never folds into a session series', out.length === 2);
out = normalizeSchedule([standalone('2026-09-15', { title: 'maya - algebra ii  ' }), maya({ start: '2026-09-29T16:00', end: '2026-09-29T17:00' })], { absorbInto: 's' });
ok('titles match ignoring case and stray spaces', out.length === 1);

// ---- absorb then collapse in one pass
out = normalizeSchedule([standalone('2026-09-15'), maya({ start: '2026-09-22T16:00', end: '2026-09-22T17:00', recurrence: weekly({ endType: 'ON', until: '2026-09-22', exdates: ['2026-09-22'] }) })], { absorbInto: 's' });
ok('a series that ends up with one block after absorbing is a standalone', out.length === 1 && out[0].recurrence === null && out[0].start === '2026-09-15T16:00');

// ---- the routes
const { default: handler } = await import('../netlify/functions/api.mjs');
process.env.ADMIN_PASSWORD = 't';
const call = (method, path, body) => handler(new Request('http://localhost/api' + path, {
  method, headers: { 'x-admin-password': 't', 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined }));
const week = async (start, end) => (await (await call('GET', `/events?start=${start}&end=${end}`)).json()).events;

let res = await call('POST', '/events', { type: 'BLOCKED', title: 'Maya - Algebra II', start: '2026-09-08T16:00', end: '2026-09-08T17:00',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [2], endType: 'NEVER' } });
const sid = (await res.json()).id;
// truncate at 9/21 (what "this and following" from 9/22 does), then skip 9/8
await call('POST', '/events', { id: sid, type: 'BLOCKED', title: 'Maya - Algebra II', start: '2026-09-08T16:00', end: '2026-09-08T17:00',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [2], endType: 'ON', until: '2026-09-21' }, forceConflict: true });
await call('POST', `/events/${sid}/skip`, { date: '2026-09-08' });
let ev = await week('2026-09-13', '2026-09-19');
ok('through the routes the leftover 9/15 block is stored as a standalone',
  ev.length === 1 && !ev[0].recurrence && ev[0].id === sid && ev[0].start === '2026-09-15T16:00', JSON.stringify(ev));
ok('9/8 is gone', (await week('2026-09-06', '2026-09-12')).length === 0);

// now add a matching series from 9/29: the standalone joins it
res = await call('POST', '/events', { type: 'BLOCKED', title: 'Maya - Algebra II', start: '2026-09-29T16:00', end: '2026-09-29T17:00',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [2], endType: 'NEVER' } });
const newId = (await res.json()).id;
ev = await week('2026-09-13', '2026-09-19');
ok('the 9/15 block now belongs to the new series', ev.length === 1 && ev[0].masterId === newId && ev[0].recurrence, JSON.stringify(ev));
ok('9/22 stays empty', (await week('2026-09-20', '2026-09-26')).length === 0);
ok('and 9/29 onward runs', (await week('2026-09-27', '2026-10-03')).length === 1);

// a standalone posted onto a skipped week of a series stays standalone (a detached edit)
await call('POST', `/events/${newId}/skip`, { date: '2026-10-06' });
res = await call('POST', '/events', { type: 'BLOCKED', title: 'Maya - Algebra II', start: '2026-10-06T16:00', end: '2026-10-06T17:00', recurrence: null, forceConflict: true });
ev = await week('2026-10-04', '2026-10-10');
ok('a standalone saved on its own is left standalone even where it matches', ev.length === 1 && !ev[0].recurrence && ev[0].id !== newId, JSON.stringify(ev));

console.log(fails.length ? '\nFAILED:\n  ' + fails.join('\n  ') : `\nnormalize: all ${ran} checks passed`);
process.exit(fails.length ? 1 : 0);
