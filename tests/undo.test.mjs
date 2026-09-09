// Undo and redo: the snapshot stack itself, the routes that drive it, the
// per-gesture grouping, and the Google mirror catching up by difference.
// Run: node tests/install-shim.mjs && node tests/undo.test.mjs
import { createServer } from 'node:http';
import {
  recordBeforeWrite, applyUndo, applyRedo, summarizeHistory, emptyHistory, HISTORY_LIMIT
} from '../netlify/functions/history.mjs';
import { googleEventId, resetTokenCache } from '../netlify/functions/googlesync.mjs';

let ran = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  ran++;
  if (cond) console.log('  ok ' + name);
  else fails.push(name + (extra ? `\n    ${extra}` : ''));
};

// ---- the pure stack
let h = emptyHistory();
h = recordBeforeWrite(h, { actionId: 'a1', label: 'add session', previousEvents: [] });
h = recordBeforeWrite(h, { actionId: 'a1', label: 'add session', previousEvents: [{ id: 'x' }] });
ok('several writes of one action keep a single snapshot', h.undo.length === 1 && h.undo[0].events.length === 0);
h = recordBeforeWrite(h, { actionId: 'a2', label: 'delete session', previousEvents: [{ id: 'x' }, { id: 'y' }] });
ok('a new action adds a step', h.undo.length === 2 && summarizeHistory(h).undoLabel === 'delete session');
h = recordBeforeWrite(h, { actionId: null, label: '', previousEvents: [] });
ok('a write with no action id gets its own step and a default label',
  h.undo.length === 3 && h.undo[2].label === 'change' && h.undo[2].id);
let u = applyUndo(h, [{ id: 'now' }]);
ok('undo hands back the snapshot and parks the present on redo',
  u.events.length === 0 && u.history.undo.length === 2 && u.history.redo.length === 1
  && u.history.redo[0].events[0].id === 'now' && u.entry.label === 'change');
let r = applyRedo(u.history, u.events);
ok('redo puts it back', r.events[0].id === 'now' && r.history.redo.length === 0 && r.history.undo.length === 3);
u = applyUndo(r.history, r.events);
h = recordBeforeWrite(u.history, { actionId: 'a9', label: 'edit', previousEvents: u.events });
ok('a fresh change clears redo', h.redo.length === 0);
ok('nothing to undo returns null', applyUndo(emptyHistory(), []) === null);
let big = emptyHistory();
for (let i = 0; i < HISTORY_LIMIT + 10; i++) big = recordBeforeWrite(big, { actionId: 's' + i, label: 'x', previousEvents: [i] });
ok(`the stack is capped at ${HISTORY_LIMIT}, dropping the oldest`, big.undo.length === HISTORY_LIMIT && big.undo[0].events[0] === 10);
ok('a stored blob of any old shape normalizes', summarizeHistory(null).undo === 0 && summarizeHistory({ undo: 'nope' }).undo === 0);

// ---- a fake Google so the mirror side of undo is real
const calls = [];
const store = new Map();
const fake = createServer((req, res) => {
  let raw = ''; req.on('data', (c) => raw += c);
  req.on('end', () => {
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url === '/token') return send(200, { access_token: 't', expires_in: 3600 });
    const m = /^\/calendars\/[^/]+\/events(?:\/([^/?]+))?/.exec(req.url);
    const id = m && m[1];
    calls.push(req.method + (id ? ':' + id : ''));
    if (req.method === 'PUT') { if (!store.has(id)) return send(404, {}); store.set(id, JSON.parse(raw)); return send(200, {}); }
    if (req.method === 'POST') { const b = JSON.parse(raw); store.set(b.id, b); return send(200, b); }
    if (req.method === 'DELETE') { const had = store.delete(id); res.writeHead(had ? 204 : 404); return res.end(); }
    send(200, { items: [] });
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${fake.address().port}`;
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'a@b', private_key: (await import('node:crypto')).generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) });
process.env.GOOGLE_CALENDAR_ID = 'cal';
process.env.GOOGLE_API_BASE = base;
process.env.GOOGLE_TOKEN_URL = `${base}/token`;
process.env.ADMIN_PASSWORD = 't';
resetTokenCache();

// ---- the routes
const { default: handler } = await import('../netlify/functions/api.mjs');
const call = (method, path, body, extra = {}) => handler(new Request('http://localhost/api' + path, {
  method, headers: { 'x-admin-password': 't', 'Content-Type': 'application/json', ...extra },
  body: body ? JSON.stringify(body) : undefined
}));
const admin = async () => (await (await call('GET', '/events?start=2026-09-06&end=2026-09-12')).json());

let res = await call('POST', '/events', { type: 'BLOCKED', title: 'Maya - Algebra II',
  start: '2026-09-09T16:00', end: '2026-09-09T17:00', recurrence: null },
  { 'x-action-id': 'g1', 'x-action-label': 'add session' });
const first = (await res.json()).id;
let view = await admin();
ok('after one save the admin view offers one undo, labelled', view.history.undo === 1
  && view.history.undoLabel === 'add session' && view.history.redo === 0, JSON.stringify(view.history));

// a two-request gesture: truncate the series and add a loose one, same id
await call('POST', '/events', { id: first, type: 'BLOCKED', title: 'Maya - Algebra II',
  start: '2026-09-09T15:00', end: '2026-09-09T16:00', recurrence: null },
  { 'x-action-id': 'g2', 'x-action-label': 'move this and following sessions' });
res = await call('POST', '/events', { type: 'BLOCKED', title: 'Noah', start: '2026-09-11T10:00', end: '2026-09-11T11:00', recurrence: null },
  { 'x-action-id': 'g2', 'x-action-label': 'move this and following sessions' });
const second = (await res.json()).id;
view = await admin();
ok('two writes under one action id are one undo step', view.history.undo === 2 && view.events.length === 2, JSON.stringify(view.history));
ok('Google has both sessions', store.has(googleEventId(first)) && store.has(googleEventId(second)));

calls.length = 0;
res = await call('POST', '/undo', {});
let data = await res.json();
ok('undo reports what it undid', res.status === 200 && data.undone.label === 'move this and following sessions'
  && data.history.undo === 1 && data.history.redo === 1, JSON.stringify(data));
view = await admin();
ok('the whole gesture is gone: one session at its old time', view.events.length === 1
  && view.events[0].start === '2026-09-09T16:00', JSON.stringify(view.events.map(e => e.start)));
ok('Google caught up by difference: one update, one delete, nothing else',
  data.sync.google === 'ok' && data.sync.changed === 2
  && calls.filter(c => c.startsWith('PUT')).length === 1 && calls.includes('DELETE:' + googleEventId(second))
  && !store.has(googleEventId(second)) && store.get(googleEventId(first)).start.dateTime === '2026-09-09T16:00:00',
  calls.join(' '));

res = await call('POST', '/redo', {});
data = await res.json();
view = await admin();
ok('redo brings the gesture back', data.redone && view.events.length === 2 && view.history.redo === 0
  && store.has(googleEventId(second)));

await call('POST', '/undo', {});
await call('POST', '/undo', {});
view = await admin();
ok('two undos reach the empty schedule', view.events.length === 0 && view.history.undo === 0 && view.history.redo === 2);
ok('and Google is empty too', store.size === 0);
res = await call('POST', '/undo', {});
ok('an empty stack answers 409, not a crash', res.status === 409);

await call('POST', '/events', { type: 'AVAILABLE', title: 'Open', start: '2026-09-10T09:00', end: '2026-09-10T12:00', recurrence: null });
view = await admin();
ok('a new change after undo clears redo', view.history.redo === 0 && view.history.undoLabel === 'change');

res = await handler(new Request('http://localhost/api/undo', { method: 'POST' }));
ok('undo is admin-only', res.status === 401);
res = await handler(new Request('http://localhost/api/events?start=2026-09-06&end=2026-09-12'));
ok('the public body carries no history', !('history' in await res.json()));

// skipping a week is undoable and restores the exact recurrence
res = await call('POST', '/events', { type: 'BLOCKED', title: 'S', start: '2026-09-08T16:00', end: '2026-09-08T17:00',
  recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [2], endType: 'NEVER' } });
const sid = (await res.json()).id;
await call('POST', `/events/${sid}/skip`, { date: '2026-09-15' }, { 'x-action-label': 'skip a week' });
view = await admin();
ok('the skip is on the stack', view.history.undoLabel === 'skip a week');
await call('POST', '/undo', {});
res = await call('GET', '/events?start=2026-09-13&end=2026-09-19');
view = await res.json();
ok('undoing the skip brings the week back with no exdate left behind',
  view.events.some(e => e.start === '2026-09-15T16:00') && !(view.events[0].recurrence.exdates || []).length);

fake.close();
console.log(fails.length ? '\nFAILED:\n  ' + fails.join('\n  ') : `\nundo: all ${ran} checks passed`);
process.exit(fails.length ? 1 : 0);
