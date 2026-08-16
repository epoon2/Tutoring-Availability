(() => {
  const state = {
    weekStart: startOfWeek(new Date()), adminPassword: '', isAdmin: false, events: [],
    config: { portalTitle: 'Tutoring Availability', timezoneLabel: 'Pacific Time (PT)', dayStart: 8, dayEnd: 22 }, draggingId: null
  };
  const $ = (id) => document.getElementById(id);
  const calendar = $('calendar');
  const agenda = $('agenda');

  function init() {
    bindButtons();
    loadWeek();
    setInterval(() => {
      if (!state.isAdmin && document.visibilityState === 'visible') loadWeek(true);
    }, 30000);
  }

  function bindButtons() {
    $('prevWeekBtn').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, -7); loadWeek(); });
    $('nextWeekBtn').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, 7); loadWeek(); });
    $('todayBtn').addEventListener('click', () => { state.weekStart = startOfWeek(new Date()); loadWeek(); });
    $('refreshBtn').addEventListener('click', () => loadWeek());
    $('adminBtn').addEventListener('click', openAdminLogin);
    $('exitAdminBtn').addEventListener('click', exitAdmin);
    $('addBtn').addEventListener('click', () => openEventModal());
    $('loginSubmitBtn').addEventListener('click', submitAdminLogin);
    $('adminPasswordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdminLogin(); });
    $('saveEventBtn').addEventListener('click', saveEventFromModal);
    $('deleteEventBtn').addEventListener('click', deleteEventFromModal);
    document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(backdrop.id); }));
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (state.isAdmin && state.adminPassword) headers.set('x-admin-password', state.adminPassword);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const res = await fetch('/api' + path, { ...options, headers, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function loadWeek(silent = false) {
    if (!silent) setStatus('Loading…');
    try {
      const start = formatDate(state.weekStart);
      const end = formatDate(addDays(state.weekStart, 6));
      const data = await api(`/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      state.events = data.events || [];
      state.config = data.config || state.config;
      state.isAdmin = data.mode === 'admin';
      applyMode(); renderAll();
      $('portalTitle').textContent = state.config.portalTitle;
      document.title = state.config.portalTitle;
      $('timezoneLabel').textContent = state.config.timezoneLabel;
      $('updatedLabel').textContent = data.lastUpdated ? 'Updated ' + formatUpdated(data.lastUpdated) : 'No saved times yet';
      if (!silent) setStatus('');
    } catch (err) { if (!silent) handleError(err); }
  }

  function applyMode() {
    $('adminBanner').classList.toggle('hidden', !state.isAdmin);
    $('addBtn').classList.toggle('hidden', !state.isAdmin);
    $('blockedLegend').classList.toggle('hidden', !state.isAdmin);
    $('adminBtn').classList.toggle('hidden', state.isAdmin);
  }

  function renderAll() { renderWeekLabel(); renderCalendar(); renderAgenda(); }
  function renderWeekLabel() {
    const end = addDays(state.weekStart, 6);
    $('weekLabel').textContent = state.weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' + end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderCalendar() {
    const startHour = Number(state.config.dayStart || 8), endHour = Number(state.config.dayEnd || 22), totalHeight = (endHour - startHour) * 64;
    const today = formatDate(new Date());
    calendar.innerHTML = '';
    const corner = document.createElement('div'); corner.className = 'corner'; calendar.appendChild(corner);
    for (let d = 0; d < 7; d++) {
      const date = addDays(state.weekStart, d), head = document.createElement('div');
      head.className = 'day-head' + (formatDate(date) === today ? ' today' : '');
      head.innerHTML = `<div class="dow">${date.toLocaleDateString(undefined, { weekday: 'short' })}</div><div class="date-num">${date.getDate()}</div>`;
      calendar.appendChild(head);
    }
    const timeCol = document.createElement('div'); timeCol.className = 'time-column'; timeCol.style.height = totalHeight + 'px';
    for (let h = startHour; h <= endHour; h++) {
      const label = document.createElement('div'); label.className = 'time-label'; label.style.top = ((h - startHour) * 64) + 'px'; label.textContent = formatMinutes(h * 60); timeCol.appendChild(label);
    }
    calendar.appendChild(timeCol);
    for (let d = 0; d < 7; d++) {
      const dateStr = formatDate(addDays(state.weekStart, d));
      const col = document.createElement('div'); col.className = 'day-column'; col.dataset.date = dateStr; col.style.height = totalHeight + 'px';
      if (state.isAdmin) {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
        col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
        col.addEventListener('drop', (e) => handleDrop(e, col));
        col.addEventListener('dblclick', (e) => handleEmptyDoubleClick(e, col));
      }
      state.events.filter((ev) => ev.date === dateStr).forEach((ev) => { const card = createEventCard(ev, startHour, endHour); if (card) col.appendChild(card); });
      calendar.appendChild(col);
    }
  }

  function createEventCard(ev, startHour, endHour) {
    const visibleStart = startHour * 60, visibleEnd = endHour * 60;
    if (ev.endMin <= visibleStart || ev.startMin >= visibleEnd) return null;
    const clippedStart = Math.max(ev.startMin, visibleStart), clippedEnd = Math.min(ev.endMin, visibleEnd);
    const top = ((clippedStart - visibleStart) / 60) * 64, height = Math.max(((clippedEnd - clippedStart) / 60) * 64, 18);
    const card = document.createElement('div');
    card.className = 'event-card ' + (ev.type === 'BLOCKED' ? 'blocked' : 'available') + (state.isAdmin ? ' admin' : '') + (height < 40 ? ' compact' : '');
    card.style.top = top + 'px'; card.style.height = height + 'px'; card.dataset.id = ev.id;
    const title = state.isAdmin ? (ev.title || (ev.type === 'BLOCKED' ? 'Blocked' : 'Available')) : 'Available';
    const titleEl = document.createElement('div'); titleEl.className = 'event-title'; titleEl.textContent = title;
    const timeEl = document.createElement('div'); timeEl.className = 'event-time'; timeEl.textContent = formatMinutes(ev.startMin) + ' – ' + formatMinutes(ev.endMin);
    card.append(titleEl, timeEl);
    if (state.isAdmin) {
      card.draggable = true;
      card.addEventListener('dragstart', (e) => { state.draggingId = ev.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ev.id); });
      card.addEventListener('dragend', () => { state.draggingId = null; document.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over')); });
      card.addEventListener('click', () => openEventModal(ev));
    }
    return card;
  }

  function renderAgenda() {
    agenda.innerHTML = '';
    for (let d = 0; d < 7; d++) {
      const date = addDays(state.weekStart, d), dateStr = formatDate(date);
      const events = state.events.filter((e) => e.date === dateStr).sort((a, b) => a.startMin - b.startMin);
      const section = document.createElement('section'); section.className = 'agenda-day';
      const h = document.createElement('h3'); h.textContent = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }); section.appendChild(h);
      if (!events.length) {
        const empty = document.createElement('div'); empty.className = 'agenda-empty'; empty.textContent = state.isAdmin ? 'No events' : 'No availability'; section.appendChild(empty);
      } else {
        events.forEach((ev) => {
          const item = document.createElement(state.isAdmin ? 'button' : 'div'); item.className = 'agenda-item ' + (ev.type === 'BLOCKED' ? 'blocked' : 'available');
          const left = document.createElement('span'), strong = document.createElement('strong'), meta = document.createElement('div'), right = document.createElement('span');
          strong.textContent = state.isAdmin ? (ev.title || (ev.type === 'BLOCKED' ? 'Blocked' : 'Available')) : 'Available';
          meta.className = 'meta'; meta.textContent = formatMinutes(ev.startMin) + ' – ' + formatMinutes(ev.endMin);
          right.className = 'meta'; right.textContent = state.isAdmin ? (ev.type === 'BLOCKED' ? 'Blocked' : 'Open') : 'Open';
          left.append(strong, meta); item.append(left, right); if (state.isAdmin) item.addEventListener('click', () => openEventModal(ev)); section.appendChild(item);
        });
      }
      agenda.appendChild(section);
    }
  }

  async function handleDrop(e, col) {
    e.preventDefault(); col.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain') || state.draggingId, ev = state.events.find((x) => x.id === id); if (!ev) return;
    const rect = col.getBoundingClientRect(), y = Math.max(0, Math.min(rect.height, e.clientY - rect.top)), startHour = Number(state.config.dayStart || 8);
    let newStart = startHour * 60 + Math.round((y / 64) * 60 / 15) * 15; const duration = ev.endMin - ev.startMin;
    newStart = Math.max(0, Math.min(1440 - duration, newStart));
    try { setStatus('Saving moved event…'); await api('/events', { method: 'POST', body: JSON.stringify({ ...ev, date: col.dataset.date, startMin: newStart, endMin: newStart + duration }) }); await loadWeek(); }
    catch (err) { handleError(err); }
  }

  function handleEmptyDoubleClick(e, col) {
    if (e.target.closest('.event-card')) return;
    const rect = col.getBoundingClientRect(), y = Math.max(0, Math.min(rect.height, e.clientY - rect.top)), startHour = Number(state.config.dayStart || 8);
    let startMin = startHour * 60 + Math.round((y / 64) * 60 / 15) * 15; startMin = Math.max(0, Math.min(1380, startMin));
    openEventModal({ date: col.dataset.date, startMin, endMin: Math.min(startMin + 60, 1440), type: 'AVAILABLE' });
  }

  function openAdminLogin() { $('loginError').textContent = ''; $('adminPasswordInput').value = ''; openModal('loginModal'); setTimeout(() => $('adminPasswordInput').focus(), 50); }
  async function submitAdminLogin() {
    const password = $('adminPasswordInput').value; $('loginError').textContent = ''; $('loginSubmitBtn').disabled = true;
    try {
      state.adminPassword = password; state.isAdmin = true;
      await api('/login', { method: 'POST' }); closeModal('loginModal'); await loadWeek();
    } catch (err) { state.adminPassword = ''; state.isAdmin = false; $('loginError').textContent = err.message; }
    finally { $('loginSubmitBtn').disabled = false; }
  }
  function exitAdmin() { state.isAdmin = false; state.adminPassword = ''; loadWeek(); }

  function openEventModal(ev) {
    if (!state.isAdmin) return;
    const isEdit = ev && ev.id;
    $('eventModalTitle').textContent = isEdit ? 'Edit time' : 'Add time'; $('eventId').value = isEdit ? ev.id : '';
    $('eventType').value = (ev && ev.type) || 'AVAILABLE'; $('eventDate').value = (ev && ev.date) || formatDate(new Date());
    $('eventStart').value = minutesToInput((ev && ev.startMin != null) ? ev.startMin : 15 * 60); $('eventEnd').value = minutesToInput((ev && ev.endMin != null) ? ev.endMin : 16 * 60);
    $('eventTitle').value = (ev && ev.title) || ''; $('eventNotes').value = (ev && ev.notes) || ''; $('eventError').textContent = ''; $('deleteEventBtn').classList.toggle('hidden', !isEdit); openModal('eventModal');
  }

  async function saveEventFromModal() {
    const startMin = inputToMinutes($('eventStart').value), endMin = inputToMinutes($('eventEnd').value);
    if (startMin == null || endMin == null || endMin <= startMin) { $('eventError').textContent = 'End time must be after start time.'; return; }
    const event = { id: $('eventId').value, type: $('eventType').value, date: $('eventDate').value, startMin, endMin, title: $('eventTitle').value, notes: $('eventNotes').value };
    $('eventError').textContent = ''; $('saveEventBtn').disabled = true;
    try { await api('/events', { method: 'POST', body: JSON.stringify(event) }); closeModal('eventModal'); await loadWeek(); }
    catch (err) { $('eventError').textContent = err.message; }
    finally { $('saveEventBtn').disabled = false; }
  }

  async function deleteEventFromModal() {
    const id = $('eventId').value; if (!id || !confirm('Delete this event?')) return; $('deleteEventBtn').disabled = true;
    try { await api('/events/' + encodeURIComponent(id), { method: 'DELETE' }); closeModal('eventModal'); await loadWeek(); }
    catch (err) { $('eventError').textContent = err.message; }
    finally { $('deleteEventBtn').disabled = false; }
  }

  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }
  function setStatus(text) { $('status').textContent = text || ''; }
  function handleError(err) { setStatus(err.message || String(err)); }
  function startOfWeek(date) { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() - d.getDay()); return d; }
  function addDays(date, amount) { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() + amount); return d; }
  function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function formatMinutes(min) { const h24 = Math.floor(min / 60) % 24, m = min % 60, suffix = h24 >= 12 ? 'PM' : 'AM', h = h24 % 12 || 12; return h + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + suffix; }
  function minutesToInput(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
  function inputToMinutes(value) { const match = /^(\d{2}):(\d{2})$/.exec(value || ''); return match ? Number(match[1]) * 60 + Number(match[2]) : null; }
  function formatUpdated(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  init();
})();
