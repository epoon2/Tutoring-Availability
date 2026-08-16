(() => {

  const state = {
    weekStart: startOfWeek(new Date()),

    adminPassword: '',

    isAdmin: false,

    events: [],

    config: {
      portalTitle: 'Tutoring Availability',
      timezoneLabel: 'Pacific Time (PT)',
      timezoneId: 'America/Los_Angeles',
      dayStart: 8,
      dayEnd: 24
    },

    draggingId: null
  };


  const $ = (id) =>
    document.getElementById(id);


  const calendar =
    $('calendar');


  const agenda =
    $('agenda');


  function init() {

    bindButtons();

    loadWeek();


    /*
      Automatically refresh public view.
    */

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

    $('prevWeekBtn').addEventListener(
      'click',
      () => {

        state.weekStart =
          addDays(
            state.weekStart,
            -7
          );

        loadWeek();

      }
    );


    $('nextWeekBtn').addEventListener(
      'click',
      () => {

        state.weekStart =
          addDays(
            state.weekStart,
            7
          );

        loadWeek();

      }
    );


    $('todayBtn').addEventListener(
      'click',
      () => {

        state.weekStart =
          startOfWeek(
            new Date()
          );

        loadWeek();

      }
    );


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


    $('blockedSessionsBtn').addEventListener(
      'click',
      openBlockedSessions
    );


    $('closeBlockedDrawerBtn').addEventListener(
      'click',
      closeBlockedSessions
    );


    $('blockedDrawerBackdrop').addEventListener(
      'click',
      (e) => {

        if (
          e.target ===
          $('blockedDrawerBackdrop')
        ) {

          closeBlockedSessions();

        }

      }
    );


    $('loginSubmitBtn').addEventListener(
      'click',
      submitAdminLogin
    );


    $('adminPasswordInput').addEventListener(
      'keydown',
      (e) => {

        if (
          e.key === 'Enter'
        ) {

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


    /*
      Recurrence type.
    */

    $('repeatType').addEventListener(
      'change',
      () => {

        if (
          $('repeatType').value === 'WEEKLY' &&
          getSelectedWeekdays().length === 0
        ) {

          selectStartWeekday();

        }


        updateRecurrenceUI();

      }
    );


    /*
      Weekday buttons.
    */

    document
      .querySelectorAll(
        '.weekday-btn'
      )
      .forEach(
        (button) => {

          button.addEventListener(
            'click',
            () => {

              button.classList.toggle(
                'selected'
              );

            }
          );

        }
      );


    /*
      Recurrence ending options.
    */

    document
      .querySelectorAll(
        'input[name="repeatEndType"]'
      )
      .forEach(
        (radio) => {

          radio.addEventListener(
            'change',
            updateRecurrenceUI
          );

        }
      );


    $('eventStart').addEventListener(
      'change',
      () => {

        if (
          $('repeatType').value === 'WEEKLY' &&
          getSelectedWeekdays().length === 0
        ) {

          selectStartWeekday();

        }

      }
    );


    /*
      Modal close buttons.
    */

    document
      .querySelectorAll(
        '[data-close]'
      )
      .forEach(
        (button) => {

          button.addEventListener(
            'click',
            () => {

              closeModal(
                button.dataset.close
              );

            }
          );

        }
      );


    /*
      Clicking outside a modal closes it.
    */

    document
      .querySelectorAll(
        '.modal-backdrop'
      )
      .forEach(
        (backdrop) => {

          backdrop.addEventListener(
            'click',
            (e) => {

              if (
                e.target === backdrop
              ) {

                closeModal(
                  backdrop.id
                );

              }

            }
          );

        }
      );

  }


  /*
    API
  */

  async function api(
    path,
    options = {}
  ) {

    const headers =
      new Headers(
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
      !headers.has(
        'Content-Type'
      )
    ) {

      headers.set(
        'Content-Type',
        'application/json'
      );

    }


    const response =
      await fetch(
        '/api' + path,
        {
          ...options,
          headers,
          cache: 'no-store'
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      !response.ok
    ) {

      const error =
        new Error(
          data.error ||
          `Request failed (${response.status})`
        );


      error.status =
        response.status;


      error.data =
        data;


      throw error;

    }


    return data;

  }


  /*
    LOAD CALENDAR
  */

  async function loadWeek(
    silent = false
  ) {

    if (
      !silent
    ) {

      setStatus(
        'Loading…'
      );

    }


    try {

      const start =
        formatDate(
          state.weekStart
        );


      const end =
        formatDate(
          addDays(
            state.weekStart,
            6
          )
        );


      const data =
        await api(
          `/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
        );


      state.events =
        data.events || [];


      state.config =
        data.config ||
        state.config;


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
          ? 'Updated ' +
            formatUpdated(
              data.lastUpdated
            )
          : 'No saved times yet';


      if (
        !silent
      ) {

        setStatus('');

      }

    } catch (err) {

      if (
        !silent
      ) {

        handleError(
          err
        );

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


    $('blockedSessionsBtn')
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


  /*
    ADMIN DISPLAY

    Availability is visually split
    around blocked sessions.

    The original availability event
    remains stored unchanged.
  */

  function getDisplayEvents() {

    if (
      !state.isAdmin
    ) {

      return state.events;

    }


    const availability =
      state.events.filter(
        (event) =>
          event.type ===
          'AVAILABLE'
      );


    const blocked =
      state.events.filter(
        (event) =>
          event.type ===
          'BLOCKED'
      );


    const displayEvents =
      blocked.map(
        (event) => ({
          ...event
        })
      );


    for (
      const available of availability
    ) {

      const availableStart =
        localDateTimeToMinuteKey(
          available.start
        );


      const availableEnd =
        localDateTimeToMinuteKey(
          available.end
        );


      let pieces = [
        [
          availableStart,
          availableEnd
        ]
      ];


      for (
        const block of blocked
      ) {

        const blockStart =
          localDateTimeToMinuteKey(
            block.start
          );


        const blockEnd =
          localDateTimeToMinuteKey(
            block.end
          );


        const nextPieces = [];


        for (
          const [
            start,
            end
          ] of pieces
        ) {

          if (
            blockEnd <= start ||
            blockStart >= end
          ) {

            nextPieces.push(
              [
                start,
                end
              ]
            );

            continue;

          }


          if (
            blockStart > start
          ) {

            nextPieces.push([
              start,
              Math.min(
                blockStart,
                end
              )
            ]);

          }


          if (
            blockEnd < end
          ) {

            nextPieces.push([
              Math.max(
                blockEnd,
                start
              ),
              end
            ]);

          }

        }


        pieces =
          nextPieces;


        if (
          !pieces.length
        ) {

          break;

        }

      }


      pieces.forEach(
        (
          [
            start,
            end
          ],
          index
        ) => {

          displayEvents.push({
            ...available,

            displayId:
              `${available.id}-fragment-${start}-${index}`,

            masterId:
              available.masterId ||
              available.id,

            start:
              minuteKeyToLocalDateTime(
                start
              ),

            end:
              minuteKeyToLocalDateTime(
                end
              )
          });

        }
      );

    }


    return displayEvents.sort(
      (a, b) =>
        localDateTimeToMinuteKey(
          a.start
        ) -
        localDateTimeToMinuteKey(
          b.start
        )
    );

  }


  /*
    CALENDAR
  */

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
      (
        endHour -
        startHour
      ) *
      64;


    const today =
      formatDate(
        new Date()
      );


    calendar.innerHTML =
      '';


    const corner =
      document.createElement(
        'div'
      );


    corner.className =
      'corner';


    calendar.appendChild(
      corner
    );


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
        document.createElement(
          'div'
        );


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


      calendar.appendChild(
        head
      );

    }


    const timeCol =
      document.createElement(
        'div'
      );


    timeCol.className =
      'time-column';


    timeCol.style.height =
      totalHeight +
      'px';


    for (
      let h = startHour;
      h <= endHour;
      h++
    ) {

      const label =
        document.createElement(
          'div'
        );


      label.className =
        'time-label';


      label.style.top =
        (
          (
            h -
            startHour
          ) *
          64
        ) +
        'px';


      label.textContent =
        formatMinutes(
          h *
          60
        );


      timeCol.appendChild(
        label
      );

    }


    calendar.appendChild(
      timeCol
    );


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
        formatDate(
          date
        );


      const column =
        document.createElement(
          'div'
        );


      column.className =
        'day-column';


      column.dataset.date =
        dateStr;


      column.style.height =
        totalHeight +
        'px';


      if (
        state.isAdmin
      ) {

        column.addEventListener(
          'dragover',
          (e) => {

            e.preventDefault();

            column.classList.add(
              'drag-over'
            );

          }
        );


        column.addEventListener(
          'dragleave',
          () => {

            column.classList.remove(
              'drag-over'
            );

          }
        );


        column.addEventListener(
          'drop',
          (e) =>
            handleDrop(
              e,
              column
            )
        );


        column.addEventListener(
          'dblclick',
          (e) =>
            handleEmptyDoubleClick(
              e,
              column
            )
        );

      }


      getSegmentsForDate(
        dateStr
      )
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


            if (
              card
            ) {

              column.appendChild(
                card
              );

            }

          }
        );


      calendar.appendChild(
        column
      );

    }

  }


  function getSegmentsForDate(
    dateStr
  ) {

    const dayStart =
      localDateTimeToMinuteKey(
        dateStr +
        'T00:00'
      );


    const dayEnd =
      dayStart +
      1440;


    return getDisplayEvents()
      .map(
        (event) => {

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

        }
      )
      .filter(
        Boolean
      )
      .sort(
        (a, b) =>
          a.startMin -
            b.startMin ||
          a.endMin -
            b.endMin
      );

  }


  function createEventCard(
    event,
    segmentStartMin,
    segmentEndMin,
    startHour,
    endHour
  ) {

    const visibleStart =
      startHour *
      60;


    const visibleEnd =
      endHour *
      60;


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
      document.createElement(
        'div'
      );


    card.className =
      'event-card ' +
      (
        event.type === 'BLOCKED'
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
      top +
      'px';


    card.style.height =
      height +
      'px';


    const title =
      state.isAdmin
        ? (
            event.title ||
            (
              event.type === 'BLOCKED'
                ? 'Blocked Session'
                : 'Available'
            )
          )
        : (
            event.type === 'BLOCKED'
              ? 'Blocked Session'
              : 'Available'
          );


    const titleElement =
      document.createElement(
        'div'
      );


    titleElement.className =
      'event-title';


    titleElement.textContent =
      title;


    const timeElement =
      document.createElement(
        'div'
      );


    timeElement.className =
      'event-time';


    timeElement.textContent =
      formatMinutes(
        segmentStartMin
      ) +
      ' – ' +
      formatMinutes(
        segmentEndMin
      );


    card.append(
      titleElement,
      timeElement
    );


    if (
      state.isAdmin
    ) {

      const original =
        getOriginalEvent(
          event
        );


      const recurring =
        Boolean(
          original?.recurrence
        );


      if (
        !recurring
      ) {

        card.draggable =
          true;


        card.addEventListener(
          'dragstart',
          (e) => {

            state.draggingId =
              original.id;


            e.dataTransfer.effectAllowed =
              'move';


            e.dataTransfer.setData(
              'text/plain',
              original.id
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
                (element) =>
                  element.classList.remove(
                    'drag-over'
                  )
              );

          }
        );

      } else {

        card.draggable =
          false;


        card.title =
          'Recurring event. Click to edit the recurring series.';

      }


      card.addEventListener(
        'click',
        () => {

          openEventModal(
            original
          );

        }
      );

    }


    return card;

  }


  function getOriginalEvent(
    event
  ) {

    const id =
      event.masterId ||
      event.id;


    const match =
      state.events.find(
        (item) =>
          (
            item.masterId ||
            item.id
          ) === id
      );


    return match ||
      event;

  }


  /*
    MOBILE AGENDA
  */

  function renderAgenda() {

    agenda.innerHTML =
      '';


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
        formatDate(
          date
        );


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


      const heading =
        document.createElement(
          'h3'
        );


      heading.textContent =
        date.toLocaleDateString(
          undefined,
          {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
          }
        );


      section.appendChild(
        heading
      );


      if (
        !segments.length
      ) {

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
            event,
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
                event.type === 'BLOCKED'
                  ? 'blocked'
                  : 'available'
              );


            const left =
              document.createElement(
                'span'
              );


            const title =
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


            title.textContent =
              state.isAdmin
                ? (
                    event.title ||
                    (
                      event.type === 'BLOCKED'
                        ? 'Blocked Session'
                        : 'Available'
                    )
                  )
                : (
                    event.type === 'BLOCKED'
                      ? 'Blocked Session'
                      : 'Available'
                  );


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
              event.type === 'BLOCKED'
                ? 'Blocked'
                : 'Open';


            left.append(
              title,
              meta
            );


            item.append(
              left,
              right
            );


            if (
              state.isAdmin
            ) {

              item.addEventListener(
                'click',
                () => {

                  openEventModal(
                    getOriginalEvent(
                      event
                    )
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


  /*
    BLOCKED SESSION ADMIN PANEL
  */

  async function openBlockedSessions() {

    if (
      !state.isAdmin
    ) {

      return;

    }


    $('blockedDrawerBackdrop')
      .classList
      .remove(
        'hidden'
      );


    $('blockedListStatus').textContent =
      'Loading blocked sessions…';


    $('pastBlockedList').innerHTML =
      '';


    $('upcomingBlockedList').innerHTML =
      '';


    try {

      const nowKey =
        getPortalNowMinuteKey();


      /*
        Display one year backward
        and one year forward.
      */

      const startDate =
        minuteKeyToLocalDateTime(
          nowKey -
          365 *
          1440
        ).slice(
          0,
          10
        );


      const endDate =
        minuteKeyToLocalDateTime(
          nowKey +
          365 *
          1440
        ).slice(
          0,
          10
        );


      const data =
        await api(
          `/events?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`
        );


      if (
        data.mode !== 'admin'
      ) {

        throw new Error(
          'Admin access is no longer active. Please log in again.'
        );

      }


      const blocked =
        (
          data.events ||
          []
        )
          .filter(
            (event) =>
              event.type ===
              'BLOCKED'
          );


      /*
        Past events:
        already ended.

        Current events:
        remain in upcoming.
      */

      const past =
        blocked
          .filter(
            (event) =>
              localDateTimeToMinuteKey(
                event.end
              ) <=
              nowKey
          )
          .sort(
            (a, b) =>
              localDateTimeToMinuteKey(
                b.end
              ) -
              localDateTimeToMinuteKey(
                a.end
              )
          );


      const upcoming =
        blocked
          .filter(
            (event) =>
              localDateTimeToMinuteKey(
                event.end
              ) >
              nowKey
          )
          .sort(
            (a, b) =>
              localDateTimeToMinuteKey(
                a.start
              ) -
              localDateTimeToMinuteKey(
                b.start
              )
          );


      $('pastBlockedCount').textContent =
        past.length;


      $('upcomingBlockedCount').textContent =
        upcoming.length;


      renderBlockedSessionList(
        $('pastBlockedList'),
        past,
        nowKey
      );


      renderBlockedSessionList(
        $('upcomingBlockedList'),
        upcoming,
        nowKey
      );


      $('blockedListStatus').textContent =
        '';

    } catch (err) {

      $('blockedListStatus').textContent =
        err.message;

    }

  }


  function closeBlockedSessions() {

    $('blockedDrawerBackdrop')
      .classList
      .add(
        'hidden'
      );

  }


  function renderBlockedSessionList(
    container,
    events,
    nowKey
  ) {

    container.innerHTML =
      '';


    if (
      !events.length
    ) {

      const empty =
        document.createElement(
          'div'
        );


      empty.className =
        'blocked-list-empty';


      empty.textContent =
        'No blocked sessions';


      container.appendChild(
        empty
      );


      return;

    }


    for (
      const event of events
    ) {

      const startKey =
        localDateTimeToMinuteKey(
          event.start
        );


      const endKey =
        localDateTimeToMinuteKey(
          event.end
        );


      const current =
        startKey <= nowKey &&
        endKey > nowKey;


      const button =
        document.createElement(
          'button'
        );


      button.type =
        'button';


      button.className =
        'blocked-session-item' +
        (
          current
            ? ' current'
            : ''
        );


      const title =
        document.createElement(
          'div'
        );


      title.className =
        'blocked-session-title';


      title.textContent =
        event.title ||
        'Blocked Session';


      const time =
        document.createElement(
          'div'
        );


      time.className =
        'blocked-session-time';


      time.textContent =
        formatBlockedEventRange(
          event.start,
          event.end
        );


      const meta =
        document.createElement(
          'div'
        );


      meta.className =
        'blocked-session-meta';


      if (
        current
      ) {

        const currentBadge =
          document.createElement(
            'span'
          );


        currentBadge.textContent =
          'Happening now';


        meta.appendChild(
          currentBadge
        );

      }


      if (
        event.recurrence
      ) {

        const recurringBadge =
          document.createElement(
            'span'
          );


        recurringBadge.className =
          'recurring-badge';


        recurringBadge.textContent =
          '↻ Recurring';


        meta.appendChild(
          recurringBadge
        );

      }


      button.append(
        title,
        time,
        meta
      );


      button.addEventListener(
        'click',
        () => {

          closeBlockedSessions();


          openEventModal(
            event
          );

        }
      );


      container.appendChild(
        button
      );

    }

  }


  /*
    DRAG ONE-TIME EVENTS
  */

  async function handleDrop(
    event,
    column
  ) {

    event.preventDefault();


    column.classList.remove(
      'drag-over'
    );


    const id =
      event.dataTransfer.getData(
        'text/plain'
      ) ||
      state.draggingId;


    const storedEvent =
      state.events.find(
        (item) =>
          (
            item.masterId ||
            item.id
          ) === id
      );


    if (
      !storedEvent
    ) {

      return;

    }


    if (
      storedEvent.recurrence
    ) {

      setStatus(
        'Recurring events must be edited by clicking them.'
      );

      return;

    }


    const rect =
      column.getBoundingClientRect();


    const y =
      Math.max(
        0,
        Math.min(
          rect.height,
          event.clientY -
          rect.top
        )
      );


    const startHour =
      Number(
        state.config.dayStart ??
        8
      );


    const newStartMinuteOfDay =
      startHour *
      60 +
      Math.round(
        (
          y /
          64
        ) *
        60
      );


    const oldStartKey =
      localDateTimeToMinuteKey(
        storedEvent.start
      );


    const oldEndKey =
      localDateTimeToMinuteKey(
        storedEvent.end
      );


    const duration =
      oldEndKey -
      oldStartKey;


    const newStart =
      dateAndMinutesToLocalDateTime(
        column.dataset.date,
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


      const result =
        await saveEventWithConflictCheck({
          id:
            storedEvent.id,

          type:
            storedEvent.type,

          title:
            storedEvent.title,

          notes:
            storedEvent.notes,

          start:
            newStart,

          end:
            newEnd,

          recurrence:
            null
        });


      if (
        !result
      ) {

        setStatus(
          'Move cancelled.'
        );

        return;

      }


      await loadWeek();

    } catch (err) {

      handleError(
        err
      );

    }

  }


  function handleEmptyDoubleClick(
    event,
    column
  ) {

    if (
      event.target.closest(
        '.event-card'
      )
    ) {

      return;

    }


    const rect =
      column.getBoundingClientRect();


    const y =
      Math.max(
        0,
        Math.min(
          rect.height,
          event.clientY -
          rect.top
        )
      );


    const startHour =
      Number(
        state.config.dayStart ??
        8
      );


    const startMinuteOfDay =
      startHour *
      60 +
      Math.round(
        (
          y /
          64
        ) *
        60
      );


    const start =
      dateAndMinutesToLocalDateTime(
        column.dataset.date,
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
      end
    });

  }


  /*
    ADMIN LOGIN
  */

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
          method:
            'POST'
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

    closeBlockedSessions();


    state.isAdmin =
      false;


    state.adminPassword =
      '';


    loadWeek();

  }


  /*
    RECURRENCE FORM
  */

  function getSelectedWeekdays() {

    return [
      ...document.querySelectorAll(
        '.weekday-btn.selected'
      )
    ]
      .map(
        (button) =>
          Number(
            button.dataset.day
          )
      )
      .sort(
        (a, b) =>
          a -
          b
      );

  }


  function setSelectedWeekdays(
    days
  ) {

    const selected =
      new Set(
        (
          days ||
          []
        ).map(
          Number
        )
      );


    document
      .querySelectorAll(
        '.weekday-btn'
      )
      .forEach(
        (button) => {

          button.classList.toggle(
            'selected',
            selected.has(
              Number(
                button.dataset.day
              )
            )
          );

        }
      );

  }


  function getStartWeekday() {

    const key =
      localDateTimeToMinuteKey(
        $('eventStart').value
      );


    if (
      key ==
      null
    ) {

      return new Date().getDay();

    }


    return new Date(
      key *
      60000
    ).getUTCDay();

  }


  function selectStartWeekday() {

    setSelectedWeekdays([
      getStartWeekday()
    ]);

  }


  function getRepeatEndType() {

    return (
      document.querySelector(
        'input[name="repeatEndType"]:checked'
      )?.value ||
      'NEVER'
    );

  }


  function setRepeatEndType(
    type
  ) {

    const radio =
      document.querySelector(
        `input[name="repeatEndType"][value="${type}"]`
      );


    if (
      radio
    ) {

      radio.checked =
        true;

    }

  }


  function updateRecurrenceUI() {

    const weekly =
      $('repeatType').value ===
      'WEEKLY';


    $('recurrencePanel')
      .classList
      .toggle(
        'hidden',
        !weekly
      );


    if (
      !weekly
    ) {

      return;

    }


    const endType =
      getRepeatEndType();


    $('repeatEndDate').disabled =
      endType !==
      'ON';


    $('repeatCount').disabled =
      endType !==
      'COUNT';

  }


  function getRecurrenceFromForm() {

    if (
      $('repeatType').value ===
      'NONE'
    ) {

      return null;

    }


    const weekdays =
      getSelectedWeekdays();


    if (
      !weekdays.length
    ) {

      throw new Error(
        'Select at least one day of the week.'
      );

    }


    const interval =
      Number(
        $('repeatInterval').value
      );


    if (
      !Number.isInteger(
        interval
      ) ||
      interval < 1 ||
      interval > 52
    ) {

      throw new Error(
        'Repeat interval must be between 1 and 52 weeks.'
      );

    }


    const endType =
      getRepeatEndType();


    const recurrence = {
      frequency:
        'WEEKLY',

      interval,

      weekdays,

      endType
    };


    if (
      endType ===
      'ON'
    ) {

      if (
        !$('repeatEndDate').value
      ) {

        throw new Error(
          'Choose the date when the recurring event should end.'
        );

      }


      recurrence.until =
        $('repeatEndDate').value;

    }


    if (
      endType ===
      'COUNT'
    ) {

      const count =
        Number(
          $('repeatCount').value
        );


      if (
        !Number.isInteger(
          count
        ) ||
        count < 1 ||
        count > 999
      ) {

        throw new Error(
          'Occurrences must be between 1 and 999.'
        );

      }


      recurrence.count =
        count;

    }


    return recurrence;

  }


  /*
    EVENT EDITOR
  */

  function openEventModal(
    event
  ) {

    if (
      !state.isAdmin
    ) {

      return;

    }


    const isEdit =
      Boolean(
        event &&
        event.id
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


    const originalStart =
      (
        event &&
        (
          event.seriesStart ||
          event.start
        )
      ) ||
      defaultStart;


    const originalEnd =
      (
        event &&
        (
          event.seriesEnd ||
          event.end
        )
      ) ||
      defaultEnd;


    $('eventModalTitle').textContent =
      isEdit
        ? (
            event.recurrence
              ? 'Edit recurring event'
              : 'Edit time'
          )
        : 'Add time';


    $('eventId').value =
      isEdit
        ? (
            event.masterId ||
            event.id
          )
        : '';


    $('eventType').value =
      (
        event &&
        event.type
      ) ||
      'AVAILABLE';


    $('eventStart').value =
      originalStart;


    $('eventEnd').value =
      originalEnd;


    $('eventTitle').value =
      (
        event &&
        event.title
      ) ||
      '';


    $('eventNotes').value =
      (
        event &&
        event.notes
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


    const recurrence =
      event?.recurrence ||
      null;


    if (
      recurrence?.frequency ===
      'WEEKLY'
    ) {

      $('repeatType').value =
        'WEEKLY';


      $('repeatInterval').value =
        recurrence.interval ||
        1;


      setSelectedWeekdays(
        recurrence.weekdays ||
        []
      );


      setRepeatEndType(
        recurrence.endType ||
        'NEVER'
      );


      $('repeatEndDate').value =
        recurrence.until ||
        '';


      $('repeatCount').value =
        recurrence.count ||
        10;

    } else {

      $('repeatType').value =
        'NONE';


      $('repeatInterval').value =
        1;


      setSelectedWeekdays([
        getStartWeekday()
      ]);


      setRepeatEndType(
        'NEVER'
      );


      $('repeatEndDate').value =
        '';


      $('repeatCount').value =
        10;

    }


    updateRecurrenceUI();


    openModal(
      'eventModal'
    );

  }


  /*
    SAVE WITH CONFLICT WARNING
  */

  async function saveEventWithConflictCheck(
    event
  ) {

    try {

      return await api(
        '/events',
        {
          method:
            'POST',

          body:
            JSON.stringify(
              event
            )
        }
      );

    } catch (err) {

      if (
        err.status ===
          409 &&
        err.data?.code ===
          'BLOCKED_CONFLICT'
      ) {

        const proceed =
          window.confirm(
            buildConflictWarning(
              err.data
            )
          );


        if (
          !proceed
        ) {

          return null;

        }


        return await api(
          '/events',
          {
            method:
              'POST',

            body:
              JSON.stringify({
                ...event,

                forceConflict:
                  true
              })
          }
        );

      }


      throw err;

    }

  }


  function buildConflictWarning(
    data
  ) {

    const conflicts =
      data.conflicts ||
      [];


    const total =
      data.totalConflicts ||
      conflicts.length;


    let message =
      'Schedule conflict\n\n';


    message +=
      `This event overlaps with ${
        total === 1
          ? 'an existing blocked session'
          : `${total} existing blocked sessions`
      }:\n\n`;


    const shown =
      conflicts.slice(
        0,
        6
      );


    shown.forEach(
      (conflict) => {

        message +=
          `${
            conflict.title ||
            'Blocked Session'
          }\n`;


        message +=
          `${formatBlockedEventRange(
            conflict.start,
            conflict.end
          )}\n\n`;

      }
    );


    if (
      total >
      shown.length
    ) {

      message +=
        `...and ${
          total -
          shown.length
        } more conflict(s).\n\n`;

    }


    message +=
      'Are you sure you want to save this event anyway?';


    return message;

  }


  async function saveEventFromModal() {

    /*
      Clear any previous error message.
    */
    $('eventError').textContent = '';


    const type =
      $('eventType').value;


    const title =
      $('eventTitle').value.trim();


    /*
      Require session type.
    */
    if (!type) {

      $('eventError').textContent =
        'Please select a session type before saving.';

      $('eventType').focus();

      return;

    }


    /*
      Require title.
    */
    if (!title) {

      $('eventError').textContent =
        'Please enter a title for this event before saving.';

      $('eventTitle').focus();

      return;

    }


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
        'Please enter a valid start and end date/time.';

      return;

    }


    if (
      endKey <= startKey
    ) {

      $('eventError').textContent =
        'The end date/time must be after the start date/time.';

      return;

    }


    let recurrence;


    try {

      recurrence =
        getRecurrenceFromForm();

    } catch (err) {

      $('eventError').textContent =
        err.message;

      return;

    }


    const event = {

      id:
        $('eventId').value,

      type,

      start,

      end,

      title,

      notes:
        $('eventNotes').value,

      recurrence

    };


    $('saveEventBtn').disabled =
      true;


    try {

      const result =
        await saveEventWithConflictCheck(
          event
        );


      if (!result) {

        return;

      }


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
      !id
    ) {

      return;

    }


    const recurring =
      $('repeatType').value ===
      'WEEKLY';


    const message =
      recurring
        ? 'Delete this entire recurring series?'
        : 'Delete this event?';


    if (
      !confirm(
        message
      )
    ) {

      return;

    }


    $('deleteEventBtn').disabled =
      true;


    try {

      await api(
        '/events/' +
        encodeURIComponent(
          id
        ),
        {
          method:
            'DELETE'
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


  /*
    DATE DISPLAY
  */

  function formatBlockedEventRange(
    start,
    end
  ) {

    const startKey =
      localDateTimeToMinuteKey(
        start
      );


    const endKey =
      localDateTimeToMinuteKey(
        end
      );


    const startDate =
      new Date(
        startKey *
        60000
      );


    const endDate =
      new Date(
        endKey *
        60000
      );


    const sameDay =
      start.slice(
        0,
        10
      ) ===
      end.slice(
        0,
        10
      );


    const dateText =
      startDate.toLocaleDateString(
        undefined,
        {
          timeZone:
            'UTC',

          weekday:
            'short',

          month:
            'short',

          day:
            'numeric',

          year:
            'numeric'
        }
      );


    const startTime =
      startDate.toLocaleTimeString(
        undefined,
        {
          timeZone:
            'UTC',

          hour:
            'numeric',

          minute:
            '2-digit'
        }
      );


    const endTime =
      endDate.toLocaleTimeString(
        undefined,
        {
          timeZone:
            'UTC',

          hour:
            'numeric',

          minute:
            '2-digit'
        }
      );


    if (
      sameDay
    ) {

      return (
        `${dateText} · ` +
        `${startTime} – ${endTime}`
      );

    }


    const endDateText =
      endDate.toLocaleDateString(
        undefined,
        {
          timeZone:
            'UTC',

          weekday:
            'short',

          month:
            'short',

          day:
            'numeric',

          year:
            'numeric'
        }
      );


    return (
      `${dateText} ${startTime} – ` +
      `${endDateText} ${endTime}`
    );

  }


  /*
    Gets current wall-clock time
    in the portal timezone.
  */

  function getPortalNowMinuteKey() {

    const timezone =
      state.config.timezoneId ||
      'America/Los_Angeles';


    const formatter =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone:
            timezone,

          year:
            'numeric',

          month:
            '2-digit',

          day:
            '2-digit',

          hour:
            '2-digit',

          minute:
            '2-digit',

          hourCycle:
            'h23'
        }
      );


    const parts =
      formatter.formatToParts(
        new Date()
      );


    const values = {};


    for (
      const part of parts
    ) {

      if (
        part.type !==
        'literal'
      ) {

        values[
          part.type
        ] =
          part.value;

      }

    }


    return localDateTimeToMinuteKey(
      `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
    );

  }


  /*
    MODALS
  */

  function openModal(
    id
  ) {

    $(id)
      .classList
      .remove(
        'hidden'
      );

  }


  function closeModal(
    id
  ) {

    $(id)
      .classList
      .add(
        'hidden'
      );

  }


  /*
    STATUS
  */

  function setStatus(
    text
  ) {

    $('status').textContent =
      text ||
      '';

  }


  function handleError(
    err
  ) {

    setStatus(
      err.message ||
      String(err)
    );

  }


  /*
    DATE UTILITIES
  */

  function startOfWeek(
    date
  ) {

    const result =
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );


    result.setDate(
      result.getDate() -
      result.getDay()
    );


    return result;

  }


  function addDays(
    date,
    amount
  ) {

    const result =
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );


    result.setDate(
      result.getDate() +
      amount
    );


    return result;

  }


  function formatDate(
    date
  ) {

    return (
      `${date.getFullYear()}-` +
      `${String(
        date.getMonth() +
        1
      ).padStart(
        2,
        '0'
      )}-` +
      `${String(
        date.getDate()
      ).padStart(
        2,
        '0'
      )}`
    );

  }


  function formatMinutes(
    minutes
  ) {

    const normalized =
      (
        (
          minutes %
          1440
        ) +
        1440
      ) %
      1440;


    const hour24 =
      Math.floor(
        normalized /
        60
      );


    const minute =
      normalized %
      60;


    const suffix =
      hour24 >= 12
        ? 'PM'
        : 'AM';


    const hour =
      hour24 %
      12 ||
      12;


    return (
      hour +
      (
        minute
          ? ':' +
            String(
              minute
            ).padStart(
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
          value ||
          ''
        );


    if (
      !match
    ) {

      return null;

    }


    const year =
      Number(
        match[1]
      );


    const month =
      Number(
        match[2]
      );


    const day =
      Number(
        match[3]
      );


    const hour =
      Number(
        match[4]
      );


    const minute =
      Number(
        match[5]
      );


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
        month -
        1,
        day,
        hour,
        minute
      );


    const check =
      new Date(
        ms
      );


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

    const date =
      new Date(
        key *
        60000
      );


    return (
      `${date.getUTCFullYear()}-` +
      `${String(
        date.getUTCMonth() +
        1
      ).padStart(
        2,
        '0'
      )}-` +
      `${String(
        date.getUTCDate()
      ).padStart(
        2,
        '0'
      )}T` +
      `${String(
        date.getUTCHours()
      ).padStart(
        2,
        '0'
      )}:` +
      `${String(
        date.getUTCMinutes()
      ).padStart(
        2,
        '0'
      )}`
    );

  }


  function dateAndMinutesToLocalDateTime(
    dateStr,
    minutes
  ) {

    const start =
      localDateTimeToMinuteKey(
        dateStr +
        'T00:00'
      );


    return minuteKeyToLocalDateTime(
      start +
      minutes
    );

  }


  function formatUpdated(
    iso
  ) {

    const date =
      new Date(
        iso
      );


    return Number.isNaN(
      date.getTime()
    )
      ? iso
      : date.toLocaleString(
          undefined,
          {
            month:
              'short',

            day:
              'numeric',

            hour:
              'numeric',

            minute:
              '2-digit'
          }
        );

  }


  init();

})();