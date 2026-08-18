(() => {

  const state = {

    weekStart:
      startOfWeek(
        new Date()
      ),

    adminPassword:
      '',

    isAdmin:
      false,

    events:
      [],

    config: {

      portalTitle:
        "Ethan's Tutoring Availability",

      timezoneLabel:
        'Pacific Time (PT)',

      timezoneId:
        'America/Los_Angeles',

      dayStart:
        8,

      dayEnd:
        24
    },

    draggingId:
      null,

    pendingConflictEvent:
      null,

    /*
      Timestamp of the last public
      revalidation, used to rate limit
      the refresh below.
    */
    lastRefresh:
      0,

    /*
      Quarter-hour mark the loaded data was
      clipped to, so a stale page can be
      recognised without asking the server.
    */
    quarterMark:
      currentQuarterMark(),

    /*
      Public schedule by date, so retyping
      a time does not refetch the day it
      falls on.
    */
    scheduleByDate:
      new Map(),

    /*
      Set while the editor holds an accepted
      request, so saving can clear it from
      the queue and cancelling cannot.
    */
    acceptedRequestId:
      null
  };


  /*
    Public pages revalidate at most this
    often. The server tags the public
    response for the CDN and a write
    purges that tag, so refreshing faster
    than this does not make the page
    fresher, it only spends function
    invocations.

    The one exception is the quarter-hour
    mark the schedule is clipped to. When
    that moves, the page really is showing
    times that have passed, so the check
    below overrides this limit.
  */

  const REFRESH_INTERVAL_MS =
    5 * 60 * 1000;

  const $ =
    (id) =>
      document.getElementById(
        id
      );

  const calendar =
    $('calendar');


  const agenda =
    $('agenda');



  /* =========================================================
     INITIALIZATION
  ========================================================= */


  function init() {

    bindButtons();

    loadWeek();


    /*
      Check often, act rarely. The
      guard inside maybeRefresh is what
      actually decides.
    */

    setInterval(
      maybeRefresh,
      60000
    );


    /*
      Coming back to the tab is the
      moment a stale page is actually
      noticed, so revalidate then too.
    */

    document.addEventListener(
      'visibilitychange',
      maybeRefresh
    );

  }


  function maybeRefresh() {

    if (
      state.isAdmin
    ) {

      return;

    }


    if (
      document.visibilityState !==
      'visible'
    ) {

      return;

    }


    const mark =
      currentQuarterMark();


    if (
      mark ===
      state.quarterMark &&
      Date.now() -
      state.lastRefresh <
      REFRESH_INTERVAL_MS
    ) {

      return;

    }


    state.quarterMark =
      mark;


    state.lastRefresh =
      Date.now();


    loadWeek(
      true
    );

  }


  /*
    The public schedule is clipped to the
    next quarter-hour mark, so that mark is
    what decides whether the page is still
    accurate. Reading it from the clock
    rather than from the response lets an
    open tab notice it has gone stale
    without spending a request to find out.
  */

  function currentQuarterMark() {

    return Math.floor(
      Date.now() /
      (
        15 *
        60 *
        1000
      )
    );

  }



  /* =========================================================
     EVENT LISTENERS
  ========================================================= */


  function bindButtons() {

    $('prevWeekBtn')
      .addEventListener(
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


    $('nextWeekBtn')
      .addEventListener(
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


    $('todayBtn')
      .addEventListener(
        'click',
        () => {

          state.weekStart =
            startOfWeek(
              new Date()
            );

          loadWeek();

        }
      );


    $('refreshBtn')
      .addEventListener(
        'click',
        () =>
          loadWeek()
      );


    $('adminBtn')
      .addEventListener(
        'click',
        openAdminLogin
      );


    $('exitAdminBtn')
      .addEventListener(
        'click',
        exitAdmin
      );


    $('addBtn')
      .addEventListener(
        'click',
        () =>
          openEventModal()
      );


    $('blockedSessionsBtn')
      .addEventListener(
        'click',
        openBlockedSessions
      );


    $('requestBtn')
      .addEventListener(
        'click',
        openRequestModal
      );


    $('requestsBtn')
      .addEventListener(
        'click',
        openRequestDrawer
      );


    $('closeRequestDrawerBtn')
      .addEventListener(
        'click',
        closeRequestDrawer
      );


    $('requestDrawerBackdrop')
      .addEventListener(
        'click',
        (event) => {

          if (
            event.target ===
            $('requestDrawerBackdrop')
          ) {

            closeRequestDrawer();

          }

        }
      );


    $('sendRequestBtn')
      .addEventListener(
        'click',
        () =>
          sendRequest(
            false
          )
      );


    $('sendRequestAnywayBtn')
      .addEventListener(
        'click',
        () =>
          sendRequest(
            true
          )
      );


    /*
      Re-check as the times change, so the
      warning appears while it can still be
      acted on rather than after sending.
    */

    [
      'requestStart',
      'requestEnd'
    ]
      .forEach(
        (id) => {

          $(id)
            .addEventListener(
              'change',
              checkRequestedTime
            );

        }
      );


    $('closeBlockedDrawerBtn')
      .addEventListener(
        'click',
        closeBlockedSessions
      );


    $('blockedDrawerBackdrop')
      .addEventListener(
        'click',
        (event) => {

          if (
            event.target ===
            $('blockedDrawerBackdrop')
          ) {

            closeBlockedSessions();

          }

        }
      );


    $('loginSubmitBtn')
      .addEventListener(
        'click',
        submitAdminLogin
      );


    $('adminPasswordInput')
      .addEventListener(
        'keydown',
        (event) => {

          if (
            event.key ===
            'Enter'
          ) {

            submitAdminLogin();

          }

        }
      );


    $('saveEventBtn')
      .addEventListener(
        'click',
        saveEventFromModal
      );


    $('saveAnywayBtn')
      .addEventListener(
        'click',
        saveAnywayFromConflict
      );


    $('deleteEventBtn')
      .addEventListener(
        'click',
        deleteEventFromModal
      );


    /*
      Recurrence type.
    */

    $('repeatType')
      .addEventListener(
        'change',
        () => {

          if (
            $('repeatType').value ===
              'WEEKLY' &&
            getSelectedWeekdays()
              .length === 0
          ) {

            selectStartWeekday();

          }


          updateRecurrenceUI();

          clearConflictWarning();

        }
      );


    /*
      Weekday selection.
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

              button
                .classList
                .toggle(
                  'selected'
                );

              clearConflictWarning();

            }
          );

        }
      );


    /*
      Recurrence end options.
    */

    document
      .querySelectorAll(
        'input[name="repeatEndType"]'
      )
      .forEach(
        (radio) => {

          radio.addEventListener(
            'change',
            () => {

              updateRecurrenceUI();

              clearConflictWarning();

            }
          );

        }
      );


    $('eventStart')
      .addEventListener(
        'change',
        () => {

          if (
            $('repeatType').value ===
              'WEEKLY' &&
            getSelectedWeekdays()
              .length === 0
          ) {

            selectStartWeekday();

          }

        }
      );


    /*
      Any edit invalidates an old
      conflict warning.
    */

    [
      'eventType',
      'eventStart',
      'eventEnd',
      'eventTitle',
      'eventNotes',
      'repeatInterval',
      'repeatEndDate',
      'repeatCount'
    ]
      .forEach(
        (id) => {

          $(id)
            .addEventListener(
              'input',
              clearConflictWarning
            );


          $(id)
            .addEventListener(
              'change',
              clearConflictWarning
            );

        }
      );


    /*
      Standard modal close buttons.
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
      Click outside modal.
    */

    document
      .querySelectorAll(
        '.modal-backdrop'
      )
      .forEach(
        (backdrop) => {

          backdrop.addEventListener(
            'click',
            (event) => {

              if (
                event.target ===
                backdrop
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



  /* =========================================================
     API
  ========================================================= */


  async function api(
    path,
    options = {}
  ) {

    const headers =
      new Headers(
        options.headers ||
        {}
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
        '/api' +
        path,
        {
          ...options,

          headers,

          cache:
            'no-store'
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



  /* =========================================================
     LOAD WEEK
  ========================================================= */


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
        data.events ||
        [];


      state.config =
        data.config ||
        state.config;


      state.isAdmin =
        data.mode ===
        'admin';


      applyMode();

      renderAll();


      $('portalTitle')
        .textContent =
          state.config
            .portalTitle;


      document.title =
        state.config
          .portalTitle;


      $('timezoneLabel')
        .textContent =
          state.config
            .timezoneLabel;


      $('updatedLabel')
        .textContent =
          data.lastUpdated
            ? 'Updated ' +
              formatUpdated(
                data.lastUpdated
              )
            : 'No saved times yet';


      if (
        !silent
      ) {

        setStatus(
          ''
        );

      }

    } catch (error) {

      if (
        !silent
      ) {

        handleError(
          error
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


    $('requestsBtn')
      .classList
      .toggle(
        'hidden',
        !state.isAdmin
      );


    refreshRequestCount();


    $('adminBtn')
      .classList
      .toggle(
        'hidden',
        state.isAdmin
      );


    $('requestBtn')
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


    $('weekLabel')
      .textContent =
        state.weekStart
          .toLocaleDateString(
            undefined,
            {
              month:
                'short',

              day:
                'numeric'
            }
          ) +
        ' – ' +
        end.toLocaleDateString(
          undefined,
          {
            month:
              'short',

            day:
              'numeric',

            year:
              'numeric'
          }
        );

  }



  /* =========================================================
     ADMIN DISPLAY CALCULATION
  ========================================================= */


  function getDisplayEvents() {

    if (
      !state.isAdmin
    ) {

      return state.events;

    }


    const availability =
      state.events
        .filter(
          (event) =>
            event.type ===
            'AVAILABLE'
        );


    const blocked =
      state.events
        .filter(
          (event) =>
            event.type ===
            'BLOCKED'
        );


    /*
      Blocked events are always
      displayed in admin mode.
    */

    const displayEvents =
      blocked.map(
        (event) => ({
          ...event
        })
      );


    /*
      Split availability around
      blocked sessions.
    */

    for (
      const available of
      availability
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
        const block of
        blocked
      ) {

        const blockStart =
          localDateTimeToMinuteKey(
            block.start
          );


        const blockEnd =
          localDateTimeToMinuteKey(
            block.end
          );


        const nextPieces =
          [];


        for (
          const [
            start,
            end
          ] of pieces
        ) {

          /*
            No overlap.
          */

          if (
            blockEnd <=
              start ||
            blockStart >=
              end
          ) {

            nextPieces.push(
              [
                start,
                end
              ]
            );

            continue;

          }


          /*
            Portion before block.
          */

          if (
            blockStart >
            start
          ) {

            nextPieces.push([
              start,

              Math.min(
                blockStart,
                end
              )
            ]);

          }


          /*
            Portion after block.
          */

          if (
            blockEnd <
            end
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


    return displayEvents
      .sort(
        (a, b) =>
          localDateTimeToMinuteKey(
            a.start
          ) -
          localDateTimeToMinuteKey(
            b.start
          )
      );

  }



  /* =========================================================
     CALENDAR
  ========================================================= */


  function renderCalendar() {

    const startHour =
      Number(
        state.config
          .dayStart ??
        8
      );


    const endHour =
      Number(
        state.config
          .dayEnd ??
        24
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


    /*
      Top-left corner.
    */

    const corner =
      document.createElement(
        'div'
      );


    corner.className =
      'corner';


    calendar.appendChild(
      corner
    );


    /*
      Day headers.
    */

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
          formatDate(
            date
          ) ===
          today
            ? ' today'
            : ''
        );


      head.innerHTML =
        `<div class="dow">${
          date.toLocaleDateString(
            undefined,
            {
              weekday:
                'short'
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


    /*
      Time labels.
    */

    const timeColumn =
      document.createElement(
        'div'
      );


    timeColumn.className =
      'time-column';


    timeColumn.style.height =
      totalHeight +
      'px';


    for (
      let hour =
        startHour;
      hour <=
        endHour;
      hour++
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
            hour -
            startHour
          ) *
          64
        ) +
        'px';


      label.textContent =
        formatMinutes(
          hour *
          60
        );


      timeColumn.appendChild(
        label
      );

    }


    calendar.appendChild(
      timeColumn
    );


    /*
      Day columns.
    */

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
          (event) => {

            event.preventDefault();

            column
              .classList
              .add(
                'drag-over'
              );

          }
        );


        column.addEventListener(
          'dragleave',
          () => {

            column
              .classList
              .remove(
                'drag-over'
              );

          }
        );


        column.addEventListener(
          'drop',
          (event) => {

            handleDrop(
              event,
              column
            );

          }
        );


        column.addEventListener(
          'dblclick',
          (event) => {

            handleEmptyDoubleClick(
              event,
              column
            );

          }
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
      segmentEndMin <=
        visibleStart ||
      segmentStartMin >=
        visibleEnd
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
        event.type ===
        'BLOCKED'
          ? 'blocked'
          : 'available'
      ) +
      (
        state.isAdmin
          ? ' admin'
          : ''
      ) +
      (
        height <
        40
          ? ' compact'
          : ''
      );


    card.style.top =
      top +
      'px';


    card.style.height =
      height +
      'px';


    /*
      Public users never see
      private blocked titles.
    */

    const title =
      state.isAdmin
        ? (
            event.title ||
            (
              event.type ===
              'BLOCKED'
                ? 'Blocked Session'
                : 'Available'
            )
          )
        : (
            event.type ===
            'BLOCKED'
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
      formatMinuteRange(
        segmentStartMin,
        segmentEndMin
      );


    card.append(
      titleElement,
      timeElement
    );


    /*
      Admin interaction.
    */

    if (
      state.isAdmin
    ) {

      const original =
        getOriginalEvent(
          event
        );


      const recurring =
        Boolean(
          original
            ?.recurrence
        );


      /*
        Only one-time events can
        be dragged.
      */

      if (
        !recurring
      ) {

        card.draggable =
          true;


        card.addEventListener(
          'dragstart',
          (dragEvent) => {

            state.draggingId =
              original.id;


            dragEvent
              .dataTransfer
              .effectAllowed =
                'move';


            dragEvent
              .dataTransfer
              .setData(
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
                (element) => {

                  element
                    .classList
                    .remove(
                      'drag-over'
                    );

                }
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
          ) ===
          id
      );


    return match ||
      event;

  }



  /* =========================================================
     MOBILE AGENDA
  ========================================================= */


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
            weekday:
              'long',

            month:
              'short',

            day:
              'numeric'
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
                event.type ===
                'BLOCKED'
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
                      event.type ===
                      'BLOCKED'
                        ? 'Blocked Session'
                        : 'Available'
                    )
                  )
                : (
                    event.type ===
                    'BLOCKED'
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
              event.type ===
              'BLOCKED'
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



  /* =========================================================
     BLOCKED SESSION DRAWER
  ========================================================= */


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


    $('blockedListStatus')
      .textContent =
        'Loading blocked sessions…';


    $('pastBlockedList')
      .innerHTML =
        '';


    $('upcomingBlockedList')
      .innerHTML =
        '';


    try {

      const nowKey =
        getPortalNowMinuteKey();


      /*
        One year backward and
        one year forward.
      */

      const startDate =
        minuteKeyToLocalDateTime(
          nowKey -
          365 *
          1440
        )
          .slice(
            0,
            10
          );


      const endDate =
        minuteKeyToLocalDateTime(
          nowKey +
          365 *
          1440
        )
          .slice(
            0,
            10
          );


      const data =
        await api(
          `/events?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`
        );


      if (
        data.mode !==
        'admin'
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
        Past:
        event has ended.

        Current event:
        stays under Upcoming.
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


      $('pastBlockedCount')
        .textContent =
          past.length;


      $('upcomingBlockedCount')
        .textContent =
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


      $('blockedListStatus')
        .textContent =
          '';

    } catch (error) {

      $('blockedListStatus')
        .textContent =
          error.message;

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
      const event of
      events
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
        startKey <=
          nowKey &&
        endKey >
          nowKey;


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



  /* =========================================================
     DRAGGING
  ========================================================= */


  async function handleDrop(
    event,
    column
  ) {

    event.preventDefault();


    column
      .classList
      .remove(
        'drag-over'
      );


    const id =
      event
        .dataTransfer
        .getData(
          'text/plain'
        ) ||
      state.draggingId;


    const storedEvent =
      state.events.find(
        (item) =>
          (
            item.masterId ||
            item.id
          ) ===
          id
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
      column
        .getBoundingClientRect();


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
        state.config
          .dayStart ??
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


    const movedEvent = {

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

    };


    try {

      setStatus(
        'Saving moved event…'
      );


      await api(
        '/events',
        {
          method:
            'POST',

          body:
            JSON.stringify(
              movedEvent
            )
        }
      );


      await loadWeek();

    } catch (error) {

      /*
        Conflict while dragging.

        Open the editor with the new
        proposed time and show the
        warning there.
      */

      if (
        error.status ===
          409 &&
        error.data?.code ===
          'BLOCKED_CONFLICT'
      ) {

        openEventModal(
          movedEvent
        );


        showConflictWarning(
          error.data,
          movedEvent
        );


        setStatus(
          'Move not saved yet because of a schedule conflict.'
        );


        return;

      }


      handleError(
        error
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
      column
        .getBoundingClientRect();


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
        state.config
          .dayStart ??
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


    /*
      Do not automatically assign
      Available.

      Type begins as Select One.
    */

    openEventModal({
      start,
      end
    });

  }



  /* =========================================================
     ADMIN LOGIN
  ========================================================= */


  /* =========================================================
     SESSION REQUESTS (PUBLIC)
  ========================================================= */


  function openRequestModal() {

    /*
      Default to the next quarter-hour mark
      the schedule is advertised from, so the
      form opens on a time that could
      actually be requested.
    */

    const start =
      roundUpToQuarterMinuteKey(
        getPortalNowMinuteKey()
      );


    $('requestName')
      .value =
        '';


    $('requestSubject')
      .value =
        '';


    $('requestFormat')
      .value =
        '';


    $('requestRepeat')
      .value =
        'NONE';


    $('requestStart')
      .value =
        minuteKeyToLocalDateTime(
          start
        );


    $('requestEnd')
      .value =
        minuteKeyToLocalDateTime(
          start +
          60
        );


    $('requestError')
      .textContent =
        '';


    clearRequestWarning();


    openModal(
      'requestModal'
    );

  }



  function roundUpToQuarterMinuteKey(
    minuteKey
  ) {

    return Math.ceil(
      minuteKey /
      15
    ) *
    15;

  }



  function clearRequestWarning() {

    $('requestWarning')
      .classList
      .add(
        'hidden'
      );


    $('requestWarningSummary')
      .textContent =
        '';


    $('requestWarningList')
      .innerHTML =
        '';


    $('sendRequestAnywayBtn')
      .classList
      .add(
        'hidden'
      );


    $('sendRequestBtn')
      .classList
      .remove(
        'hidden'
      );

  }



  /*
    The public payload already describes a
    day the way a visitor sees it: merged
    availability and anonymised blocked
    sessions. Checking against it needs no
    new endpoint, and the answer always
    matches what the calendar shows.
  */

  async function getScheduleForDate(
    date
  ) {

    if (
      state.scheduleByDate
        .has(
          date
        )
    ) {

      return state.scheduleByDate
        .get(
          date
        );

    }


    const data =
      await api(
        '/events?start=' +
        encodeURIComponent(
          date
        ) +
        '&end=' +
        encodeURIComponent(
          date
        )
      );


    const events =
      data.events ||
      [];


    state.scheduleByDate
      .set(
        date,
        events
      );


    return events;

  }



  async function checkRequestedTime() {

    const startValue =
      $('requestStart')
        .value;


    const endValue =
      $('requestEnd')
        .value;


    const startKey =
      localDateTimeToMinuteKey(
        startValue
      );


    const endKey =
      localDateTimeToMinuteKey(
        endValue
      );


    if (
      startKey ===
        null ||
      endKey ===
        null ||
      endKey <=
        startKey
    ) {

      clearRequestWarning();

      return;

    }


    let events;


    try {

      events =
        await getScheduleForDate(
          startValue
            .slice(
              0,
              10
            )
        );

    } catch {

      /*
        A failed lookup should not stop
        someone asking. The tutor reviews
        every request anyway.
      */

      clearRequestWarning();

      return;

    }


    const overlapping =
      events
        .filter(
          (event) =>
            event.type ===
            'BLOCKED'
        )
        .filter(
          (event) =>
            localDateTimeToMinuteKey(
              event.start
            ) <
            endKey &&
            localDateTimeToMinuteKey(
              event.end
            ) >
            startKey
        );


    if (
      overlapping.length
    ) {

      showRequestWarning(
        'Schedule conflict',

        overlapping.length ===
        1
          ? 'That time overlaps a session the tutor has already blocked out.'
          : 'That time overlaps ' +
            overlapping.length +
            ' sessions the tutor has already blocked out.',

        overlapping.map(
          (event) => ({
            title:
              'Blocked Session',

            start:
              event.start,

            end:
              event.end
          })
        )
      );


      return;

    }


    const windows =
      events
        .filter(
          (event) =>
            event.type ===
            'AVAILABLE'
        );


    const covered =
      windows.some(
        (event) =>
          localDateTimeToMinuteKey(
            event.start
          ) <=
          startKey &&
          localDateTimeToMinuteKey(
            event.end
          ) >=
          endKey
      );


    if (
      !covered
    ) {

      showRequestWarning(
        'Outside available hours',

        windows.length
          ? 'The tutor has not marked that whole time as available.'
          : 'The tutor has no availability listed on that day.',

        windows.map(
          (event) => ({
            title:
              'Available',

            start:
              event.start,

            end:
              event.end
          })
        )
      );


      return;

    }


    clearRequestWarning();

  }



  function showRequestWarning(
    title,
    summary,
    items
  ) {

    $('requestWarningTitle')
      .textContent =
        title;


    $('requestWarningSummary')
      .textContent =
        summary;


    const list =
      $('requestWarningList');


    list.innerHTML =
      '';


    for (
      const item of
      items.slice(
        0,
        6
      )
    ) {

      const row =
        document.createElement(
          'div'
        );


      row.className =
        'conflict-item';


      const label =
        document.createElement(
          'div'
        );


      label.className =
        'conflict-item-title';


      label.textContent =
        item.title;


      const time =
        document.createElement(
          'div'
        );


      time.className =
        'conflict-item-time';


      time.textContent =
        formatBlockedEventRange(
          item.start,
          item.end
        );


      row.append(
        label,
        time
      );


      list.appendChild(
        row
      );

    }


    $('requestWarning')
      .classList
      .remove(
        'hidden'
      );


    $('sendRequestAnywayBtn')
      .classList
      .remove(
        'hidden'
      );


    $('sendRequestBtn')
      .classList
      .add(
        'hidden'
      );

  }



  async function sendRequest(
    force
  ) {

    $('requestError')
      .textContent =
        '';


    const name =
      $('requestName')
        .value
        .trim();


    if (
      !name
    ) {

      $('requestError')
        .textContent =
          'Please enter your name.';


      $('requestName')
        .focus();


      return;

    }


    const subject =
      $('requestSubject')
        .value
        .trim();


    if (
      !subject
    ) {

      $('requestError')
        .textContent =
          'Please enter the subject.';


      $('requestSubject')
        .focus();


      return;

    }


    const format =
      $('requestFormat')
        .value;


    if (
      !format
    ) {

      $('requestError')
        .textContent =
          'Please choose online or in person.';


      $('requestFormat')
        .focus();


      return;

    }


    const start =
      $('requestStart')
        .value;


    const end =
      $('requestEnd')
        .value;


    const startKey =
      localDateTimeToMinuteKey(
        start
      );


    const endKey =
      localDateTimeToMinuteKey(
        end
      );


    if (
      startKey ===
        null ||
      endKey ===
        null
    ) {

      $('requestError')
        .textContent =
          'Please choose a start and end time.';


      return;

    }


    if (
      endKey <=
      startKey
    ) {

      $('requestError')
        .textContent =
          'The end time must be after the start time.';


      return;

    }


    /*
      The warning is raised here rather than
      when the form opens, so it describes a
      time the visitor actually chose. Send
      Anyway is what gets past it.
    */

    if (
      !force
    ) {

      await checkRequestedTime();


      if (
        !$('requestWarning')
          .classList
          .contains(
            'hidden'
          )
      ) {

        return;

      }

    }


    $('sendRequestBtn')
      .disabled =
        true;


    $('sendRequestAnywayBtn')
      .disabled =
        true;


    try {

      await api(
        '/requests',
        {
          method:
            'POST',

          body:
            JSON.stringify({
              name,

              subject,

              format,

              repeat:
                $('requestRepeat')
                  .value,

              start,

              end
            })
        }
      );


      closeModal(
        'requestModal'
      );


      setStatus(
        'Request sent. The tutor will confirm it before it appears on the calendar.'
      );

    } catch (error) {

      $('requestError')
        .textContent =
          error.message;

    } finally {

      $('sendRequestBtn')
        .disabled =
          false;


      $('sendRequestAnywayBtn')
        .disabled =
          false;

    }

  }



  /* =========================================================
     SESSION REQUEST REVIEW (ADMIN)
  ========================================================= */


  /*
    A request is only removed once the event
    it became has actually been saved, so a
    cancelled review leaves it in the queue.
  */

  async function clearAcceptedRequest() {

    const id =
      state.acceptedRequestId;


    if (
      !id
    ) {

      return;

    }


    state.acceptedRequestId =
      null;


    try {

      await api(
        '/requests/' +
        encodeURIComponent(
          id
        ),
        {
          method:
            'DELETE'
        }
      );

    } catch {

      /*
        The event saved, which is the part
        that matters. A stale queue entry can
        be dismissed by hand.
      */

    }


    await refreshRequestCount();

  }


  async function refreshRequestCount() {

    if (
      !state.isAdmin
    ) {

      return;

    }


    try {

      const data =
        await api(
          '/requests'
        );


      const total =
        (
          data.requests ||
          []
        ).length;


      $('requestCount')
        .textContent =
          total;

    } catch {

      /*
        The badge is a convenience. A failed
        count should not interrupt admin work.
      */

    }

  }



  async function openRequestDrawer() {

    if (
      !state.isAdmin
    ) {

      return;

    }


    $('requestDrawerBackdrop')
      .classList
      .remove(
        'hidden'
      );


    $('requestListStatus')
      .textContent =
        'Loading requests…';


    $('requestList')
      .innerHTML =
        '';


    try {

      const data =
        await api(
          '/requests'
        );


      renderRequestList(
        data.requests ||
        []
      );

    } catch (error) {

      $('requestListStatus')
        .textContent =
          error.message;

    }

  }



  function closeRequestDrawer() {

    $('requestDrawerBackdrop')
      .classList
      .add(
        'hidden'
      );

  }



  function renderRequestList(
    requests
  ) {

    $('requestCount')
      .textContent =
        requests.length;


    $('requestListStatus')
      .textContent =
        requests.length
          ? 'Accepting opens the editor with the details filled in. Nothing is saved until you save it.'
          : '';


    const list =
      $('requestList');


    list.innerHTML =
      '';


    if (
      !requests.length
    ) {

      const empty =
        document.createElement(
          'div'
        );


      empty.className =
        'blocked-empty';


      empty.textContent =
        'No pending requests.';


      list.appendChild(
        empty
      );


      return;

    }


    for (
      const request of requests
    ) {

      const item =
        document.createElement(
          'div'
        );


      item.className =
        'blocked-session-item request-item';


      const title =
        document.createElement(
          'div'
        );


      title.className =
        'blocked-session-title';


      title.textContent =
        request.name;


      const time =
        document.createElement(
          'div'
        );


      time.className =
        'blocked-session-time';


      time.textContent =
        formatBlockedEventRange(
          request.start,
          request.end
        );


      const meta =
        document.createElement(
          'div'
        );


      meta.className =
        'blocked-session-meta';


      meta.textContent =
        describeRequest(
          request
        );


      const actions =
        document.createElement(
          'div'
        );


      actions.className =
        'request-item-actions';


      const accept =
        document.createElement(
          'button'
        );


      accept.className =
        'btn primary small';


      accept.textContent =
        'Accept';


      accept.addEventListener(
        'click',
        () =>
          acceptRequest(
            request
          )
      );


      const dismiss =
        document.createElement(
          'button'
        );


      dismiss.className =
        'btn danger small';


      dismiss.textContent =
        'Dismiss';


      dismiss.addEventListener(
        'click',
        () =>
          dismissRequest(
            request
          )
      );


      actions.append(
        accept,
        dismiss
      );


      item.append(
        title,
        time,
        meta,
        actions
      );


      list.appendChild(
        item
      );

    }

  }



  function describeRequest(
    request
  ) {

    return [
      request.subject,

      request.format ===
      'ONLINE'
        ? 'Online'
        : 'In person',

      request.repeat ===
      'WEEKLY'
        ? 'Weekly'
        : 'One time'
    ]
      .join(' · ');

  }



  /*
    Accepting does not save anything. It
    opens the editor with the request
    translated into an event so the tutor
    reviews it, and the request is only
    cleared once that event is saved.
  */

  function acceptRequest(
    request
  ) {

    const weekday =
      new Date(
        request.start
      )
        .getDay();


    closeRequestDrawer();


    openEventModal({

      type:
        'BLOCKED',

      title:
        request.name,

      notes:
        describeRequest(
          request
        ),

      start:
        request.start,

      end:
        request.end,

      recurrence:
        request.repeat ===
        'WEEKLY'
          ? {
              frequency:
                'WEEKLY',

              interval:
                1,

              weekdays: [
                weekday
              ],

              endType:
                'NEVER'
            }
          : null

    });


    state.acceptedRequestId =
      request.id;

  }



  async function dismissRequest(
    request
  ) {

    try {

      await api(
        '/requests/' +
        encodeURIComponent(
          request.id
        ),
        {
          method:
            'DELETE'
        }
      );


      await openRequestDrawer();

    } catch (error) {

      $('requestListStatus')
        .textContent =
          error.message;

    }

  }



  function openAdminLogin() {

    $('loginError')
      .textContent =
        '';


    $('adminPasswordInput')
      .value =
        '';


    openModal(
      'loginModal'
    );


    setTimeout(
      () => {

        $('adminPasswordInput')
          .focus();

      },
      50
    );

  }



  async function submitAdminLogin() {

    const password =
      $('adminPasswordInput')
        .value;


    $('loginError')
      .textContent =
        '';


    $('loginSubmitBtn')
      .disabled =
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

    } catch (error) {

      state.adminPassword =
        '';


      state.isAdmin =
        false;


      $('loginError')
        .textContent =
          error.message;

    } finally {

      $('loginSubmitBtn')
        .disabled =
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



  /* =========================================================
     RECURRENCE FORM
  ========================================================= */


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

          button
            .classList
            .toggle(
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
        $('eventStart')
          .value
      );


    if (
      key ==
      null
    ) {

      return new Date()
        .getDay();

    }


    return new Date(
      key *
      60000
    )
      .getUTCDay();

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
      $('repeatType')
        .value ===
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


    $('repeatEndDate')
      .disabled =
        endType !==
        'ON';


    $('repeatCount')
      .disabled =
        endType !==
        'COUNT';

  }



  function getRecurrenceFromForm() {

    if (
      $('repeatType')
        .value ===
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
        $('repeatInterval')
          .value
      );


    if (
      !Number.isInteger(
        interval
      ) ||
      interval <
        1 ||
      interval >
        52
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
        !$('repeatEndDate')
          .value
      ) {

        throw new Error(
          'Choose the date when the recurring event should end.'
        );

      }


      recurrence.until =
        $('repeatEndDate')
          .value;

    }


    if (
      endType ===
      'COUNT'
    ) {

      const count =
        Number(
          $('repeatCount')
            .value
        );


      if (
        !Number.isInteger(
          count
        ) ||
        count <
          1 ||
        count >
          999
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



  /* =========================================================
     EVENT MODAL
  ========================================================= */


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


    /*
      Opening the editor for anything else
      releases whatever request was being
      reviewed.
    */

    state.acceptedRequestId =
      null;


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


    $('eventModalTitle')
      .textContent =
        isEdit
          ? (
              event.recurrence
                ? 'Edit recurring event'
                : 'Edit time'
            )
          : 'Add time';


    $('eventId')
      .value =
        isEdit
          ? (
              event.masterId ||
              event.id
            )
          : '';


    /*
      New events intentionally
      begin with Select One.
    */

    $('eventType')
      .value =
        (
          event &&
          event.type
        ) ||
        '';


    $('eventStart')
      .value =
        originalStart;


    $('eventEnd')
      .value =
        originalEnd;


    $('eventTitle')
      .value =
        (
          event &&
          event.title
        ) ||
        '';


    $('eventNotes')
      .value =
        (
          event &&
          event.notes
        ) ||
        '';


    $('eventError')
      .textContent =
        '';


    clearConflictWarning();


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

      $('repeatType')
        .value =
          'WEEKLY';


      $('repeatInterval')
        .value =
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


      $('repeatEndDate')
        .value =
          recurrence.until ||
          '';


      $('repeatCount')
        .value =
          recurrence.count ||
          10;

    } else {

      $('repeatType')
        .value =
          'NONE';


      $('repeatInterval')
        .value =
          1;


      setSelectedWeekdays([
        getStartWeekday()
      ]);


      setRepeatEndType(
        'NEVER'
      );


      $('repeatEndDate')
        .value =
          '';


      $('repeatCount')
        .value =
          10;

    }


    updateRecurrenceUI();


    openModal(
      'eventModal'
    );

  }



  /* =========================================================
     INLINE CONFLICT WARNING
  ========================================================= */


  function clearConflictWarning() {

    state.pendingConflictEvent =
      null;


    $('conflictWarning')
      .classList
      .add(
        'hidden'
      );


    $('conflictWarningSummary')
      .textContent =
        '';


    $('conflictWarningList')
      .innerHTML =
        '';


    $('saveAnywayBtn')
      .classList
      .add(
        'hidden'
      );


    $('saveEventBtn')
      .classList
      .remove(
        'hidden'
      );

  }



  function showConflictWarning(
    data,
    event
  ) {

    state.pendingConflictEvent =
      event;


    const conflicts =
      data.conflicts ||
      [];


    const total =
      data.totalConflicts ||
      conflicts.length;


    $('eventError')
      .textContent =
        '';


    $('conflictWarningSummary')
      .textContent =
        total ===
        1
          ? 'This event overlaps with an existing blocked session.'
          : `This event overlaps with ${total} existing blocked sessions.`;


    const list =
      $('conflictWarningList');


    list.innerHTML =
      '';


    const shown =
      conflicts.slice(
        0,
        6
      );


    for (
      const conflict of
      shown
    ) {

      const item =
        document.createElement(
          'div'
        );


      item.className =
        'conflict-item';


      const title =
        document.createElement(
          'div'
        );


      title.className =
        'conflict-item-title';


      title.textContent =
        conflict.title ||
        'Blocked Session';


      const time =
        document.createElement(
          'div'
        );


      time.className =
        'conflict-item-time';


      time.textContent =
        formatBlockedEventRange(
          conflict.start,
          conflict.end
        );


      item.append(
        title,
        time
      );


      list.appendChild(
        item
      );

    }


    if (
      total >
      shown.length
    ) {

      const more =
        document.createElement(
          'div'
        );


      more.className =
        'conflict-more';


      const remaining =
        total -
        shown.length;


      more.textContent =
        `And ${remaining} more conflict${
          remaining ===
          1
            ? ''
            : 's'
        }.`;


      list.appendChild(
        more
      );

    }


    $('conflictWarning')
      .classList
      .remove(
        'hidden'
      );


    /*
      Replace normal Save button
      with Save Anyway.
    */

    $('saveEventBtn')
      .classList
      .add(
        'hidden'
      );


    $('saveAnywayBtn')
      .classList
      .remove(
        'hidden'
      );


    $('conflictWarning')
      .scrollIntoView({
        behavior:
          'smooth',

        block:
          'nearest'
      });

  }



  async function saveAnywayFromConflict() {

    const event =
      state.pendingConflictEvent;


    if (
      !event
    ) {

      return;

    }


    $('eventError')
      .textContent =
        '';


    $('saveAnywayBtn')
      .disabled =
        true;


    try {

      await api(
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


      clearConflictWarning();


      closeModal(
        'eventModal'
      );


      await clearAcceptedRequest();


      await loadWeek();

    } catch (error) {

      $('eventError')
        .textContent =
          error.message;

    } finally {

      $('saveAnywayBtn')
        .disabled =
          false;

    }

  }



  /* =========================================================
     SAVE EVENT
  ========================================================= */


  async function saveEventFromModal() {

    /*
      Clear any existing standard
      validation error.
    */

    $('eventError')
      .textContent =
        '';


    clearConflictWarning();


    const type =
      $('eventType')
        .value;


    const title =
      $('eventTitle')
        .value
        .trim();


    /*
      TYPE REQUIRED
    */

    if (
      !type
    ) {

      $('eventError')
        .textContent =
          'Please select a session type before saving.';


      $('eventType')
        .focus();


      return;

    }


    /*
      TITLE REQUIRED
    */

    if (
      !title
    ) {

      $('eventError')
        .textContent =
          'Please enter a title for this event before saving.';


      $('eventTitle')
        .focus();


      return;

    }


    const start =
      $('eventStart')
        .value;


    const end =
      $('eventEnd')
        .value;


    const startKey =
      localDateTimeToMinuteKey(
        start
      );


    const endKey =
      localDateTimeToMinuteKey(
        end
      );


    /*
      VALID TIME REQUIRED
    */

    if (
      startKey ==
        null ||
      endKey ==
        null
    ) {

      $('eventError')
        .textContent =
          'Please enter a valid start and end date/time.';


      return;

    }


    /*
      END AFTER START
    */

    if (
      endKey <=
      startKey
    ) {

      $('eventError')
        .textContent =
          'The end date/time must be after the start date/time.';


      return;

    }


    let recurrence;


    try {

      recurrence =
        getRecurrenceFromForm();

    } catch (error) {

      $('eventError')
        .textContent =
          error.message;


      return;

    }


    const event = {

      id:
        $('eventId')
          .value,

      type,

      start,

      end,

      title,

      notes:
        $('eventNotes')
          .value,

      recurrence

    };


    $('saveEventBtn')
      .disabled =
        true;


    try {

      /*
        Normal save attempt.
      */

      await api(
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


      clearConflictWarning();


      closeModal(
        'eventModal'
      );


      await clearAcceptedRequest();


      await loadWeek();

    } catch (error) {

      /*
        Schedule conflict.

        Do not use browser confirm().
        Display the warning in the form.
      */

      if (
        error.status ===
          409 &&
        error.data?.code ===
          'BLOCKED_CONFLICT'
      ) {

        showConflictWarning(
          error.data,
          event
        );


        return;

      }


      $('eventError')
        .textContent =
          error.message;

    } finally {

      $('saveEventBtn')
        .disabled =
          false;

    }

  }



  /* =========================================================
     DELETE
  ========================================================= */


  async function deleteEventFromModal() {

    const id =
      $('eventId')
        .value;


    if (
      !id
    ) {

      return;

    }


    const recurring =
      $('repeatType')
        .value ===
      'WEEKLY';


    /*
      This is currently the only browser
      confirmation still used.

      It is separate from schedule
      conflict warnings.
    */

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


    $('deleteEventBtn')
      .disabled =
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

    } catch (error) {

      $('eventError')
        .textContent =
          error.message;

    } finally {

      $('deleteEventBtn')
        .disabled =
          false;

    }

  }



  /* =========================================================
     DATE DISPLAY
  ========================================================= */


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
      startDate
        .toLocaleDateString(
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
      startDate
        .toLocaleTimeString(
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
      endDate
        .toLocaleTimeString(
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
      endDate
        .toLocaleDateString(
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



  /* =========================================================
     PORTAL CURRENT TIME
  ========================================================= */


  function getPortalNowMinuteKey() {

    const timezone =
      state.config
        .timezoneId ||
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
      formatter
        .formatToParts(
          new Date()
        );


    const values =
      {};


    for (
      const part of
      parts
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



  /* =========================================================
     MODALS
  ========================================================= */


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



  /* =========================================================
     STATUS
  ========================================================= */


  function setStatus(
    text
  ) {

    $('status')
      .textContent =
        text ||
        '';

  }



  function handleError(
    error
  ) {

    setStatus(
      error.message ||
      String(
        error
      )
    );

  }



  /* =========================================================
     DATE UTILITIES
  ========================================================= */


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
      hour24 >=
      12
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



  /*
    Calendar convention: when a range
    stays inside one half of the day
    the opening meridiem is redundant,
    and dropping it leaves room for the
    title on a compact card. Only the
    opening one goes – "11:30 – 12"
    would be ambiguous.
  */

  function formatMinuteRange(
    startMinutes,
    endMinutes
  ) {

    const start =
      formatMinutes(
        startMinutes
      );


    const end =
      formatMinutes(
        endMinutes
      );


    const opening =
      start.slice(
        -2
      ) ===
      end.slice(
        -2
      )
        ? start.slice(
            0,
            -3
          )
        : start;


    return (
      opening +
      ' – ' +
      end
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
      month <
        1 ||
      month >
        12 ||
      hour <
        0 ||
      hour >
        23 ||
      minute <
        0 ||
      minute >
        59
    ) {

      return null;

    }


    const milliseconds =
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
        milliseconds
      );


    if (
      check.getUTCFullYear() !==
        year ||
      check.getUTCMonth() !==
        month -
        1 ||
      check.getUTCDate() !==
        day ||
      check.getUTCHours() !==
        hour ||
      check.getUTCMinutes() !==
        minute
    ) {

      return null;

    }


    return Math.floor(
      milliseconds /
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