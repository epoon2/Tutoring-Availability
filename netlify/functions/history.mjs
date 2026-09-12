/*
  Undo history.

  The schedule is one small document, so undo is a stack of whole
  snapshots: before every write, the schedule as it was goes on the undo
  stack; undo swaps the current schedule for the top snapshot and parks
  the current one on the redo stack.

  One user action on the page can be several writes - deleting "this and
  following" truncates a series and deletes the loose weeks in separate
  requests - so writes carry an action id, and only the FIRST write of an
  action records a snapshot. Undo then puts back the whole action, not a
  third of it.

  Pure functions over a plain object; the routes own reading and writing
  the stored copy.
*/

export const HISTORY_LIMIT = 30;

export function emptyHistory() {
  return { undo: [], redo: [] };
}

export function normalizeHistory(stored) {
  if (!stored || typeof stored !== "object") return emptyHistory();
  return {
    undo: Array.isArray(stored.undo) ? stored.undo : [],
    redo: Array.isArray(stored.redo) ? stored.redo : []
  };
}


/*
  Called before a write. Returns the history to store; the caller then
  writes the new schedule.
*/

export function recordBeforeWrite(history, { actionId, label, previousEvents, at = new Date() }) {
  const next = normalizeHistory(history);
  const top = next.undo[next.undo.length - 1];

  // Later writes of the same action: the pre-action snapshot is already there.
  if (actionId && top && top.id === actionId) return next;

  next.undo.push({
    id: actionId || cryptoId(),
    label: cleanLabel(label),
    at: at.toISOString(),
    events: previousEvents
  });
  if (next.undo.length > HISTORY_LIMIT) next.undo.splice(0, next.undo.length - HISTORY_LIMIT);

  // A fresh change makes the redo stack meaningless.
  next.redo = [];
  return next;
}


/*
  Undo: returns { history, events, entry } or null when there is nothing
  to undo. `currentEvents` becomes the redo snapshot for this entry.
*/

export function applyUndo(history, currentEvents) {
  const next = normalizeHistory(history);
  const entry = next.undo.pop();
  if (!entry) return null;
  next.redo.push({ ...entry, events: currentEvents });
  return { history: next, events: entry.events, entry: describe(entry) };
}

export function applyRedo(history, currentEvents) {
  const next = normalizeHistory(history);
  const entry = next.redo.pop();
  if (!entry) return null;
  next.undo.push({ ...entry, events: currentEvents });
  return { history: next, events: entry.events, entry: describe(entry) };
}


/*
  What the page shows on its buttons.
*/

export function summarizeHistory(history) {
  const h = normalizeHistory(history);
  const undoTop = h.undo[h.undo.length - 1];
  const redoTop = h.redo[h.redo.length - 1];
  return {
    undo: h.undo.length,
    redo: h.redo.length,
    undoLabel: undoTop ? undoTop.label : null,
    redoLabel: redoTop ? redoTop.label : null
  };
}

function describe(entry) {
  return { id: entry.id, label: entry.label, at: entry.at };
}

function cleanLabel(label) {
  const text = String(label || "").trim().slice(0, 80);
  return text || "change";
}

function cryptoId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}


/*
  WHAT A STEP CHANGED

  Snapshots are whole schedules; the page wants to show each step as
  the events it added, removed or changed. Comparing the snapshot
  before a step with the state after it gives exactly that.
*/

export function describeChange(before, after) {
  const was = new Map((before || []).map((event) => [event.id, event]));
  const now = new Map((after || []).map((event) => [event.id, event]));
  const added = [], removed = [], changed = [];
  for (const [id, event] of now) {
    const previous = was.get(id);
    if (!previous) added.push(brief(event));
    else if (JSON.stringify(previous) !== JSON.stringify(event)) changed.push(brief(event, previous));
  }
  for (const [id, event] of was) {
    if (!now.has(id)) removed.push(brief(event));
  }
  return { added, removed, changed };
}

function brief(event, previous) {
  const out = {
    id: event.id,
    type: event.type,
    title: event.title || "",
    start: event.start,
    end: event.end,
    recurrence: event.recurrence
      ? {
          weekdays: [...(event.recurrence.weekdays || [])],
          interval: event.recurrence.interval || 1,
          endType: event.recurrence.endType || "NEVER",
          until: event.recurrence.until || null,
          count: event.recurrence.count || null,
          exdates: [...(event.recurrence.exdates || [])]
        }
      : null
  };
  if (previous) {
    out.was = {
      title: previous.title || "",
      start: previous.start,
      end: previous.end,
      recurring: Boolean(previous.recurrence)
    };
  }
  return out;
}


/*
  The history as a list, newest first, each step with its changes.
  The undo side compares each snapshot with the state that followed
  it (the next snapshot up, or the current schedule at the top). The
  redo side holds post-step states, so it reads the other way round.
*/

export function listHistory(history, currentEvents) {
  const h = normalizeHistory(history);
  const present = new Set((currentEvents || []).map((event) => event.id));
  const undo = [];
  for (let i = h.undo.length - 1; i >= 0; i--) {
    const entry = h.undo[i];
    const after = i === h.undo.length - 1 ? currentEvents : h.undo[i + 1].events;
    const change = describeChange(entry.events, after);
    // a removed event that is back on the schedule now has nothing to restore
    change.removed = change.removed.map((item) => ({ ...item, present: present.has(item.id) }));
    undo.push({ id: entry.id, label: entry.label, at: entry.at, ...change });
  }
  const redo = [];
  for (let j = h.redo.length - 1; j >= 0; j--) {
    const entry = h.redo[j];
    const before = j === h.redo.length - 1 ? currentEvents : h.redo[j + 1].events;
    redo.push({ id: entry.id, label: entry.label, at: entry.at, ...describeChange(before, entry.events) });
  }
  return { undo, redo };
}


/*
  A removed event, as it was in the snapshot of the step that removed
  it - for putting just that one back.
*/

export function findRemovedEvent(history, entryId, eventId) {
  const h = normalizeHistory(history);
  const entry = [...h.undo, ...h.redo].find((item) => item.id === entryId);
  if (!entry) return null;
  return (entry.events || []).find((event) => event.id === eventId) || null;
}
