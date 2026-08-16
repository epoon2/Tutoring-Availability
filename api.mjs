import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const STORE_NAME = "tutoring-availability";
const EVENTS_KEY = "events-v1";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api/, "") || "/";

    if (req.method === "GET" && (route === "/" || route === "/events")) {
      const admin = hasValidAdminPassword(req);
      const events = await readEvents();
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const ranged = events
        .filter((e) => (!start || e.date >= start) && (!end || e.date <= end))
        .sort(sortEvents);

      return json({
        mode: admin ? "admin" : "public",
        config: getConfig(),
        events: admin ? ranged : buildPublicAvailability(ranged),
        lastUpdated: ranged.reduce((latest, e) => e.updatedAt > latest ? e.updatedAt : latest, "")
      });
    }

    if (req.method === "POST" && route === "/login") {
      requireAdmin(req);
      return json({ ok: true });
    }

    if (req.method === "POST" && route === "/events") {
      requireAdmin(req);
      const incoming = validateEvent(await req.json());
      const events = await readEvents();
      const now = new Date().toISOString();
      const id = incoming.id || crypto.randomUUID();
      const nextEvent = { ...incoming, id, updatedAt: now };
      const index = events.findIndex((e) => e.id === id);

      if (incoming.id && index < 0) {
        return json({ error: "That event no longer exists. Refresh and try again." }, 404);
      }

      if (index >= 0) events[index] = nextEvent;
      else events.push(nextEvent);

      await writeEvents(events);
      return json({ id, updatedAt: now });
    }

    if (req.method === "DELETE" && route.startsWith("/events/")) {
      requireAdmin(req);
      const id = decodeURIComponent(route.slice("/events/".length));
      const events = await readEvents();
      const next = events.filter((e) => e.id !== id);
      if (next.length === events.length) return json({ error: "That event no longer exists." }, 404);
      await writeEvents(next);
      return json({ ok: true });
    }

    return json({ error: "Not found." }, 404);
  } catch (err) {
    const status = err?.status || 500;
    return json({ error: status === 500 ? "Something went wrong on the server." : err.message }, status);
  }
};

function getConfig() {
  return {
    portalTitle: process.env.PORTAL_TITLE || "Tutoring Availability",
    timezoneLabel: process.env.TIMEZONE_LABEL || "Pacific Time (PT)",
    dayStart: clamp(Number(process.env.DAY_START || 8), 0, 23),
    dayEnd: clamp(Number(process.env.DAY_END || 22), 1, 24)
  };
}

async function readEvents() {
  const store = getStore(STORE_NAME);
  return (await store.get(EVENTS_KEY, { type: "json", consistency: "strong" })) || [];
}

async function writeEvents(events) {
  const store = getStore(STORE_NAME);
  await store.setJSON(EVENTS_KEY, events);
}

function requireAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) {
    const err = new Error("ADMIN_PASSWORD is not configured in Netlify yet.");
    err.status = 503;
    throw err;
  }
  if (!hasValidAdminPassword(req)) {
    const err = new Error("Incorrect admin password.");
    err.status = 401;
    throw err;
  }
}

function hasValidAdminPassword(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const supplied = req.headers.get("x-admin-password") || "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validateEvent(event) {
  if (!event || typeof event !== "object") bad("Invalid event.");
  const type = String(event.type || "").toUpperCase();
  if (!['AVAILABLE', 'BLOCKED'].includes(type)) bad("Event type must be AVAILABLE or BLOCKED.");

  const date = String(event.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad("Invalid date.");

  const startMin = Number(event.startMin);
  const endMin = Number(event.endMin);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) bad("Invalid time.");
  if (startMin < 0 || endMin > 1440 || startMin >= endMin) bad("End time must be after start time.");
  if (startMin % 15 !== 0 || endMin % 15 !== 0) bad("Times must be in 15-minute increments.");

  return {
    id: event.id ? String(event.id) : "",
    type,
    title: String(event.title || "").trim().slice(0, 100),
    date,
    startMin,
    endMin,
    notes: String(event.notes || "").trim().slice(0, 500)
  };
}

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

function buildPublicAvailability(events) {
  const byDate = {};
  for (const e of events) {
    if (!byDate[e.date]) byDate[e.date] = { available: [], blocked: [] };
    const interval = [e.startMin, e.endMin];
    if (e.type === "AVAILABLE") byDate[e.date].available.push(interval);
    if (e.type === "BLOCKED") byDate[e.date].blocked.push(interval);
  }

  const output = [];
  for (const date of Object.keys(byDate).sort()) {
    const available = mergeIntervals(byDate[date].available);
    const blocked = mergeIntervals(byDate[date].blocked);
    const open = subtractIntervals(available, blocked);
    open.forEach((range, index) => {
      output.push({
        id: `public-${date}-${index}-${range[0]}`,
        type: "AVAILABLE",
        title: "Available",
        date,
        startMin: range[0],
        endMin: range[1],
        notes: "",
        updatedAt: ""
      });
    });
  }
  return output;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals.map((x) => [Number(x[0]), Number(x[1])]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current[0] <= last[1]) last[1] = Math.max(last[1], current[1]);
    else merged.push(current.slice());
  }
  return merged;
}

function subtractIntervals(available, blocked) {
  let result = available.map((x) => x.slice());
  for (const block of blocked) {
    const next = [];
    for (const open of result) {
      if (block[1] <= open[0] || block[0] >= open[1]) {
        next.push(open);
        continue;
      }
      if (block[0] > open[0]) next.push([open[0], Math.min(block[0], open[1])]);
      if (block[1] < open[1]) next.push([Math.max(block[1], open[0]), open[1]]);
    }
    result = next.filter((x) => x[1] > x[0]);
  }
  return result;
}

function sortEvents(a, b) {
  return a.date.localeCompare(b.date) || a.startMin - b.startMin || a.endMin - b.endMin;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export const config = {
  path: "/api/*"
};
