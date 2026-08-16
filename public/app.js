(() => {
  const state = {
    weekStart: startOfWeek(new Date()),
    adminPassword: '',
    isAdmin: false,
    events: [],

    config: {
      portalTitle: 'Tutoring Availability',
      timezoneLabel: 'Pacific Time (PT)',
      dayStart: 8,
      dayEnd: 24
    },

    draggingId: null
  };

  const $ = (id) => document.getElementById(id);

  const calendar = $('calendar');
  const agenda = $('agenda');

  function init() {
    bindButtons();
    loadWeek();

    setInterval(() => {
      if (
        !state.isAdmin &&
        document.visibilityState === 'visible'
      ) {
        loadWeek(true);
      }
    }, 30000);
  }

  function bindButtons() {
    $('prevWeekBtn').addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, -7);
      loadWeek();
    });

    $('nextWeekBtn').addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, 7);
      loadWeek();
    });

    $('todayBtn').addEventListener('click', () => {
      state.weekStart = startOfWeek(new Date());
      loadWeek();
    });

    $('refreshBtn').addEventListener(
      'click',
      () => loadWeek()
    );

    $('adminBtn').addEventListener(
      'click',
      openAdminLogin
    );

    $('exitAdminBtn').addEventListener(
      'click',
      exitAdmin
    );

    $('addBtn').addEventListener(
      'click',
      () => openEventModal()
    );

    $('loginSubmitBtn').addEventListener(
      'click',
      submitAdminLogin
    );

    $('adminPasswordInput').addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter') {
          submitAdminLogin();
        }
      }
    );

    $('saveEventBtn').addEventListener(
      'click',
      saveEventFromModal
    );

    $('deleteEventBtn').addEventListener(
      'click',
      deleteEventFromModal
    );

    document
      .querySelectorAll('[data-close]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          closeModal(btn.dataset.close);
        });
      });

    document
      .querySelectorAll('.modal-backdrop')
      .forEach((backdrop) => {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) {
            closeModal(backdrop.id);
          }
        });
      });
  }

  async function api(path, options = {}) {
    const headers = new Headers(
      options.headers || {}
    );

    if (
      state.isAdmin &&
      state.adminPassword
    ) {
      headers.set(
        'x-admin-password',
        state.adminPassword
      );
    }

    if (
      options.body &&
      !headers.has('Content-Type')
    ) {
      headers.set(
        'Content-Type',
        'application/json'
      );
    }

    const res = await fetch('/api' + path, {
      ...options,
      headers,
      cache: 'no-store'
    });

    const data = await res
      .json()
      .catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.error ||
        `Request failed (${res.status})`
      );
    }

    return data;
  }

  async function loadWeek(silent = false) {
    if (!silent) {
      setStatus('Loading…');
    }

    try {
      const start =
        formatDate(state.weekStart);

      const end =
        formatDate(
          addDays(state.weekStart, 6)
        );

      const data = await api(
        `/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      );

      state.events =
        data.events || [];

      state.config =
        data.config || state.config;

      state.isAdmin =
        data.mode === 'admin';

      applyMode();
      renderAll();

      $('portalTitle').textContent =
        state.config.portalTitle;

      document.title =
        state.config.portalTitle;

      $('timezoneLabel').textContent =
        state.config.timezoneLabel;

      $('updatedLabel').textContent =
        data.lastUpdated
          ? 'Updated ' + formatUpdated(data.lastUpdated)
          : 'No saved times yet';

      if (!silent) {
        setStatus('');
      }
    } catch (err) {
      if (!silent) {
        handleError(err);
      }
    }
  }

  function applyMode() {
    $('adminBanner')
      .classList
      .toggle(
        'hidden',
        !state.isAdmin
      );

    $('addBtn')
      .classList
      .toggle(
        'hidden',
        !state.isAdmin
      );

    $('blockedLegend')
      .classList
      .toggle(
        'hidden',
        !state.isAdmin
      );

    $('adminBtn')
      .classList
      .toggle(
        'hidden',
        state.isAdmin
      );
  }

  function renderAll() {
    renderWeekLabel();
    renderCalendar();
    renderAgenda();
  }

  function renderWeekLabel() {
    const end =
      addDays(
        state.weekStart,
        6
      );

    $('weekLabel').textContent =
      state.weekStart.toLocaleDateString(
        undefined,
        {
          month: 'short',
          day: 'numeric'
        }
      ) +
      ' – ' +
      end.toLocaleDateString(
        undefined,
        {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }
      );
  }

  function renderCalendar() {
    const startHour =
      Number(
        state.config.dayStart ?? 8
      );

    const endHour =
      Number(
        state.config.dayEnd ?? 24
      );

    const totalHeight =
      (endHour - startHour) * 64;

    const today =
      formatDate(new Date());

    calendar.innerHTML = '';

    const corner =
      document.createElement('div');

    corner.className = 'corner';

    calendar.appendChild(corner);

    for (
      let d = 0;
      d < 7;
      d++
    ) {
      const date =
        addDays(
          state.weekStart,
          d
        );

      const head =
        document.createElement('div');

      head.className =
        'day-head' +
        (
          formatDate(date) === today
            ? ' today'
            : ''
        );

      head.innerHTML =
        `<div class="dow">${
          date.toLocaleDateString(
            undefined,
            {
              weekday: 'short'
            }
          )
        }</div>` +
        `<div class="date-num">${
          date.getDate()
        }</div>`;

      calendar.appendChild(head);
    }

    const timeCol =
      document.createElement('div');

    timeCol.className =
      'time-column';

    timeCol.style.height =
      totalHeight + 'px';

    for (
      let h = startHour;
      h <= endHour;
      h++
    ) {
      const label =
        document.createElement('div');

      label.className =
        'time-label';

      label.style.top =
        (
          (h - startHour) * 64
        ) +
        'px';

      label.textContent =
        formatMinutes(
          h * 60
        );

      timeCol.appendChild(label);
    }

    calendar.appendChild(timeCol);

    for (
      let d = 0;
      d < 7;
      d++
    ) {
      const dateStr =
        formatDate(
          addDays(
            state.weekStart,
            d
          )
        );

      const col =
        document.createElement('div');

      col.className =
        'day-column';

      col.dataset.date =
        dateStr;

      col.style.height =
        totalHeight + 'px';

      if (state.isAdmin) {
        col.addEventListener(
          'dragover',
          (e) => {
            e.preventDefault();

            col.classList.add(
              'drag-over'
            );
          }
        );

        col.addEventListener(
          'dragleave',
          () => {
            col.classList.remove(
              'drag-over'
            );
          }
        );

        col.addEventListener(
          'drop',
          (e) => {
            handleDrop(
              e,
              col
            );
          }
        );

        col.addEventListener(
          'dblclick',
          (e) => {
            handleEmptyDoubleClick(
              e,
              col
            );
          }
        );
      }

      getSegmentsForDate(dateStr)
        .forEach(
          ({
            event,
            startMin,
            endMin
          }) => {
            const card =
              createEventCard(
                event,
                startMin,
                endMin,
                startHour,
                endHour
              );

            if (card) {
              col.appendChild(card);
            }
          }
        );

      calendar.appendChild(col);
    }
  }

  function createEventCard(
    ev,
    segmentStartMin,
    segmentEndMin,
    startHour,
    endHour
  ) {
    const visibleStart =
      startHour * 60;

    const visibleEnd =
      endHour * 60;

    if (
      segmentEndMin <= visibleStart ||
      segmentStartMin >= visibleEnd
    ) {
      return null;
    }

    const clippedStart =
      Math.max(
        segmentStartMin,
        visibleStart
      );

    const clippedEnd =
      Math.min(
        segmentEndMin,
        visibleEnd
      );

    const top =
      (
        (
          clippedStart -
          visibleStart
        ) /
        60
      ) *
      64;

    const height =
      Math.max(
        (
          (
            clippedEnd -
            clippedStart
          ) /
          60
        ) *
        64,
        18
      );

    const card =
      document.createElement('div');

    card.className =
      'event-card ' +
      (
        ev.type === 'BLOCKED'
          ? 'blocked'
          : 'available'
      ) +
      (
        state.isAdmin
          ? ' admin'
          : ''
      ) +
      (
        height < 40
          ? ' compact'
          : ''
      );

    card.style.top =
      top + 'px';

    card.style.height =
      height + 'px';

    card.dataset.id =
      ev.id;

    const title =
      state.isAdmin
        ? (
            ev.title ||
            (
              ev.type === 'BLOCKED'
                ? 'Blocked'
                : 'Available'
            )
          )
        : 'Available';

    const titleEl =
      document.createElement('div');

    titleEl.className =
      'event-title';

    titleEl.textContent =
      title;

    const timeEl =
      document.createElement('div');

    timeEl.className =
      'event-time';

    timeEl.textContent =
      formatMinutes(
        segmentStartMin
      ) +
      ' – ' +
      formatMinutes(
        segmentEndMin
      );

    card.append(
      titleEl,
      timeEl
    );

    if (state.isAdmin) {
      card.draggable = true;

      card.addEventListener(
        'dragstart',
        (e) => {
          state.draggingId =
            ev.id;

          e.dataTransfer.effectAllowed =
            'move';

          e.dataTransfer.setData(
            'text/plain',
            ev.id
          );
        }
      );

      card.addEventListener(
        'dragend',
        () => {
          state.draggingId =
            null;

          document
            .querySelectorAll(
              '.drag-over'
            )
            .forEach(
              (x) => {
                x.classList.remove(
                  'drag-over'
                );
              }
            );
        }
      );

      card.addEventListener(
        'click',
        () => {
          // A displayed availability block may only be a fragment
          // of the original availability.
          //
          // Find the original stored event before opening the editor.
          const originalEvent =
            state.events.find(
              event => event.id === ev.id
            ) || ev;

          openEventModal(
            originalEvent
          );
        }
      );
    }

    return card;
  }

  function renderAgenda() {
    agenda.innerHTML = '';

    for (
      let d = 0;
      d < 7;
      d++
    ) {
      const date =
        addDays(
          state.weekStart,
          d
        );

      const dateStr =
        formatDate(date);

      const segments =
        getSegmentsForDate(
          dateStr
        );

      const section =
        document.createElement(
          'section'
        );

      section.className =
        'agenda-day';

      const h =
        document.createElement(
          'h3'
        );

      h.textContent =
        date.toLocaleDateString(
          undefined,
          {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
          }
        );

      section.appendChild(h);

      if (!segments.length) {
        const empty =
          document.createElement(
            'div'
          );

        empty.className =
          'agenda-empty';

        empty.textContent =
          state.isAdmin
            ? 'No events'
            : 'No availability';

        section.appendChild(
          empty
        );
      } else {
        segments.forEach(
          ({
            event: ev,
            startMin,
            endMin
          }) => {
            const item =
              document.createElement(
                state.isAdmin
                  ? 'button'
                  : 'div'
              );

            item.className =
              'agenda-item ' +
              (
                ev.type === 'BLOCKED'
                  ? 'blocked'
                  : 'available'
              );

            const left =
              document.createElement(
                'span'
              );

            const strong =
              document.createElement(
                'strong'
              );

            const meta =
              document.createElement(
                'div'
              );

            const right =
              document.createElement(
                'span'
              );

            strong.textContent =
              state.isAdmin
                ? (
                    ev.title ||
                    (
                      ev.type === 'BLOCKED'
                        ? 'Blocked'
                        : 'Available'
                    )
                  )
                : 'Available';

            meta.className =
              'meta';

            meta.textContent =
              formatMinutes(
                startMin
              ) +
              ' – ' +
              formatMinutes(
                endMin
              );

            right.className =
              'meta';

            right.textContent =
              state.isAdmin
                ? (
                    ev.type === 'BLOCKED'
                      ? 'Blocked'
                      : 'Open'
                  )
                : 'Open';

            left.append(
              strong,
              meta
            );

            item.append(
              left,
              right
            );

            if (state.isAdmin) {
              item.addEventListener(
                'click',
                () => {
                  openEventModal(
                    ev
                  );
                }
              );
            }

            section.appendChild(
              item
            );
          }
        );
      }

      agenda.appendChild(
        section
      );
    }
  }

  function getDisplayEvents() {
    // Public data is already calculated by the backend,
    // so we can display it exactly as received.
    if (!state.isAdmin) {
      return state.events;
    }

    const availability = state.events.filter(
      event => event.type === 'AVAILABLE'
    );

    const blocked = state.events.filter(
      event => event.type === 'BLOCKED'
    );

    // Blocked events themselves should still appear in admin mode.
    const displayEvents = blocked.map(event => ({
      ...event
    }));

    // Take each availability block and subtract every blocked event from it.
    for (const available of availability) {
      const availableStart = localDateTimeToMinuteKey(
        available.start
      );

      const availableEnd = localDateTimeToMinuteKey(
        available.end
      );

      let pieces = [
        [availableStart, availableEnd]
      ];

      for (const block of blocked) {
        const blockStart = localDateTimeToMinuteKey(
          block.start
        );

        const blockEnd = localDateTimeToMinuteKey(
          block.end
        );

        const nextPieces = [];

        for (const [start, end] of pieces) {
          // No overlap.
          if (
            blockEnd <= start ||
            blockStart >= end
          ) {
            nextPieces.push([start, end]);
            continue;
          }

          // Keep the part before the blocked session.
          if (blockStart > start) {
            nextPieces.push([
              start,
              Math.min(blockStart, end)
            ]);
          }

          // Keep the part after the blocked session.
          if (blockEnd < end) {
            nextPieces.push([
              Math.max(blockEnd, start),
              end
            ]);
          }
        }

        pieces = nextPieces;

        if (!pieces.length) {
          break;
        }
      }

      // Turn the remaining pieces back into display events.
      pieces.forEach(([start, end]) => {
        displayEvents.push({
          ...available,

          // Keep the same ID so clicking this fragment
          // can still find the original availability event.
          id: available.id,

          start: minuteKeyToLocalDateTime(start),
          end: minuteKeyToLocalDateTime(end)
        });
      });
    }

    return displayEvents.sort((a, b) => {
      return (
        localDateTimeToMinuteKey(a.start) -
        localDateTimeToMinuteKey(b.start)
      );
    });
  }

  function getSegmentsForDate(
    dateStr
  ) {
    const dayStart =
      localDateTimeToMinuteKey(
        dateStr + 'T00:00'
      );

    const dayEnd =
      dayStart + 1440;

    return getDisplayEvents()
      .map((event) => {
        const eventStart =
          localDateTimeToMinuteKey(
            event.start
          );

        const eventEnd =
          localDateTimeToMinuteKey(
            event.end
          );

        const segmentStart =
          Math.max(
            eventStart,
            dayStart
          );

        const segmentEnd =
          Math.min(
            eventEnd,
            dayEnd
          );

        if (
          segmentStart >=
          segmentEnd
        ) {
          return null;
        }

        return {
          event,

          startMin:
            segmentStart -
            dayStart,

          endMin:
            segmentEnd -
            dayStart
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.startMin -
            b.startMin ||
          a.endMin -
            b.endMin
      );
  }

  async function handleDrop(
    e,
    col
  ) {
    e.preventDefault();

    col.classList.remove(
      'drag-over'
    );

    const id =
      e.dataTransfer.getData(
        'text/plain'
      ) ||
      state.draggingId;

    const ev =
      state.events.find(
        (x) =>
          x.id === id
      );

    if (!ev) return;

    const rect =
      col.getBoundingClientRect();

    const y =
      Math.max(
        0,
        Math.min(
          rect.height,
          e.clientY -
            rect.top
        )
      );

    const startHour =
      Number(
        state.config.dayStart ??
        8
      );

    /*
      One-minute precision.
      No 15-minute snapping.
    */

    const newStartMinuteOfDay =
      startHour * 60 +
      Math.round(
        (y / 64) * 60
      );

    const oldStartKey =
      localDateTimeToMinuteKey(
        ev.start
      );

    const oldEndKey =
      localDateTimeToMinuteKey(
        ev.end
      );

    const duration =
      oldEndKey -
      oldStartKey;

    const newStart =
      dateAndMinutesToLocalDateTime(
        col.dataset.date,
        newStartMinuteOfDay
      );

    const newStartKey =
      localDateTimeToMinuteKey(
        newStart
      );

    const newEnd =
      minuteKeyToLocalDateTime(
        newStartKey +
        duration
      );

    try {
      setStatus(
        'Saving moved event…'
      );

      await api(
        '/events',
        {
          method: 'POST',

          body:
            JSON.stringify({
              ...ev,
              start: newStart,
              end: newEnd
            })
        }
      );

      await loadWeek();
    } catch (err) {
      handleError(err);
    }
  }

  function handleEmptyDoubleClick(
    e,
    col
  ) {
    if (
      e.target.closest(
        '.event-card'
      )
    ) {
      return;
    }

    const rect =
      col.getBoundingClientRect();

    const y =
      Math.max(
        0,
        Math.min(
          rect.height,
          e.clientY -
            rect.top
        )
      );

    const startHour =
      Number(
        state.config.dayStart ??
        8
      );

    const startMinuteOfDay =
      startHour * 60 +
      Math.round(
        (y / 64) * 60
      );

    const start =
      dateAndMinutesToLocalDateTime(
        col.dataset.date,
        startMinuteOfDay
      );

    const startKey =
      localDateTimeToMinuteKey(
        start
      );

    const end =
      minuteKeyToLocalDateTime(
        startKey +
        60
      );

    openEventModal({
      start,
      end,
      type: 'AVAILABLE'
    });
  }

  function openAdminLogin() {
    $('loginError').textContent =
      '';

    $('adminPasswordInput').value =
      '';

    openModal(
      'loginModal'
    );

    setTimeout(
      () =>
        $('adminPasswordInput')
          .focus(),
      50
    );
  }

  async function submitAdminLogin() {
    const password =
      $('adminPasswordInput').value;

    $('loginError').textContent =
      '';

    $('loginSubmitBtn').disabled =
      true;

    try {
      state.adminPassword =
        password;

      state.isAdmin =
        true;

      await api(
        '/login',
        {
          method: 'POST'
        }
      );

      closeModal(
        'loginModal'
      );

      await loadWeek();
    } catch (err) {
      state.adminPassword =
        '';

      state.isAdmin =
        false;

      $('loginError').textContent =
        err.message;
    } finally {
      $('loginSubmitBtn').disabled =
        false;
    }
  }

  function exitAdmin() {
    state.isAdmin =
      false;

    state.adminPassword =
      '';

    loadWeek();
  }

  function openEventModal(ev) {
    if (!state.isAdmin) {
      return;
    }

    const isEdit =
      Boolean(
        ev &&
        ev.id
      );

    const defaultDate =
      formatDate(
        new Date()
      );

    const defaultStart =
      defaultDate +
      'T15:00';

    const defaultEnd =
      defaultDate +
      'T16:00';

    $('eventModalTitle').textContent =
      isEdit
        ? 'Edit time'
        : 'Add time';

    $('eventId').value =
      isEdit
        ? ev.id
        : '';

    $('eventType').value =
      (
        ev &&
        ev.type
      ) ||
      'AVAILABLE';

    $('eventStart').value =
      (
        ev &&
        ev.start
      ) ||
      defaultStart;

    $('eventEnd').value =
      (
        ev &&
        ev.end
      ) ||
      defaultEnd;

    $('eventTitle').value =
      (
        ev &&
        ev.title
      ) ||
      '';

    $('eventNotes').value =
      (
        ev &&
        ev.notes
      ) ||
      '';

    $('eventError').textContent =
      '';

    $('deleteEventBtn')
      .classList
      .toggle(
        'hidden',
        !isEdit
      );

    openModal(
      'eventModal'
    );
  }

  async function saveEventFromModal() {
    const start =
      $('eventStart').value;

    const end =
      $('eventEnd').value;

    const startKey =
      localDateTimeToMinuteKey(
        start
      );

    const endKey =
      localDateTimeToMinuteKey(
        end
      );

    if (
      startKey == null ||
      endKey == null
    ) {
      $('eventError').textContent =
        'Enter a valid start and end date/time.';

      return;
    }

    if (
      endKey <=
      startKey
    ) {
      $('eventError').textContent =
        'End date/time must be after start date/time.';

      return;
    }

    const event = {
      id:
        $('eventId').value,

      type:
        $('eventType').value,

      start,

      end,

      title:
        $('eventTitle').value,

      notes:
        $('eventNotes').value
    };

    $('eventError').textContent =
      '';

    $('saveEventBtn').disabled =
      true;

    try {
      await api(
        '/events',
        {
          method: 'POST',
          body:
            JSON.stringify(
              event
            )
        }
      );

      closeModal(
        'eventModal'
      );

      await loadWeek();
    } catch (err) {
      $('eventError').textContent =
        err.message;
    } finally {
      $('saveEventBtn').disabled =
        false;
    }
  }

  async function deleteEventFromModal() {
    const id =
      $('eventId').value;

    if (
      !id ||
      !confirm(
        'Delete this event?'
      )
    ) {
      return;
    }

    $('deleteEventBtn').disabled =
      true;

    try {
      await api(
        '/events/' +
          encodeURIComponent(id),
        {
          method: 'DELETE'
        }
      );

      closeModal(
        'eventModal'
      );

      await loadWeek();
    } catch (err) {
      $('eventError').textContent =
        err.message;
    } finally {
      $('deleteEventBtn').disabled =
        false;
    }
  }

  function openModal(id) {
    $(id)
      .classList
      .remove(
        'hidden'
      );
  }

  function closeModal(id) {
    $(id)
      .classList
      .add(
        'hidden'
      );
  }

  function setStatus(text) {
    $('status').textContent =
      text || '';
  }

  function handleError(err) {
    setStatus(
      err.message ||
      String(err)
    );
  }

  function startOfWeek(date) {
    const d =
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );

    d.setDate(
      d.getDate() -
      d.getDay()
    );

    return d;
  }

  function addDays(
    date,
    amount
  ) {
    const d =
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );

    d.setDate(
      d.getDate() +
      amount
    );

    return d;
  }

  function formatDate(date) {
    return (
      `${date.getFullYear()}-` +
      `${String(
        date.getMonth() + 1
      ).padStart(2, '0')}-` +
      `${String(
        date.getDate()
      ).padStart(2, '0')}`
    );
  }

  function formatMinutes(min) {
    const normalized =
      (
        (
          min % 1440
        ) +
        1440
      ) %
      1440;

    const h24 =
      Math.floor(
        normalized / 60
      );

    const m =
      normalized % 60;

    const suffix =
      h24 >= 12
        ? 'PM'
        : 'AM';

    const h =
      h24 % 12 ||
      12;

    return (
      h +
      (
        m
          ? ':' +
            String(m)
              .padStart(
                2,
                '0'
              )
          : ''
      ) +
      ' ' +
      suffix
    );
  }

  function localDateTimeToMinuteKey(
    value
  ) {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
        .exec(
          value || ''
        );

    if (!match) {
      return null;
    }

    const year =
      Number(match[1]);

    const month =
      Number(match[2]);

    const day =
      Number(match[3]);

    const hour =
      Number(match[4]);

    const minute =
      Number(match[5]);

    if (
      month < 1 ||
      month > 12 ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    const ms =
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute
      );

    const check =
      new Date(ms);

    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day ||
      check.getUTCHours() !== hour ||
      check.getUTCMinutes() !== minute
    ) {
      return null;
    }

    return Math.floor(
      ms /
      60000
    );
  }

  function minuteKeyToLocalDateTime(
    key
  ) {
    const d =
      new Date(
        key * 60000
      );

    return (
      `${d.getUTCFullYear()}-` +
      `${String(
        d.getUTCMonth() + 1
      ).padStart(2, '0')}-` +
      `${String(
        d.getUTCDate()
      ).padStart(2, '0')}T` +
      `${String(
        d.getUTCHours()
      ).padStart(2, '0')}:` +
      `${String(
        d.getUTCMinutes()
      ).padStart(2, '0')}`
    );
  }

  function dateAndMinutesToLocalDateTime(
    dateStr,
    minutes
  ) {
    const dayStart =
      localDateTimeToMinuteKey(
        dateStr +
        'T00:00'
      );

    return minuteKeyToLocalDateTime(
      dayStart +
      minutes
    );
  }

  function formatUpdated(iso) {
    const d =
      new Date(iso);

    return Number.isNaN(
      d.getTime()
    )
      ? iso
      : d.toLocaleString(
          undefined,
          {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          }
        );
  }

  init();
})();