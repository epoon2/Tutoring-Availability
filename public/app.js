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


    /*
      Which segmented time control has its
      quarter-hour list open, so a click
      elsewhere can close it.
    */

    openTimeWheel:
      null,


    /*
      The session most recently copied from
      the right-click menu, waiting to be
      pasted into a slot.
    */

    clipboardEvent:
      null,


    /*
      The open right-click menu, and the flag
      that stops the click ending a drag from
      being read as a new-session click.
    */

    openContextMenu:
      null,

    suppressNextScheduleClick:
      false,

    events:
      [],

    config: {

      portalTitle:
        "Ethan's Tutoring Availability",

      tutorName:
        'Ethan',

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
      null,

    /*
      When this page last heard from the
      server, which is a different question
      from when the tutor last changed
      anything.
    */
    lastLoadedAt:
      0
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
      () => {

        renderCheckedLabel();

        maybeRefresh();

      },
      60000
    );


    /*
      Coming back to the tab is the
      moment a stale page is actually
      noticed, so revalidate then too.
    */

    document.addEventListener(
      'visibilitychange',
      () => {

        renderCheckedLabel();

        maybeRefresh();

      }
    );


    /*
      One dismissal path for both overlays.
      A pointer down anywhere that is not the
      menu or the open wheel closes them, and
      Escape does the same from the keyboard.
    */

    document.addEventListener(
      'pointerdown',
      (event) => {

        if (
          !event.target
            .closest( '.context-menu' )
        ) {

          closeContextMenu();

        }


        /*
          The wheel button lives inside the
          control, so a press on it reaches
          this capture handler first. Closing
          on it would undo the open that is
          about to happen, which is why the
          whole control is exempt here and the
          button toggles for itself.
        */

        if (
          !event.target
            .closest( '.datetime-time' ) &&
          !event.target
            .closest( '.time-wheel' )
        ) {

          closeTimeWheel();

        }

      },
      true
    );


    document.addEventListener(
      'keydown',
      (event) => {

        if ( event.key !== 'Escape' ) {

          return;

        }


        closeContextMenu();

        closeTimeWheel();

      }
    );


    /*
      Scrolling the week would leave the menu
      anchored to a slot that has moved, so it
      closes. The time wheel does not: it is
      positioned against its own field and
      moves with it, and it scrolls itself to
      the current value as it opens - which is
      a scroll event of its own, and closing on
      that would shut the wheel in the act of
      opening it.
    */

    window.addEventListener(
      'scroll',
      (scrollEvent) => {

        if (
          scrollEvent.target &&
          scrollEvent.target.closest &&
          scrollEvent.target
            .closest( '.time-wheel' )
        ) {

          return;

        }


        closeContextMenu();

      },
      true
    );


    /*
      Keep the "now" line honest while the tab sits open.
    */

    setInterval(
      mountNowLine,
      60000
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


    $('summaryToggle')
      .addEventListener(
        'click',
        () => {

          const list =
            $('summaryList');


          const nowHidden =
            list
              .classList
              .toggle( 'hidden' );


          $('summaryToggle')
            .textContent =
              nowHidden
                ? 'Show each student'
                : 'Hide each student';


          $('summaryToggle')
            .setAttribute(
              'aria-expanded',
              String( !nowHidden )
            );

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


    [
      'eventStart',
      'eventEnd',
      'requestStart',
      'requestEnd'
    ]
      .forEach(
        bindDateTimeField
      );


    /*
      Weekly options, in both forms that
      offer them.
    */

    bindRecurrenceControls(
      $('eventModal'),
      clearConflictWarning
    );


    bindRecurrenceControls(
      $('requestModal')
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


      /*
        Merge rather than replace. A deploy
        can briefly serve this page against a
        cached response from the previous
        version, and a key that response does
        not carry should fall back to the
        built-in default rather than becoming
        undefined on screen.
      */

      state.config = {
        ...state.config,
        ...(
          data.config ||
          {}
        )
      };


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
            ? `${state.config.tutorName} last updated the schedule ` +
              formatUpdated(
                data.lastUpdated
              )
            : `${state.config.tutorName} has not saved any times yet`;


      state.lastLoadedAt =
        Date.now();


      renderCheckedLabel();


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

    renderWeekSummary();

    mountNowLine();

  }


  /*
    The red line that says "you are here". Drawn in today's column at
    the portal's own current time - getPortalNowMinuteKey, not the
    visitor's clock, so a student in another timezone sees the line
    where the tutor's day actually stands. Redrawn by renderAll and by
    a once-a-minute tick; absent entirely when the viewed week is not
    this one or the moment falls outside the visible hours.
  */

  function mountNowLine() {

    document
      .querySelectorAll( '.now-line' )
      .forEach(
        (element) => {

          element.remove();

        }
      );


    const nowLocal =
      minuteKeyToLocalDateTime(
        getPortalNowMinuteKey()
      );


    const today =
      nowLocal.slice( 0, 10 );


    const column =
      document.querySelector(
        '.day-column[data-date="' +
        today +
        '"]'
      );


    if ( !column ) {

      return;

    }


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


    const minutes =
      Number( nowLocal.slice( 11, 13 ) ) *
      60 +
      Number( nowLocal.slice( 14, 16 ) );


    if (
      minutes <
        startHour *
        60 ||
      minutes >
        endHour *
        60
    ) {

      return;

    }


    const line =
      document.createElement( 'div' );

    line.className =
      'now-line';

    line.style.top =
      (
        (
          minutes -
          startHour *
          60
        ) /
        60
      ) *
      64 +
      'px';


    const dot =
      document.createElement( 'span' );

    dot.className =
      'now-dot';

    line.appendChild( dot );

    column.appendChild( line );

  }





  /* =========================================================
     WEEK SUMMARY (ADMIN)
     ========================================================= */

  /*
    How much of the week is spoken for, and by
    whom. Only blocked time counts as booked;
    availability is the offer, not the work.
    Everything is measured from what is drawn
    on the calendar, so a recurring series and
    a one-off are counted the same way and a
    session crossing midnight is split across
    the two days exactly as it appears.
  */

  function renderWeekSummary() {

    const panel =
      $('weekSummary');


    if ( !panel ) {

      return;

    }


    panel
      .classList
      .toggle(
        'hidden',
        !state.isAdmin
      );


    if ( !state.isAdmin ) {

      return;

    }


    const byStudent =
      new Map();


    let totalMinutes = 0;


    for ( let day = 0; day < 7; day++ ) {

      const date =
        addDays(
          state.weekStart,
          day
        );


      const dateStr =
        formatDate( date );


      getSegmentsForDate( dateStr )
        .forEach(
          ({ event, startMin, endMin }) => {

            if (
              event.type !== 'BLOCKED'
            ) {

              return;

            }


            const minutes =
              Math.max(
                0,
                endMin - startMin
              );


            totalMinutes += minutes;


            const name =
              summaryStudentName( event );


            if ( !byStudent.has( name ) ) {

              byStudent.set(
                name,
                {
                  name,
                  minutes: 0,
                  sessions: []
                }
              );

            }


            const record =
              byStudent.get( name );


            record.minutes += minutes;


            record.sessions.push({
              date,
              startMin,
              endMin
            });

          }
        );

    }


    $('summaryHours')
      .textContent =
        formatHours( totalMinutes );


    $('summaryStudents')
      .textContent =
        String( byStudent.size );


    const list =
      $('summaryList');


    list.innerHTML = '';


    if ( byStudent.size === 0 ) {

      const empty =
        document
          .createElement( 'li' );


      empty.className =
        'week-summary-empty';


      empty.textContent =
        'Nothing blocked off this week.';


      list.appendChild( empty );


      return;

    }


    /*
      Busiest first: the person to look at is
      the one taking the most of the week.
    */

    [ ...byStudent.values() ]
      .sort(
        (a, b) =>
          b.minutes - a.minutes ||
          a.name.localeCompare( b.name )
      )
      .forEach(
        (record) => {

          const item =
            document
              .createElement( 'li' );


          item.className =
            'week-summary-student';


          const head =
            document
              .createElement( 'div' );


          head.className =
            'week-summary-student-head';


          const who =
            document
              .createElement( 'strong' );


          who.textContent = record.name;


          const hours =
            document
              .createElement( 'span' );


          hours.className =
            'week-summary-student-hours';


          hours.textContent =
            formatHours( record.minutes ) +
            ' hr' +
            ( record.minutes === 60
              ? ''
              : 's' ) +
            ' · ' +
            record.sessions.length +
            ( record.sessions.length === 1
              ? ' session'
              : ' sessions' );


          head.appendChild( who );

          head.appendChild( hours );


          const when =
            document
              .createElement( 'div' );


          when.className =
            'week-summary-sessions';


          when.textContent =
            record.sessions
              .sort(
                (a, b) =>
                  a.date - b.date ||
                  a.startMin - b.startMin
              )
              .map( summarySessionLabel )
              .join( ' · ' );


          item.appendChild( head );

          item.appendChild( when );


          list.appendChild( item );

        }
      );

  }


  /*
    Titles are written as "Maya - Algebra II"
    or "Maya (online)", so the name is what
    comes before the first separator. An
    untitled block is still time spent and is
    grouped under one heading rather than
    dropped.
  */

  function summaryStudentName(
    event
  ) {

    const title =
      ( event.title || '' ).trim();


    if ( !title ) {

      return 'Unlabelled';

    }


    const cut =
      title.split(
        /\s+[-–—(|,]\s*|\s+\(/
      )[0];


    return (
      cut.trim() ||
      title
    );

  }


  function summarySessionLabel(
    session
  ) {

    const day =
      session.date
        .toLocaleDateString(
          undefined,
          {
            weekday: 'short'
          }
        );


    return (
      day +
      ' ' +
      formatClockLabel(
        Math.floor( session.startMin / 60 ),
        session.startMin % 60
      )
        .replace( ':00', '' )
        .toLowerCase()
        .replace( ' ', '' ) +
      '-' +
      formatClockLabel(
        Math.floor( session.endMin / 60 ),
        session.endMin % 60
      )
        .replace( ':00', '' )
        .toLowerCase()
        .replace( ' ', '' )
    );

  }


  /*
    Half hours read better than 1.5000000001,
    and a whole number should not carry a
    trailing .0.
  */

  function formatHours(
    minutes
  ) {

    const hours =
      Math.round(
        minutes / 60 * 100
      ) / 100;


    return (
      Number.isInteger( hours )
        ? String( hours )
        : hours
            .toFixed( 2 )
            .replace( /0$/, '' )
    );

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
          'click',
          (event) => {

            handleScheduleClick(
              event,
              column
            );

          }
        );


        column.addEventListener(
          'contextmenu',
          (event) => {

            handleScheduleContextMenu(
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


            state.suppressNextScheduleClick =
              true;


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


      /*
        Left click anywhere on the schedule
        opens a new session for that slot,
        cards included. Editing an existing
        one moved to the right-click menu so
        this one gesture is never ambiguous.
      */

      card.addEventListener(
        'contextmenu',
        (menuEvent) => {

          handleCardContextMenu(
            menuEvent,
            original,
            event
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


  /*
    How far ahead the upcoming list looks,
    as the midnight that closes the window.

    It always ends on a Saturday, so the list
    is whole weeks rather than a rolling
    fortnight. Sunday stops at the end of
    this week, because a week of notice is
    already there; every other day takes next
    week as well, since a Friday would
    otherwise show almost nothing.
  */

  function upcomingWindowEnd(
    nowKey
  ) {

    const now =
      new Date(
        nowKey *
        60000
      );


    const startOfToday =
      nowKey -
      (
        now.getUTCHours() *
        60 +
        now.getUTCMinutes()
      );


    const weekday =
      now.getUTCDay();


    const daysToSaturday =
      6 -
      weekday;


    const nextWeek =
      weekday ===
      0
        ? 0
        : 7;


    return startOfToday +
      (
        daysToSaturday +
        nextWeek +
        1
      ) *
      1440;

  }



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


      const windowEnd =
        upcomingWindowEnd(
          nowKey
        );


      const endDate =
        minuteKeyToLocalDateTime(
          windowEnd -
          1
        )
          .slice(
            0,
            10
          );


      /*
        Say where the list stops, so a quiet
        column reads as nothing booked rather
        than as something failing to load.
      */

      $('upcomingBlockedRange')
        .textContent =
          'Through ' +
          new Date(
            (
              windowEnd -
              1440
            ) *
            60000
          )
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
                  'numeric'
              }
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
                nowKey &&
              localDateTimeToMinuteKey(
                event.start
              ) <
                windowEnd
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


  /*
    Where a pointer landed in a day column,
    as a minute of the day.

    Snapped to the nearest quarter hour: a
    drop lands wherever the cursor happens to
    be, which produced starts like 12:53, and
    the grid line the cursor was aiming at is
    what was actually meant.
  */

  function pointerMinuteOfDay(
    column,
    clientY
  ) {

    const rect =
      column
        .getBoundingClientRect();


    const y =
      Math.max(
        0,
        Math.min(
          rect.height,
          clientY -
          rect.top
        )
      );


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


    const snapped =
      Math.round(
        (
          startHour *
          60 +
          (
            y /
            64
          ) *
          60
        ) /
        15
      ) *
      15;


    /*
      Keep the start inside the day on screen.
      Without this, a drop on the last row
      rounds up past midnight and the event
      lands on tomorrow, out of sight.
    */

    return Math.min(
      snapped,
      endHour *
      60 -
      15
    );

  }



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


    const newStartMinuteOfDay =
      pointerMinuteOfDay(
        column,
        event.clientY
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





  /* =========================================================
     SCHEDULE CLICK AND CONTEXT MENU
     ========================================================= */

  /*
    One gesture, one meaning. Left click on
    the schedule always starts a new session
    at the slot under the pointer, whether or
    not something is already there. Everything
    that acts on an existing session lives in
    the right-click menu, so a stray click can
    never edit or move real bookings.
  */

  function scheduleSlotFromPointer(
    column,
    clientY
  ) {

    const startMinuteOfDay =
      pointerMinuteOfDay(
        column,
        clientY
      );


    const start =
      dateAndMinutesToLocalDateTime(
        column.dataset.date,
        startMinuteOfDay
      );


    const startKey =
      localDateTimeToMinuteKey( start );


    return {
      start,
      end:
        minuteKeyToLocalDateTime(
          startKey + 60
        )
    };

  }


  function handleScheduleClick(
    event,
    column
  ) {

    if ( !state.isAdmin ) {

      return;

    }


    /*
      A drag that ends over the column also
      fires a click. Ignoring it here keeps
      moving a card from silently opening the
      new-session form on top of the drop.
    */

    if ( state.suppressNextScheduleClick ) {

      state.suppressNextScheduleClick = false;

      return;

    }


    if ( state.openContextMenu ) {

      closeContextMenu();

      return;

    }


    const slot =
      scheduleSlotFromPointer(
        column,
        event.clientY
      );


    /*
      Do not automatically assign Available.
      Type begins as Select One.
    */

    openEventModal( slot );

  }


  function handleScheduleContextMenu(
    event,
    column
  ) {

    if ( !state.isAdmin ) {

      return;

    }


    /*
      A right click that landed on a card is
      that card's menu, not the column's.
    */

    if (
      event.target
        .closest( '.event-card' )
    ) {

      return;

    }


    event.preventDefault();


    const slot =
      scheduleSlotFromPointer(
        column,
        event.clientY
      );


    const items = [
      {
        label:
          'New session here',
        run:
          () => {

            openEventModal( slot );

          }
      }
    ];


    if ( state.clipboardEvent ) {

      items.push({
        label:
          'Paste "' +
          clipboardLabel() +
          '" here',
        run:
          () => {

            pasteClipboardInto( slot );

          }
      });

    }


    openContextMenu(
      event,
      items
    );

  }


  function handleCardContextMenu(
    event,
    original,
    occurrence
  ) {

    if ( !state.isAdmin ) {

      return;

    }


    event.preventDefault();

    event.stopPropagation();


    const items = [
      {
        label:
          original.recurrence
            ? 'Edit series'
            : 'Edit',
        run:
          () => {

            openEventModal(
              original,
              occurrence ||
              original
            );

          }
      },
      {
        label:
          'Duplicate',
        run:
          () => {

            copyEvent( original );

            pasteClipboardInto({
              start:
                original.start,
              end:
                original.end
            });

          }
      },
      {
        label:
          'Copy',
        run:
          () => {

            copyEvent( original );


            setStatus(
              'Copied. Right-click a slot to paste it.'
            );

          }
      },
      {
        label:
          original.recurrence
            ? 'Delete…'
            : 'Delete',
        danger:
          true,
        run:
          () => {

            /*
              A repeating event is never deleted in one blind stroke:
              the dialog asks how far the deletion reaches - just the
              clicked block, everything from it onward, or the whole
              series. The clicked date comes from the expanded
              occurrence, not the series master, whose start is stuck
              on the anchor week.
            */

            if ( original.recurrence ) {

              confirmScopedDelete(
                original,
                occurrence ||
                original
              );

            } else {

              deleteEventById( original );

            }

          }
      }
    ];


    openContextMenu(
      event,
      items
    );

  }


  /*
    Copy keeps the fields that describe the
    session and deliberately drops the ones
    that place it in time, because the point
    of pasting is to put the same session
    somewhere else.
  */

  function copyEvent(
    original
  ) {

    state.clipboardEvent = {
      title:
        original.title || '',
      type:
        original.type || '',
      notes:
        original.notes || '',
      durationMinutes:
        Math.max(
          15,
          localDateTimeToMinuteKey(
            original.end
          ) -
          localDateTimeToMinuteKey(
            original.start
          )
        )
    };

  }


  function clipboardLabel() {

    const copied =
      state.clipboardEvent;


    if ( !copied ) {

      return '';

    }


    const name =
      copied.title ||
      copied.studentName ||
      ( copied.type === 'AVAILABLE'
        ? 'Available'
        : 'Blocked' );


    return name.length > 24
      ? name.slice( 0, 23 ) + '…'
      : name;

  }


  /*
    Paste opens the editor rather than writing
    straight to the server, so the slot can be
    checked and adjusted before it is saved.
    Everything except date and time arrives
    already filled in.
  */

  function pasteClipboardInto(
    slot
  ) {

    const copied =
      state.clipboardEvent;


    if ( !copied ) {

      return;

    }


    const startKey =
      localDateTimeToMinuteKey(
        slot.start
      );


    openEventModal({
      start:
        slot.start,
      end:
        minuteKeyToLocalDateTime(
          startKey +
          copied.durationMinutes
        ),
      title:
        copied.title,
      type:
        copied.type,
      notes:
        copied.notes
    });

  }


  /*
    In-page choice dialog, replacing the browser's confirm(). Resolves
    to the chosen value, or null when dismissed. Each verb sits on its
    own stacked button so a three-way decision reads as three plain
    sentences instead of an OK/Cancel riddle.
  */

  function siteDialog({
    title,
    message,
    choices,
    cancelLabel
  }) {

    return new Promise( (resolve) => {

      const backdrop =
        document.createElement( 'div' );

      backdrop.className =
        'modal-backdrop choice-backdrop';


      const card =
        document.createElement( 'div' );

      card.className =
        'modal-card small-modal choice-modal';

      card.setAttribute( 'role', 'alertdialog' );

      card.setAttribute( 'aria-modal', 'true' );


      const heading =
        document.createElement( 'h2' );

      heading.textContent =
        title;

      card.appendChild( heading );


      if ( message ) {

        const body =
          document.createElement( 'p' );

        body.className =
          'choice-message';

        body.textContent =
          message;

        card.appendChild( body );

      }


      const list =
        document.createElement( 'div' );

      list.className =
        'choice-list';


      let settled = false;

      const finish = (value) => {

        if ( settled ) {

          return;

        }

        settled = true;

        document.removeEventListener( 'keydown', onKey, true );

        backdrop.remove();

        resolve( value );

      };


      ( choices || [] ).forEach( (choice) => {

        const button =
          document.createElement( 'button' );

        button.type =
          'button';

        button.className =
          'btn choice-btn' +
          ( choice.danger
            ? ' danger'
            : ' secondary' );

        button.textContent =
          choice.label;

        button.addEventListener( 'click', () => {

          finish( choice.value );

        });

        list.appendChild( button );

      });

      card.appendChild( list );


      const cancel =
        document.createElement( 'button' );

      cancel.type =
        'button';

      cancel.className =
        'btn choice-cancel';

      cancel.textContent =
        cancelLabel ||
        'Never mind';

      cancel.addEventListener( 'click', () => {

        finish( null );

      });

      card.appendChild( cancel );


      /*
        Capture phase, so Escape closes this dialog without also
        reaching the app's global handler and closing whatever
        modal sits underneath it.
      */

      const onKey = (keyEvent) => {

        if ( keyEvent.key === 'Escape' ) {

          keyEvent.stopPropagation();

          finish( null );

        }

      };

      document.addEventListener( 'keydown', onKey, true );


      backdrop.addEventListener( 'mousedown', (downEvent) => {

        if ( downEvent.target === backdrop ) {

          finish( null );

        }

      });


      backdrop.appendChild( card );

      document.body.appendChild( backdrop );


      const first =
        list.querySelector( 'button' );

      if ( first ) {

        first.focus();

      }

    });

  }


  async function siteConfirm(
    title,
    message,
    verb
  ) {

    const choice =
      await siteDialog({
        title,
        message,
        choices: [
          {
            label:
              verb ||
              'Delete',
            value:
              'yes',
            danger:
              true
          }
        ]
      });


    return choice === 'yes';

  }


  function occurrenceLabel(
    original
  ) {

    const date =
      new Date(
        original.start.slice( 0, 10 ) + 'T12:00'
      );


    return date.toLocaleDateString(
      undefined,
      {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      }
    );

  }


  /*
    Date arithmetic on plain YYYY-MM-DD strings, through UTC so a DST
    boundary can never bend a day into 23 or 25 hours mid-shift.
  */

  function shiftDateString(
    dateStr,
    deltaDays
  ) {

    const [ y, m, d ] =
      dateStr
        .split( '-' )
        .map( Number );


    return new Date(
      Date.UTC(
        y,
        m - 1,
        d + deltaDays
      )
    )
      .toISOString()
      .slice( 0, 10 );

  }


  /*
    Deleting from a repeating series reaches one of three distances:
    the clicked block alone, everything from it onward, or the whole
    series. One dialog asks which; choosing the verb is the
    confirmation, so nothing asks twice. Resolves true when any
    deletion was chosen and attempted.
  */

  async function confirmScopedDelete(
    original,
    occurrence
  ) {

    const clicked =
      occurrence ||
      original;


    const choice =
      await siteDialog({
        title:
          'Delete from this series?',
        message:
          ( original.title || 'This event' ) +
          ' repeats weekly. How much of it goes?',
        choices: [
          {
            label:
              'Just this block (' +
              occurrenceLabel( clicked ) +
              ')',
            value:
              'one'
          },
          {
            label:
              'This and every one after',
            value:
              'following',
            danger:
              true
          },
          {
            label:
              'The whole series, past and future',
            value:
              'all',
            danger:
              true
          }
        ]
      });


    if ( !choice ) {

      return false;

    }


    if ( choice === 'one' ) {

      await deleteOneOccurrence(
        original,
        clicked
      );

    } else if ( choice === 'following' ) {

      await deleteFollowing(
        original,
        clicked
      );

    } else {

      await deleteWholeSeries(
        original
      );

    }


    return true;

  }


  /*
    Remove one occurrence. The series itself is untouched: the server
    records the date as an exception and every other week keeps its
    session. The status is written after loadWeek so its own progress
    narration does not stomp on the confirmation.
  */

  async function deleteOneOccurrence(
    original,
    occurrence
  ) {

    const date =
      occurrence.start.slice( 0, 10 );


    const id =
      original.masterId ||
      original.id;


    try {

      await api(
        '/events/' +
          encodeURIComponent( id ) +
          '/skip',
        {
          method:
            'POST',
          body:
            JSON.stringify({ date })
        }
      );


      await loadWeek();


      setStatus(
        occurrenceLabel( occurrence ) +
        ' removed. Every other week keeps this session.'
      );

    } catch (error) {

      setStatus( error.message );

    }

  }


  /*
    Ending a series "from here on" is a truncation, not a deletion:
    the master keeps everything it had but gains an end date the day
    before the chosen block, so earlier weeks survive exactly as they
    were. The master's own start and times come from seriesStart and
    seriesEnd - the clicked card is an expanded occurrence whose start
    belongs to the viewed week, and saving THAT as the anchor would
    silently erase the history being protected.
  */

  async function deleteFollowing(
    original,
    occurrence
  ) {

    const cut =
      occurrence.start.slice( 0, 10 );


    const masterStart =
      original.seriesStart ||
      original.start;


    const masterEnd =
      original.seriesEnd ||
      original.end;


    if (
      cut <=
      masterStart.slice( 0, 10 )
    ) {

      /*
        Cutting at the very first block leaves nothing - that is the
        whole-series case wearing different clothes.
      */

      await deleteWholeSeries(
        original
      );


      return;

    }


    const recurrence = {

      frequency:
        'WEEKLY',

      interval:
        original.recurrence.interval ||
        1,

      weekdays:
        original.recurrence.weekdays,

      endType:
        'ON',

      until:
        shiftDateString(
          cut,
          -1
        )

    };


    if ( original.recurrence.exdates ) {

      recurrence.exdates =
        original.recurrence.exdates;

    }


    try {

      await api(
        '/events',
        {
          method:
            'POST',
          body:
            JSON.stringify({

              id:
                original.masterId ||
                original.id,

              type:
                original.type,

              title:
                original.title,

              notes:
                original.notes,

              start:
                masterStart,

              end:
                masterEnd,

              recurrence

            })
        }
      );


      await loadWeek();


      setStatus(
        'Removed ' +
        occurrenceLabel( occurrence ) +
        ' and every week after it. Earlier weeks are untouched.'
      );

    } catch (error) {

      setStatus( error.message );

    }

  }


  async function deleteWholeSeries(
    original
  ) {

    const id =
      original.masterId ||
      original.id;


    try {

      await api(
        '/events/' +
          encodeURIComponent( id ),
        {
          method:
            'DELETE'
        }
      );


      await loadWeek();


      setStatus(
        'The whole series is deleted.'
      );

    } catch (error) {

      setStatus( error.message );

    }

  }


  async function deleteEventById(
    original
  ) {

    const id =
      original.masterId ||
      original.id;


    if ( !id ) {

      return;

    }


    const wanted =
      await siteConfirm(
        original.recurrence
          ? 'Delete this entire recurring series?'
          : 'Delete this event?',
        original.title ||
        ''
      );


    if ( !wanted ) {

      return;

    }


    try {

      await api(
        '/events/' +
          encodeURIComponent( id ),
        {
          method:
            'DELETE'
        }
      );


      await loadWeek();

    } catch (error) {

      setStatus( error.message );

    }

  }


  /* -----------------------------
     THE MENU ITSELF
  ----------------------------- */

  function openContextMenu(
    event,
    items
  ) {

    closeContextMenu();


    const menu =
      document
        .createElement( 'div' );


    menu.className = 'context-menu';


    menu
      .setAttribute(
        'role',
        'menu'
      );


    items
      .forEach(
        (item) => {

          const button =
            document
              .createElement( 'button' );


          button.type = 'button';

          button.className =
            'context-menu-item' +
            ( item.danger
              ? ' is-danger'
              : '' );

          button.textContent =
            item.label;


          button
            .addEventListener(
              'click',
              (clickEvent) => {

                clickEvent
                  .stopPropagation();

                closeContextMenu();

                item.run();

              }
            );


          menu.appendChild( button );

        }
      );


    document
      .body
      .appendChild( menu );


    /*
      Keep the menu on screen: flip it back
      inside the viewport if opening at the
      pointer would push it off an edge.
    */

    const width =
      menu.offsetWidth;


    const height =
      menu.offsetHeight;


    const left =
      Math.min(
        event.clientX,
        window.innerWidth - width - 8
      );


    const top =
      Math.min(
        event.clientY,
        window.innerHeight - height - 8
      );


    menu.style.left =
      Math.max( 8, left ) + 'px';

    menu.style.top =
      Math.max( 8, top ) + 'px';


    state.openContextMenu = menu;

  }


  function closeContextMenu() {

    if ( state.openContextMenu ) {

      state.openContextMenu.remove();

      state.openContextMenu = null;

    }

  }




  /* =========================================================
     ADMIN LOGIN
  ========================================================= */


  /* =========================================================
     SESSION REQUESTS (PUBLIC)
  ========================================================= */


  /* =========================================================
     DATE AND TIME FIELDS
  ========================================================= */

  /*
    Each start and end is a visible date input
    and a visible time input, plus a hidden
    field holding the combined value the rest
    of the app already reads and listens to.

    Splitting them is what lets a phone open
    the time wheel on the first tap. Keeping
    the hidden field means nothing downstream
    has to know that happened.
  */

  function setDateTimeValue(
    id,
    value
  ) {

    const combined =
      value ||
      '';


    $(id)
      .value =
        combined;


    $(id + 'Date')
      .value =
        combined
          .slice(
            0,
            10
          );


    writeTimeControl(
      id,
      combined
        .slice(
          11,
          16
        )
    );

  }



  function bindDateTimeField(
    id
  ) {

    const recombine =
      () => {

        const date =
          $(id + 'Date')
            .value;


        const time =
          $(id + 'Time')
            .value;


        /*
          Half a value is not a time. Leaving
          it empty keeps the existing
          validation in charge of saying so.
        */

        $(id)
          .value =
            date &&
            time
              ? `${date}T${time.slice(0, 5)}`
              : '';


        /*
          The hidden field is what listeners
          were attached to, so tell them it
          moved.
        */

        $(id)
          .dispatchEvent(
            new Event(
              'change',
              {
                bubbles:
                  true
              }
            )
          );


        $(id)
          .dispatchEvent(
            new Event(
              'input',
              {
                bubbles:
                  true
              }
            )
          );

      };


    bindTimeControl(
      id
    );


    /*
      The year segment of a native date input
      accepts six digits, and min/max only
      mark the field invalid rather than stop
      the typing. A schedule has no business
      in the year 275760, so anything outside
      the allowed span is pulled back to it
      once the field is left.
    */

    $(id + 'Date')
      .addEventListener(
        'blur',
        () => {

          const field =
            $(id + 'Date');


          if ( !field.value ) {

            return;

          }


          const year =
            Number(
              field.value
                .slice( 0, 4 )
            );


          if (
            !Number.isFinite( year ) ||
            ( year >= 2000 &&
              year <= 2099 )
          ) {

            return;

          }


          const clamped =
            Math.min(
              2099,
              Math.max( 2000, year )
            );


          field.value =
            String( clamped ) +
            field.value
              .slice( 4 );


          field
            .dispatchEvent(
              new Event(
                'input',
                {
                  bubbles:
                    true
                }
              )
            );

        }
      );



    [
      id + 'Date',
      id + 'Time'
    ]
      .forEach(
        (part) => {

          $(part)
            .addEventListener(
              'change',
              recombine
            );


          $(part)
            .addEventListener(
              'input',
              recombine
            );

        }
      );

  }


  /* =========================================================
     SEGMENTED TIME CONTROL
     ========================================================= */

  /*
    A native time input cannot do everything
    this portal needs at once: typing any
    minute, a wheel that offers only quarter
    hours, and both of those on a phone. The
    step attribute governs typing and the
    picker together, so one of the three
    always loses. Three small text inputs plus
    a list of our own get all three, and the
    hidden field underneath still carries the
    same HH:MM the rest of the app reads.
  */

  const QUARTER_MINUTES = 15;


  function timeControlParts(
    id
  ) {

    return {
      hour: $(id + 'Hour'),
      minute: $(id + 'Minute'),
      meridiem: $(id + 'Meridiem'),
      hidden: $(id + 'Time')
    };

  }


  /*
    Segments to HH:MM. Returns '' unless all
    three are filled, because half a time is
    not a time and the existing validation
    should be the thing that says so.
  */

  function readTimeControl(
    id
  ) {

    const parts =
      timeControlParts( id );


    const hour =
      Number(
        parts.hour.value
      );


    const minute =
      Number(
        parts.minute.value
      );


    const meridiem =
      parts.meridiem
        .value
        .trim()
        .toUpperCase();


    if (
      !parts.hour.value ||
      !parts.minute.value ||
      !Number.isFinite( hour ) ||
      !Number.isFinite( minute ) ||
      hour < 1 ||
      hour > 12 ||
      minute < 0 ||
      minute > 59 ||
      ( meridiem !== 'AM' &&
        meridiem !== 'PM' )
    ) {

      return '';

    }


    const hour24 =
      meridiem === 'AM'
        ? hour % 12
        : ( hour % 12 ) + 12;


    return (
      String( hour24 )
        .padStart( 2, '0' ) +
      ':' +
      String( minute )
        .padStart( 2, '0' )
    );

  }


  /*
    HH:MM into the three segments. An empty
    value clears them rather than showing a
    misleading 12:00 AM.
  */

  function writeTimeControl(
    id,
    value
  ) {

    const parts =
      timeControlParts( id );


    const match =
      /^(\d{1,2}):(\d{2})/
        .exec( value || '' );


    if ( !match ) {

      parts.hour.value = '';
      parts.minute.value = '';
      parts.meridiem.value = '';
      parts.hidden.value = '';

      return;

    }


    const hour24 =
      Number( match[1] );


    const minute =
      Number( match[2] );


    parts.hour.value =
      String(
        hour24 % 12 === 0
          ? 12
          : hour24 % 12
      );


    parts.minute.value =
      String( minute )
        .padStart( 2, '0' );


    parts.meridiem.value =
      hour24 >= 12
        ? 'PM'
        : 'AM';


    parts.hidden.value =
      String( hour24 )
        .padStart( 2, '0' ) +
      ':' +
      String( minute )
        .padStart( 2, '0' );

  }


  function bindTimeControl(
    id
  ) {

    const parts =
      timeControlParts( id );


    /*
      The hidden field is what the recombine
      logic already listens to, so every
      segment change republishes it there.
    */

    const publish =
      () => {

        parts.hidden.value =
          readTimeControl( id );


        parts.hidden
          .dispatchEvent(
            new Event(
              'input',
              {
                bubbles:
                  true
              }
            )
          );

      };


    const focusNext =
      (field) => {

        field.focus();
        field.select();

      };


    /*
      Hour: two digits, or one digit that
      cannot become a valid two-digit hour,
      moves to the minutes. Typing 1 waits,
      because 11 and 12 are still reachable;
      typing 3 does not, because there is no
      hour 3x.
    */

    parts.hour
      .addEventListener(
        'input',
        () => {

          const digits =
            parts.hour
              .value
              .replace( /\D/g, '' )
              .slice( 0, 2 );


          parts.hour.value = digits;


          publish();


          if ( digits.length === 2 ) {

            focusNext( parts.minute );

            return;

          }


          if (
            digits.length === 1 &&
            Number( digits ) > 1
          ) {

            focusNext( parts.minute );

          }

        }
      );


    /*
      Minutes: any value 00-59, so 11:07 is
      typeable. Two digits move on to AM/PM.
    */

    parts.minute
      .addEventListener(
        'input',
        () => {

          const digits =
            parts.minute
              .value
              .replace( /\D/g, '' )
              .slice( 0, 2 );


          parts.minute.value = digits;


          publish();


          if ( digits.length === 2 ) {

            focusNext( parts.meridiem );

          }

        }
      );


    /*
      Meridiem takes a or p from anywhere in
      what was typed, so both 'a' and 'AM'
      work and nothing else sticks.
    */

    parts.meridiem
      .addEventListener(
        'input',
        () => {

          const typed =
            parts.meridiem
              .value
              .toUpperCase();


          if ( /P/.test( typed ) ) {

            parts.meridiem.value = 'PM';

          } else if ( /A/.test( typed ) ) {

            parts.meridiem.value = 'AM';

          } else {

            parts.meridiem.value = '';

          }


          publish();

        }
      );


    /*
      Backspace at the start of a segment goes
      back to the previous one, which is what
      a native segmented field does.
    */

    [
      [ parts.minute, parts.hour ],
      [ parts.meridiem, parts.minute ]
    ]
      .forEach(
        ([ field, previous ]) => {

          field
            .addEventListener(
              'keydown',
              (keyEvent) => {

                if (
                  keyEvent.key !==
                    'Backspace' ||
                  field.value !== ''
                ) {

                  return;

                }


                keyEvent.preventDefault();

                focusNext( previous );

              }
            );

        }
      );


    /*
      Tidy up on the way out: a lone 7 in the
      minutes means 07, and an hour of 0 means
      12. Done on blur rather than on input so
      it never fights what is being typed.
    */

    [
      parts.hour,
      parts.minute
    ]
      .forEach(
        (field) => {

          field
            .addEventListener(
              'blur',
              () => {

                if ( field.value === '' ) {

                  return;

                }


                let numeric =
                  Number( field.value );


                if ( field === parts.hour ) {

                  if ( numeric === 0 ) {

                    numeric = 12;

                  }


                  if ( numeric > 12 ) {

                    numeric = 12;

                  }


                  field.value =
                    String( numeric );

                } else {

                  if ( numeric > 59 ) {

                    numeric = 59;

                  }


                  field.value =
                    String( numeric )
                      .padStart( 2, '0' );

                }


                publish();

              }
            );

        }
      );


    /*
      Selecting the whole segment on focus
      means typing replaces rather than
      appends, so a second visit to the field
      does not produce 1111.
    */

    [
      parts.hour,
      parts.minute,
      parts.meridiem
    ]
      .forEach(
        (field) => {

          field
            .addEventListener(
              'focus',
              () => {

                field.select();

              }
            );

        }
      );


    /*
      Opened on pointerdown, and toggled, so
      the global dismiss handler that runs in
      the capture phase cannot close it in the
      same gesture that asked for it.
    */

    /*
      The control sits inside a <label>, and a
      label forwards clicks to its input as a
      second, synthetic event whose target is
      the label itself. That synthetic click
      bubbles to the schedule and to the
      global dismiss handler, which would shut
      the wheel in the same gesture that
      opened it. Stopping the gesture dead at
      pointerdown, and again at click, is what
      keeps it open.
    */

    [ 'pointerdown', 'mousedown', 'click' ]
      .forEach(
        (type) => {

          $(id + 'Wheel')
            .addEventListener(
              type,
              (gestureEvent) => {

                gestureEvent
                  .preventDefault();

                gestureEvent
                  .stopPropagation();


                if ( type !== 'pointerdown' ) {

                  return;

                }


                if (
                  state.openTimeWheel === id
                ) {

                  closeTimeWheel();

                  return;

                }


                openTimeWheel( id );

              }
            );

        }
      );

  }


  /*
    The wheel: quarter hours only, as asked.
    Built here rather than taken from the
    browser so a phone gets the same list the
    desktop does while the digits stay
    typeable on both.
  */

  function openTimeWheel(
    id
  ) {

    closeTimeWheel();


    const control =
      document
        .querySelector(
          `[data-time-control="${id}"]`
        );


    if ( !control ) {

      return;

    }


    const list =
      document
        .createElement( 'div' );


    list.className = 'time-wheel';


    list
      .setAttribute(
        'role',
        'listbox'
      );


    const current =
      readTimeControl( id );


    let selected = null;


    for (
      let minutes = 0;
      minutes < 24 * 60;
      minutes += QUARTER_MINUTES
    ) {

      const hour24 =
        Math.floor( minutes / 60 );


      const minute =
        minutes % 60;


      const value =
        String( hour24 )
          .padStart( 2, '0' ) +
        ':' +
        String( minute )
          .padStart( 2, '0' );


      const option =
        document
          .createElement( 'button' );


      option.type = 'button';

      option.className =
        'time-wheel-option';

      option.dataset.value = value;

      option.textContent =
        formatClockLabel(
          hour24,
          minute
        );


      if ( value === current ) {

        option.classList
          .add( 'is-current' );

        selected = option;

      }


      option
        .addEventListener(
          'click',
          (clickEvent) => {

            clickEvent.preventDefault();

            clickEvent.stopPropagation();


            writeTimeControl(
              id,
              value
            );


            $(id + 'Time')
              .dispatchEvent(
                new Event(
                  'input',
                  {
                    bubbles:
                      true
                  }
                )
              );


            closeTimeWheel();

          }
        );


      list.appendChild( option );

    }


    control.appendChild( list );


    /*
      Open on the current value so the wheel
      starts where the field already is.
    */

    if ( selected ) {

      list.scrollTop =
        selected.offsetTop -
        list.clientHeight / 2 +
        selected.offsetHeight / 2;

    } else {

      /*
        No value yet: start the list at a
        plausible teaching hour rather than
        midnight.
      */

      list.scrollTop =
        ( 15 * 60 / QUARTER_MINUTES ) *
        32 -
        list.clientHeight / 2;

    }


    state.openTimeWheel = id;

  }


  function closeTimeWheel() {

    document
      .querySelectorAll(
        '.time-wheel'
      )
      .forEach(
        (node) => {

          node.remove();

        }
      );


    state.openTimeWheel = null;

  }


  function formatClockLabel(
    hour24,
    minute
  ) {

    const hour =
      hour24 % 12 === 0
        ? 12
        : hour24 % 12;


    return (
      hour +
      ':' +
      String( minute )
        .padStart( 2, '0' ) +
      ' ' +
      ( hour24 >= 12
        ? 'PM'
        : 'AM' )
    );

  }




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


    setDateTimeValue(
      'requestStart',
      minuteKeyToLocalDateTime(
        start
      )
    );


    setDateTimeValue(
      'requestEnd',
      minuteKeyToLocalDateTime(
        start +
        60
      )
    );


    $('requestError')
      .textContent =
        '';


    resetRecurrenceControls(
      $('requestModal')
    );


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


    let recurrence;


    try {

      recurrence =
        getRecurrenceFromForm(
          $('requestModal')
        );

    } catch (error) {

      $('requestError')
        .textContent =
          error.message;


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

              recurrence,

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



  function formatLabel(
    request
  ) {

    return request.format ===
      'ONLINE'
      ? 'Online'
      : 'In-Person';

  }



  /*
    The calendar card shows the title, so the
    title carries who this is and how it is
    run. The subject is detail behind that,
    which is what notes are for.
  */

  function buildSessionTitle(
    request
  ) {

    return [
      request.name,

      formatLabel(
        request
      ),

      'Tutoring'
    ]
      .join(' ');

  }



  /*
    Requests made before the form offered
    full weekly options carry a plain repeat
    flag instead of a recurrence, so both
    shapes are read here.
  */

  function requestRecurrence(
    request
  ) {

    if (
      request.recurrence
    ) {

      return request.recurrence;

    }


    if (
      request.repeat !==
      'WEEKLY'
    ) {

      return null;

    }


    return {
      frequency:
        'WEEKLY',

      interval:
        1,

      weekdays: [
        new Date(
          request.start
        )
          .getDay()
      ],

      endType:
        'NEVER'
    };

  }



  function describeRepeat(
    request
  ) {

    const recurrence =
      requestRecurrence(
        request
      );


    if (
      !recurrence
    ) {

      return 'One time';

    }


    const every =
      recurrence.interval >
      1
        ? `Every ${recurrence.interval} weeks`
        : 'Weekly';


    if (
      recurrence.endType ===
      'ON'
    ) {

      return `${every} until ${recurrence.until}`;

    }


    if (
      recurrence.endType ===
      'COUNT'
    ) {

      return `${every}, ${recurrence.count} times`;

    }


    return every;

  }



  function describeRequest(
    request
  ) {

    return [
      request.subject,

      formatLabel(
        request
      ),

      describeRepeat(
        request
      )
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

    closeRequestDrawer();


    openEventModal({

      type:
        'BLOCKED',

      title:
        buildSessionTitle(
          request
        ),

      notes:
        request.subject,

      start:
        request.start,

      end:
        request.end,

      recurrence:
        requestRecurrence(
          request
        )

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


  /*
    The admin editor and the public request
    form offer the same weekly options, so
    they share these helpers. Each one is
    given the form it should work inside,
    and finds the controls by role rather
    than by id, because the two forms cannot
    share ids.
  */

  function repeatTypeField(
    root
  ) {

    return root.querySelector(
      '[data-repeat-type]'
    );

  }



  function getSelectedWeekdays(
    root
  ) {

    return [
      ...root.querySelectorAll(
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
    root,
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


    root
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



  function getStartWeekday(
    root
  ) {

    const key =
      localDateTimeToMinuteKey(
        root.querySelector(
          '[data-recurrence-start]'
        )
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



  function selectStartWeekday(
    root
  ) {

    setSelectedWeekdays(
      root,
      [
        getStartWeekday(
          root
        )
      ]
    );

  }



  function getRepeatEndType(
    root
  ) {

    return (
      root.querySelector(
        'input[data-repeat-end]:checked'
      )?.value ||
      'NEVER'
    );

  }



  function setRepeatEndType(
    root,
    type
  ) {

    const radio =
      root.querySelector(
        `input[data-repeat-end][value="${type}"]`
      );


    if (
      radio
    ) {

      radio.checked =
        true;

    }

  }



  function updateRecurrenceUI(
    root
  ) {

    const weekly =
      repeatTypeField(
        root
      )
        .value ===
      'WEEKLY';


    root.querySelector(
      '.recurrence-panel'
    )
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
      getRepeatEndType(
        root
      );


    root.querySelector(
      '[data-repeat-end-date]'
    )
      .disabled =
        endType !==
        'ON';


    root.querySelector(
      '[data-repeat-count]'
    )
      .disabled =
        endType !==
        'COUNT';

  }



  /*
    Reset the panel to a sensible starting
    point: not repeating, and if it is turned
    on, on the day already chosen.
  */

  function resetRecurrenceControls(
    root
  ) {

    repeatTypeField(
      root
    )
      .value =
        'NONE';


    root.querySelector(
      '[data-repeat-interval]'
    )
      .value =
        1;


    setSelectedWeekdays(
      root,
      [
        getStartWeekday(
          root
        )
      ]
    );


    setRepeatEndType(
      root,
      'NEVER'
    );


    root.querySelector(
      '[data-repeat-end-date]'
    )
      .value =
        '';


    root.querySelector(
      '[data-repeat-count]'
    )
      .value =
        10;


    updateRecurrenceUI(
      root
    );

  }



  function bindRecurrenceControls(
    root,
    onChange
  ) {

    const changed =
      () => {

        if (
          onChange
        ) {

          onChange();

        }

      };


    const defaultWeekday =
      () => {

        if (
          repeatTypeField(
            root
          )
            .value ===
            'WEEKLY' &&
          getSelectedWeekdays(
            root
          ).length === 0
        ) {

          selectStartWeekday(
            root
          );

        }

      };


    repeatTypeField(
      root
    )
      .addEventListener(
        'change',
        () => {

          defaultWeekday();

          updateRecurrenceUI(
            root
          );

          changed();

        }
      );


    root
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

              changed();

            }
          );

        }
      );


    root
      .querySelectorAll(
        'input[data-repeat-end]'
      )
      .forEach(
        (radio) => {

          radio.addEventListener(
            'change',
            () => {

              updateRecurrenceUI(
                root
              );

              changed();

            }
          );

        }
      );


    root.querySelector(
      '[data-recurrence-start]'
    )
      .addEventListener(
        'change',
        defaultWeekday
      );

  }


  function getRecurrenceFromForm(
    root
  ) {

    if (
      repeatTypeField(
        root
      )
        .value ===
      'NONE'
    ) {

      return null;

    }


    const weekdays =
      getSelectedWeekdays(
        root
      );


    if (
      !weekdays.length
    ) {

      throw new Error(
        'Select at least one day of the week.'
      );

    }


    const interval =
      Number(
        root.querySelector(
          '[data-repeat-interval]'
        )
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
      getRepeatEndType(
        root
      );


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
        !root.querySelector(
          '[data-repeat-end-date]'
        )
          .value
      ) {

        throw new Error(
          'Choose the date when the recurring event should end.'
        );

      }


      recurrence.until =
        root.querySelector(
          '[data-repeat-end-date]'
        )
          .value;

    }


    if (
      endType ===
      'COUNT'
    ) {

      const count =
        Number(
          root.querySelector(
            '[data-repeat-count]'
          )
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
    event,
    occurrence
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


    /*
      Which week's card opened this editor, when one did. The scoped
      delete inside the modal needs the clicked date, because "just
      this block" means the block that was clicked, not the week the
      series happens to start in.
    */

    state.editingOccurrence =
      occurrence ||
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


    setDateTimeValue(
      'eventStart',
      originalStart
    );


    setDateTimeValue(
      'eventEnd',
      originalEnd
    );


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
        $('eventModal'),
        recurrence.weekdays ||
        []
      );


      setRepeatEndType(
        $('eventModal'),
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


      setSelectedWeekdays(
        $('eventModal'),
        [
          getStartWeekday(
            $('eventModal')
          )
        ]
      );


      setRepeatEndType(
        $('eventModal'),
        'NEVER'
      );


      $('repeatEndDate')
        .value =
          '';


      $('repeatCount')
        .value =
          10;

    }


    updateRecurrenceUI(
      $('eventModal')
    );


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
        getRecurrenceFromForm(
          $('eventModal')
        );

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
      The modal's Delete on a series opens the same three-way choice
      the right-click menu offers, so both roads behave identically.
      The stored master supplies the truth about the series; the
      clicked occurrence, remembered when the editor opened, names
      which block "just this one" means.
    */

    if ( recurring ) {

      const original =
        getOriginalEvent({
          id
        });


      if ( original?.recurrence ) {

        const acted =
          await confirmScopedDelete(
            original,
            state.editingOccurrence ||
            original
          );


        if ( acted ) {

          closeModal(
            'eventModal'
          );

        }


        return;

      }

    }


    const wanted =
      await siteConfirm(
        recurring
          ? 'Delete this entire recurring series?'
          : 'Delete this event?',
        $('eventTitle')
          .value ||
        ''
      );


    if ( !wanted ) {

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



  /*
    Two timestamps are easy to confuse: when
    the tutor last changed the schedule, and
    when this page last asked for it. The
    first names the person, the second is
    relative and borrows the Refresh button's
    wording, so neither can be read as the
    other.
  */

  function renderCheckedLabel() {

    if (
      !state.lastLoadedAt
    ) {

      $('checkedLabel')
        .textContent =
          '';


      return;

    }


    const minutes =
      Math.floor(
        (
          Date.now() -
          state.lastLoadedAt
        ) /
        60000
      );


    if (
      minutes <
      1
    ) {

      $('checkedLabel')
        .textContent =
          'Refreshed just now';


      return;

    }


    if (
      minutes <
      60
    ) {

      $('checkedLabel')
        .textContent =
          `Refreshed ${minutes} min ago`;


      return;

    }


    $('checkedLabel')
      .textContent =
        'Refreshed at ' +
        new Date(
          state.lastLoadedAt
        )
          .toLocaleTimeString(
            undefined,
            {
              hour:
                'numeric',

              minute:
                '2-digit'
            }
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