// Block colours: a hex colour on an event, colour rules layered on a
// series (one date, one weekday, from a date on) so nothing is split,
// and the public schedule staying red and green throughout.
// Run: node tests/install-shim.mjs && node tests/colors.test.mjs
process.env.ADMIN_PASSWORD = 't';
const api = await import('../netlify/functions/api.mjs');
const { default: handler, resolveOccurrenceColor, applyColorScope, normalizeSchedule } = api;

let ran = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  ran++;
  if (cond) console.log('  ok ' + name);
  else fails.push(name + (extra ? `\n    ${extra}` : ''));
};
const req = async (method, path, body, admin = true) => {
  const res = await handler(new Request('http://localhost/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(admin ? { 'x-admin-password': 't' } : {}) },
    body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const weekOf = async (start, end, admin = true) => (await req('GET', `/events?start=${start}&end=${end}`, null, admin)).data.events;
const colorsOn = (events, id) => Object.fromEntries(events.filter(e => (e.masterId || e.id) === id).map(e => [e.start.slice(0, 10), e.color || null]));

// ---- pure rules
const series = { id: 's', type: 'BLOCKED', title: 'Maya', notes: '', start: '2026-09-07T16:00', end: '2026-09-07T17:00',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [1, 3], endType: 'NEVER' } };
ok('no colour resolves to null (the type default)', resolveOccurrenceColor(series, '2026-09-07') === null);
let painted = applyColorScope(series, { color: '#1d4ed8', scope: 'all' });
ok('"all" sets the series colour and leaves no rules', painted.color === '#1d4ed8' && !painted.recurrence.colorRules);
painted = applyColorScope(painted, { color: '#6d28d9', scope: 'weekday', date: '2026-09-09' });
ok('"all Wednesdays" is one weekday rule', painted.recurrence.colorRules.length === 1 && painted.recurrence.colorRules[0].weekday === 3);
ok('Wednesdays are purple, Mondays still blue', resolveOccurrenceColor(painted, '2026-09-09') === '#6d28d9'
  && resolveOccurrenceColor(painted, '2026-09-16') === '#6d28d9' && resolveOccurrenceColor(painted, '2026-09-14') === '#1d4ed8');
painted = applyColorScope(painted, { color: '#0f766e', scope: 'one', date: '2026-09-16' });
ok('"this event only" paints just that date', resolveOccurrenceColor(painted, '2026-09-16') === '#0f766e'
  && resolveOccurrenceColor(painted, '2026-09-23') === '#6d28d9');
painted = applyColorScope(painted, { color: '#be185d', scope: 'weekday', date: '2026-09-23' });
ok('repainting all Wednesdays also covers the one that was singled out', resolveOccurrenceColor(painted, '2026-09-16') === '#be185d'
  && painted.recurrence.colorRules.length === 1, JSON.stringify(painted.recurrence.colorRules));
painted = applyColorScope(painted, { color: '#c2410c', scope: 'following', date: '2026-09-21' });
ok('"this and following" wins over an earlier weekday rule from that date on', resolveOccurrenceColor(painted, '2026-09-23') === '#c2410c'
  && resolveOccurrenceColor(painted, '2026-09-21') === '#c2410c' && resolveOccurrenceColor(painted, '2026-09-16') === '#be185d'
  && resolveOccurrenceColor(painted, '2026-09-14') === '#1d4ed8');
painted = applyColorScope(painted, { color: null, scope: 'one', date: '2026-09-28' });
ok('a rule may restore the default for one block', resolveOccurrenceColor(painted, '2026-09-28') === null
  && resolveOccurrenceColor(painted, '2026-09-30') === '#c2410c');
painted = applyColorScope(painted, { color: '#a16207', scope: 'following', date: '2026-09-07' });
ok('"following" from the first block is the whole series', painted.color === '#a16207' && !painted.recurrence.colorRules);
const single = { ...series, recurrence: { ...series.recurrence, weekdays: [1] } };
painted = applyColorScope(single, { color: '#1d4ed8', scope: 'weekday', date: '2026-09-07' });
ok('"all Mondays" on a Mondays-only series is the whole series', painted.color === '#1d4ed8' && !painted.recurrence.colorRules);
const lone = { ...series, recurrence: null };
painted = applyColorScope(lone, { color: '#1d4ed8', scope: 'one', date: '2026-09-07' });
ok('a standalone takes the colour whatever the scope', painted.color === '#1d4ed8' && painted.recurrence === null);

// ---- normalising keeps colours
let out = normalizeSchedule([{ ...series, color: '#1d4ed8', recurrence: { ...series.recurrence, endType: 'ON', until: '2026-09-09',
  exdates: ['2026-09-07'], colorRules: [{ weekday: 3, color: '#6d28d9' }] } }]);
ok('a series collapsing to one block gives it that block\'s resolved colour', out[0].recurrence === null && out[0].color === '#6d28d9');
const base = { ...series, color: '#1d4ed8', recurrence: { ...series.recurrence, endType: 'ON', until: '2026-09-30' } };
out = normalizeSchedule([base, { id: 'x', type: 'BLOCKED', title: 'Maya', notes: '', start: '2026-09-16T16:00', end: '2026-09-16T17:00',
  color: '#0f766e', recurrence: null }], { absorbInto: 's' });
ok('a standalone with its own colour joins a series as a one-date rule', out.length === 1
  && resolveOccurrenceColor(out[0], '2026-09-16') === '#0f766e' && resolveOccurrenceColor(out[0], '2026-09-23') === '#1d4ed8', JSON.stringify(out));
out = normalizeSchedule([base, { id: 'y', type: 'BLOCKED', title: 'Maya', notes: '', start: '2026-09-16T16:00', end: '2026-09-16T17:00',
  color: '#1d4ed8', recurrence: null }], { absorbInto: 's' });
ok('one whose colour already matches leaves no rule behind', out.length === 1 && !out[0].recurrence.colorRules);

// ---- through the API
let r = await req('POST', '/events', { type: 'BLOCKED', title: 'Maya', start: '2026-09-07T16:00', end: '2026-09-07T17:00', color: '#1D4ED8',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [1, 3], endType: 'NEVER' } });
ok('a save accepts a hex colour', r.status === 200, JSON.stringify(r.data));
const id = r.data.id;
let week = await weekOf('2026-09-13', '2026-09-19');
ok('every block of the week carries the resolved colour, lower-cased, with the series colour beside it',
  week.length === 2 && week.every(e => e.color === '#1d4ed8' && e.seriesColor === '#1d4ed8'), JSON.stringify(week.map(e => [e.color, e.seriesColor])));
r = await req('POST', '/events', { type: 'BLOCKED', title: 'Bad', start: '2026-09-08T16:00', end: '2026-09-08T17:00', color: 'red', recurrence: null });
ok('a colour that is not hex is refused', r.status === 400);
r = await req('POST', `/events/${id}/color`, { color: '#6d28d9', scope: 'weekday', date: '2026-09-16' });
ok('the colour route paints all Wednesdays', r.status === 200 && r.data.ok, JSON.stringify(r.data));
week = await weekOf('2026-09-13', '2026-09-19');
ok('and the week shows blue Monday, purple Wednesday', JSON.stringify(colorsOn(week, id)) === JSON.stringify({ '2026-09-14': '#1d4ed8', '2026-09-16': '#6d28d9' }), JSON.stringify(colorsOn(week, id)));
r = await req('POST', `/events/${id}/color`, { color: '#0f766e', scope: 'one', date: '2026-09-15' });
ok('a date the series misses is refused', r.status === 400);
r = await req('POST', '/events', { id, type: 'BLOCKED', title: 'Maya', notes: '', start: '2026-09-07T16:00', end: '2026-09-07T17:30',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [1, 3], endType: 'NEVER' } });
week = await weekOf('2026-09-13', '2026-09-19');
ok('a re-save that says nothing about colour keeps the colour and the rules',
  JSON.stringify(colorsOn(week, id)) === JSON.stringify({ '2026-09-14': '#1d4ed8', '2026-09-16': '#6d28d9' }) && week[0].end.endsWith('17:30'), JSON.stringify(colorsOn(week, id)));
r = await req('POST', '/events', { id, type: 'BLOCKED', title: 'Maya', notes: '', start: '2026-09-07T16:00', end: '2026-09-07T17:30', color: '#be185d',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [1, 3], endType: 'NEVER' } });
week = await weekOf('2026-09-13', '2026-09-19');
ok('a re-save with a new colour repaints the whole series and drops the rules',
  JSON.stringify(colorsOn(week, id)) === JSON.stringify({ '2026-09-14': '#be185d', '2026-09-16': '#be185d' }), JSON.stringify(colorsOn(week, id)));
r = await req('POST', '/events', { id, type: 'BLOCKED', title: 'Maya', notes: '', start: '2026-09-07T16:00', end: '2026-09-07T17:30', color: null,
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [1, 3], endType: 'NEVER' } });
week = await weekOf('2026-09-13', '2026-09-19');
ok('null clears it back to the default', week.every(e => !e.color && e.seriesColor === null));

const pub = (await req('GET', '/events?start=2026-09-13&end=2026-09-19', null, false)).data;
ok('the public schedule carries no colour at all', pub.mode === 'public' && !JSON.stringify(pub.events).includes('color'));

r = await req('POST', `/events/${id}/color`, { color: '#1d4ed8', scope: 'all' }, false);
ok('the route is not open to the public', r.status === 401);

console.log(fails.length ? '\nFAILED:\n  ' + fails.join('\n  ') : `\ncolors: all ${ran} checks passed`);
process.exit(fails.length ? 1 : 0);
