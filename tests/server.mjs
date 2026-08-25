// Local test server: serves public/ and answers /api/* from memory, so the
// admin UI can be driven end to end with no Netlify and no credentials.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../public/', import.meta.url).pathname;
const PORT = Number(process.argv[2] || 8877);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

let events = [];
let nextId = 1;

const config = {
  portalTitle: "Ethan's Tutoring Availability",
  tutorName: 'Ethan', timezone: 'America/Los_Angeles',
  dayStart: 8, dayEnd: 24
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
      return json(res, 200, {
        events, config, mode: admin,
        updatedAt: new Date().toISOString(), updatedBy: 'test'
      });
    }
    if (route === '/events' && req.method === 'POST') {
      const ev = { ...body, id: 'e' + (nextId++) };
      events.push(ev);
      return json(res, 200, { event: ev });
    }
    if (route.startsWith('/events/') && req.method === 'PUT') {
      const id = decodeURIComponent(route.slice(8));
      events = events.map(e => e.id === id ? { ...e, ...body, id } : e);
      return json(res, 200, { event: events.find(e => e.id === id) });
    }
    if (route.startsWith('/events/') && req.method === 'DELETE') {
      const id = decodeURIComponent(route.slice(8));
      events = events.filter(e => e.id !== id);
      return json(res, 200, { ok: true });
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
