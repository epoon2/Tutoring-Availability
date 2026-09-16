// Local test server: serves public/ and answers /api/* from memory, so the
// admin UI can be driven end to end with no Netlify and no credentials.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// The REAL expansion logic, so the stub serves recurring events exactly
// the way production does (run `node tests/install-shim.mjs` once first).
import {
  expandEventsForRange, expandWeeklyEvent, localDateTimeToMinuteKey,
  buildPublicSchedule, findBlockedConflicts, normalizeSchedule
} from '../netlify/functions/api.mjs';
import {
  recordBeforeWrite, applyUndo, applyRedo, summarizeHistory, emptyHistory,
  listHistory, findRemovedEvent
} from '../netlify/functions/history.mjs';

const ROOT = new URL('../public/', import.meta.url).pathname;
const PORT = Number(process.argv[2] || 8877);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

let events = [];
let nextId = 1;

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

const config = {
  portalTitle: "Ethan's Tutoring Availability",
  tutorName: 'Ethan', timezone: 'America/Los_Angeles',
  dayStart: 8, dayEnd: 24,
  googleSync: Boolean(FAKE_GOOGLE)
};

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
    if (route === '/config') return json(res, 200, { config });
    if (route === '/login') return json(res, 200, { ok: true, mode: 'admin' });
    if (route === '/requests') return json(res, 200, { requests: [] });
    if (route.startsWith('/events') && req.method === 'GET') {
      const admin = req.headers['x-admin-password'] ? 'admin' : 'public';
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
        config, mode: admin,
        updatedAt: new Date().toISOString(), updatedBy: 'test',
        ...(admin === 'admin' ? { history: summarizeHistory(history) } : {})
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
      const at = events.findIndex(e => e.id === id);
      const next = events.slice();
      if (at >= 0) { next[at] = ev; } else { next.push(ev); }
      // the same honesty pass production runs: collapse whittled series,
      // fold matching standalones into a series that was just saved
      commit(req, events, normalizeSchedule(next, { absorbInto: ev.recurrence ? id : null }));
      return json(res, 200, { event: ev, id, sync: syncResult() });
    }
    if (route.startsWith('/events/') && req.method === 'PUT') {
      const id = decodeURIComponent(route.slice(8));
      events = events.map(e => e.id === id ? { ...e, ...body, id } : e);
      return json(res, 200, { event: events.find(e => e.id === id) });
    }
    if (route.startsWith('/events/') && req.method === 'DELETE') {
      const id = decodeURIComponent(route.slice(8));
      commit(req, events, events.filter(e => e.id !== id));
      return json(res, 200, { ok: true, sync: syncResult() });
    }
    if ((route === '/undo' || route === '/redo') && req.method === 'POST') {
      if (!req.headers['x-admin-password']) return json(res, 401, { error: 'Incorrect admin password.' });
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
      if (!req.headers['x-admin-password']) return json(res, 401, { error: 'Incorrect admin password.' });
      return json(res, 200, listHistory(history, events));
    }
    if (route === '/history/restore' && req.method === 'POST') {
      if (!req.headers['x-admin-password']) return json(res, 401, { error: 'Incorrect admin password.' });
      const restored = findRemovedEvent(history, String(body.entryId || ''), String(body.eventId || ''));
      if (!restored) return json(res, 404, { error: 'That step has no such event to restore.' });
      if (events.some(e => e.id === restored.id)) return json(res, 409, { error: 'That event is already on the schedule.' });
      const ev = { ...restored, updatedAt: new Date().toISOString() };
      commit(req, events, [...events, ev]);
      return json(res, 200, { ok: true, event: ev, sync: syncResult() });
    }
    if (route === '/google/resync' && req.method === 'POST') {
      if (!req.headers['x-admin-password']) return json(res, 401, { error: 'Incorrect admin password.' });
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
