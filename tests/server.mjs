// Local test server: serves public/ and answers /api/* from memory, so the
// admin UI can be driven end to end with no Netlify and no credentials.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// The REAL expansion logic, so the stub serves recurring events exactly
// the way production does (run `node tests/install-shim.mjs` once first).
import {
  expandEventsForRange, expandWeeklyEvent, localDateTimeToMinuteKey,
  buildPublicSchedule, findBlockedConflicts, normalizeSchedule,
  applyColorScope, dropWeekday, settingsFrom, configFrom, validateSettings
} from '../netlify/functions/api.mjs';
import {
  recordBeforeWrite, applyUndo, applyRedo, summarizeHistory, emptyHistory,
  listHistory, findRemovedEvent
} from '../netlify/functions/history.mjs';

const ROOT = new URL('../public/', import.meta.url).pathname;
// The port comes from the command line, else from the environment (a
// host such as Render assigns one), else 8877.
const PORT = Number(process.argv[2] || process.env.PORT || 8877);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

let events = [];
let nextId = 1;

// Custom colour presets, oldest first, as production keeps them.
const PALETTE = new Set(['#b42318', '#c2410c', '#a16207', '#2f7d4a', '#0f766e', '#1d4ed8', '#6d28d9', '#be185d', '#7c4a1e', '#4b5563']);
let customColors = [];
const rememberColor = (hex) => {
  if (!hex || PALETTE.has(hex) || hex === settings().colors.available || hex === settings().colors.blocked) return;
  if (customColors.includes(hex)) return;
  customColors = [...customColors, hex].slice(-16);
};

// Admin is any password (the stub does not check it), or the token /login hands a remembered device.
const TEST_TOKEN = '9999999999999.testtoken-signature-for-the-stub';
const isAdmin = (req) => !!req.headers['x-admin-password'] || req.headers['x-admin-token'] === TEST_TOKEN;

// The same undo bookkeeping production does, with the same module.
let history = emptyHistory();
const commit = (req, previous, next) => {
  history = recordBeforeWrite(history, {
    actionId: req.headers['x-action-id'] || null,
    label: req.headers['x-action-label'],
    previousEvents: previous,
  });
  events = next;
};

// FAKE_GOOGLE=ok|failed pretends the site has Google credentials and
// answers every write with that sync outcome, so the page's notice and
// the Sync button can be driven without a real calendar.
const FAKE_GOOGLE = process.env.FAKE_GOOGLE || '';
const syncResult = () => FAKE_GOOGLE === 'failed'
  ? { google: 'failed', error: 'Google 401: invalid key' }
  : FAKE_GOOGLE ? { google: 'ok' } : { google: 'off' };

// The settings record, kept in memory and shaped by the real code.
let settingsRecord = {};
// FAKE_MAIL=ok|failed|off pretends the site has (or lacks) Brevo, and
// answers a test send with that outcome; a failure is remembered as
// production remembers it.
const FAKE_MAIL = process.env.FAKE_MAIL || 'off';
let lastMailError = null;
const sentMail = [];
const mailStatus = () => ({ configured: FAKE_MAIL !== 'off', address: settings().notificationEmail || '', lastError: lastMailError });
const settings = () => settingsFrom(settingsRecord);
const config = () => ({ ...configFrom(settings()), googleSync: Boolean(FAKE_GOOGLE) });
const defaultColorFor = (type) => type === 'AVAILABLE' ? settings().colors.available : settings().colors.blocked;

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p.startsWith('/api')) {
    const route = p.slice(4);
    let body = {};
    if (!['GET','HEAD','DELETE'].includes(req.method)) {
      const chunks = []; for await (const c of req) chunks.push(c);
      try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {}
    }
    if (route === '/config') return json(res, 200, { config: config() });
    if (route === '/settings' && req.method === 'GET') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      return json(res, 200, { settings: settings(), config: config(), mail: mailStatus() });
    }
    if (route === '/settings/testmail' && req.method === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      if (FAKE_MAIL === 'off') return json(res, 400, { error: 'Email sending is not set up on the site yet (BREVO_API_KEY and NOTIFY_FROM_EMAIL).' });
      if (!settings().notificationEmail) return json(res, 400, { error: 'Enter and save a notification email first.' });
      if (FAKE_MAIL === 'failed') { lastMailError = { at: new Date().toISOString(), message: 'Brevo 401: Key not found' }; return json(res, 502, { error: 'Brevo 401: Key not found' }); }
      lastMailError = null;
      sentMail.push({ to: settings().notificationEmail, test: true });
      return json(res, 200, { ok: true, to: settings().notificationEmail });
    }
    if (route === '/settings' && req.method === 'PUT') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      try {
        settingsRecord = { ...settingsRecord, ...validateSettings(body, settings()) };
      } catch (e) { return json(res, 400, { error: e.message }); }
      return json(res, 200, { ok: true, settings: settings(), config: config(), sync: syncResult() });
    }
    if (route === '/login') {
      // the password, or the remembered-device token production would hand out
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      return json(res, 200, { ok: true, mode: 'admin',
        ...(body.remember === true ? { token: TEST_TOKEN, expiresAt: new Date(Date.now() + 90 * 86400000).toISOString() } : {}) });
    }
    if (route === '/requests') return json(res, 200, { requests: [] });
    if (route.startsWith('/events') && req.method === 'GET') {
      const admin = isAdmin(req) ? 'admin' : 'public';
      const params = url.searchParams;
      let served = events;
      if (params.get('start') && params.get('end')) {
        const rangeStart = localDateTimeToMinuteKey(params.get('start') + 'T00:00');
        const rangeEnd = localDateTimeToMinuteKey(params.get('end') + 'T00:00') + 1440;
        served = expandEventsForRange(events, rangeStart, rangeEnd);
      }
      return json(res, 200, {
        // Public visitors get the same reduced interval schedule
        // production builds; admins get the raw expanded events.
        events: admin === 'admin' ? served : buildPublicSchedule(served),
        config: config(), mode: admin,
        updatedAt: new Date().toISOString(), updatedBy: 'test',
        ...(admin === 'admin' ? { history: summarizeHistory(history), customColors, mail: mailStatus() } : {})
      });
    }
    if (route.startsWith('/events/') && route.endsWith('/skip') && req.method === 'POST') {
      const id = decodeURIComponent(route.slice('/events/'.length, -'/skip'.length));
      const event = events.find(e => e.id === id);
      if (!event) return json(res, 404, { error: 'That event no longer exists.' });
      if (!event.recurrence) return json(res, 400, { error: 'Only a repeating event has single weeks to skip.' });
      const date = body.date;
      const dayStart = localDateTimeToMinuteKey(date + 'T00:00');
      const lands = expandWeeklyEvent(event, dayStart, dayStart + 1440)
        .some(o => o.start.slice(0, 10) === date);
      if (!lands) return json(res, 400, { error: 'That series has no session on that date.' });
      const before = events.map(e => e === event ? { ...e, recurrence: { ...e.recurrence } } : e);
      event.recurrence.exdates = [...new Set([...(event.recurrence.exdates || []), date])].sort();
      commit(req, before, normalizeSchedule(events));
      return json(res, 200, { ok: true, sync: syncResult() });
    }
    if (route === '/events' && req.method === 'POST') {
      // Production refuses a save that puts one blocked session on top of
      // another unless the caller forces past it. The stub enforces the
      // same rule with the same code, so the browser tests exercise the
      // real gate rather than a permissive fiction.
      const conflicts = findBlockedConflicts(body, events);
      if (body.forceConflict !== true && conflicts.total > 0) {
        return json(res, 409, {
          code: 'BLOCKED_CONFLICT',
          error: 'This event overlaps an existing blocked session.',
          totalConflicts: conflicts.total,
          conflicts: conflicts.conflicts,
        });
      }
      // Create-or-update by id, exactly as production's route behaves:
      // a body that names an existing id replaces that event wholesale.
      const id = body.id || ('e' + (nextId++));
      const ev = { ...body, id };
      if (typeof ev.color === 'string') ev.color = ev.color.toLowerCase();
      const at = events.findIndex(e => e.id === id);
      // colour left unsaid keeps what was stored, as production does
      if (at >= 0) {
        const stored = events[at];
        if (!('color' in body) && stored.color) ev.color = stored.color;
        if (ev.recurrence && stored.recurrence && stored.recurrence.colorRules && !('colorRules' in ev.recurrence)
          && (!('color' in body) || (body.color || null) === (stored.color || null))) {
          ev.recurrence = { ...ev.recurrence, colorRules: stored.recurrence.colorRules };
        }
      }
      if (!ev.color) delete ev.color;
      if (ev.color === defaultColorFor(ev.type)) delete ev.color;
      rememberColor(ev.color);
      const next = events.slice();
      if (at >= 0) { next[at] = ev; } else { next.push(ev); }
      // the same honesty pass production runs: collapse whittled series,
      // fold matching standalones into a series that was just saved
      commit(req, events, normalizeSchedule(next, { absorbInto: ev.recurrence ? id : null }));
      return json(res, 200, { event: ev, id, sync: syncResult() });
    }
    if (route.startsWith('/events/') && route.endsWith('/color') && req.method === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      const id = decodeURIComponent(route.slice('/events/'.length, -'/color'.length));
      const at = events.findIndex(e => e.id === id);
      if (at < 0) return json(res, 404, { error: 'That event no longer exists.' });
      const next = events.slice();
      let color = body.color ? String(body.color).toLowerCase() : null;
      if (color === defaultColorFor(events[at].type)) color = null;
      try {
        next[at] = applyColorScope(events[at], { color, scope: body.scope || 'all', date: body.date });
      } catch (e) { return json(res, 400, { error: e.message }); }
      rememberColor(color);
      commit(req, events, normalizeSchedule(next));
      return json(res, 200, { ok: true, sync: syncResult() });
    }
    if (route.startsWith('/events/') && route.endsWith('/weekday') && req.method === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      const id = decodeURIComponent(route.slice('/events/'.length, -'/weekday'.length));
      const at = events.findIndex(e => e.id === id);
      if (at < 0) return json(res, 404, { error: 'That event no longer exists.' });
      const next = events.slice();
      try {
        next[at] = dropWeekday(events[at], Number(body.weekday));
      } catch (e) { return json(res, 400, { error: e.message }); }
      commit(req, events, normalizeSchedule(next));
      return json(res, 200, { ok: true, sync: syncResult() });
    }
    if (route.startsWith('/events/') && req.method === 'PUT') {
      const id = decodeURIComponent(route.slice(8));
      events = events.map(e => e.id === id ? { ...e, ...body, id } : e);
      return json(res, 200, { event: events.find(e => e.id === id) });
    }
    if (route.startsWith('/customcolors/') && req.method === 'DELETE') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      const hex = decodeURIComponent(route.slice('/customcolors/'.length)).toLowerCase();
      customColors = customColors.filter(h => h !== hex);
      return json(res, 200, { ok: true, customColors });
    }
    if (route.startsWith('/events/') && req.method === 'DELETE') {
      const id = decodeURIComponent(route.slice(8));
      commit(req, events, events.filter(e => e.id !== id));
      return json(res, 200, { ok: true, sync: syncResult() });
    }
    if ((route === '/undo' || route === '/redo') && req.method === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      // one step, or every step down to "until" - the same loop production runs
      let result = null, steps = 0;
      for (let i = 0; i < 200; i++) {
        const next = route === '/undo' ? applyUndo(history, events) : applyRedo(history, events);
        if (!next) break;
        history = next.history; events = next.events; result = next; steps++;
        if (!body.until || next.entry.id === body.until) break;
      }
      if (!result) return json(res, 409, { error: route === '/undo' ? 'Nothing to undo.' : 'Nothing to redo.' });
      return json(res, 200, { ok: true, steps,
        undone: route === '/undo' ? result.entry : null,
        redone: route === '/redo' ? result.entry : null,
        history: summarizeHistory(history), sync: syncResult() });
    }
    if (route === '/history' && req.method === 'GET') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      return json(res, 200, listHistory(history, events));
    }
    if (route === '/history/restoreversion' && req.method === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      const entry = history.undo.find(e => e.id === String(body.entryId || ''));
      if (!entry) return json(res, 404, { error: 'That version is no longer in the history.' });
      if (JSON.stringify(events) === JSON.stringify(entry.events)) return json(res, 200, { ok: true, unchanged: true, sync: syncResult() });
      commit(req, events, entry.events);
      return json(res, 200, { ok: true, restored: { id: entry.id, at: entry.at }, sync: syncResult() });
    }
    if (route === '/history/restore' && req.method === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      const restored = findRemovedEvent(history, String(body.entryId || ''), String(body.eventId || ''));
      if (!restored) return json(res, 404, { error: 'That step has no such event to restore.' });
      if (events.some(e => e.id === restored.id)) return json(res, 409, { error: 'That event is already on the schedule.' });
      const ev = { ...restored, updatedAt: new Date().toISOString() };
      commit(req, events, [...events, ev]);
      return json(res, 200, { ok: true, event: ev, sync: syncResult() });
    }
    if (route === '/google/resync' && req.method === 'POST') {
      if (!isAdmin(req)) return json(res, 401, { error: 'Incorrect admin password.' });
      if (!FAKE_GOOGLE) return json(res, 200, { google: 'off' });
      return json(res, 200, { google: 'ok', pushed: events.filter(e => e.type === 'BLOCKED').length, removed: 0 });
    }
    return json(res, 404, { error: 'no route ' + route });
  }

  const file = normalize(join(ROOT, p === '/' ? '/index.html' : p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log(`test server on ${PORT}`));
