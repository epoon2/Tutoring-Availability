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
