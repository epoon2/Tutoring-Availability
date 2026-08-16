import {
  getStore
} from "@netlify/blobs";

import crypto from "node:crypto";


const STORE_NAME =
  "tutoring-availability";


const EVENTS_KEY =
  "events-v2";


const LEGACY_EVENTS_KEY =
  "events-v1";


export default async (req) => {

  try {

    const url =
      new URL(
        req.url
      );


    const route =
      url.pathname.replace(
        /^\/api/,
        ""
      ) ||
      "/";


    /*
      GET EVENTS
    */

    if (
      req.method === "GET" &&
      (
        route === "/" ||
        route === "/events"
      )
    ) {

      const admin =
        hasValidAdminPassword(
          req
        );


      const events =
        await readEvents();


      const startDate =
        url.searchParams.get(
          "start"
        );


      const endDate =
        url.searchParams.get(
          "end"
        );


      if (
        startDate
      ) {

        validateDate(
          startDate
        );

      }


      if (
        endDate
      ) {

        validateDate(
          endDate
        );

      }


      const rangeStart =
        startDate
          ? localDateTimeToMinuteKey(
              `${startDate}T00:00`
            )
          : -Infinity;


      const rangeEnd =
        endDate
          ? localDateTimeToMinuteKey(
              `${
                addDaysToDate(
                  endDate,
                  1
                )
              }T00:00`
            )
          : Infinity;


      const ranged =
        expandEventsForRange(
          events,
          rangeStart,
          rangeEnd
        );


      /*
        Use overall last update,
        not only the currently displayed week.
      */

      const lastUpdated =
        events.reduce(
          (
            latest,
            event
          ) =>
            (
              event.updatedAt &&
              event.updatedAt >
              latest
            )
              ? event.updatedAt
              : latest,
          ""
        );


      return json({

        mode:
          admin
            ? "admin"
            : "public",

        config:
          getConfig(),

        events:
          admin
            ? ranged
            : buildPublicSchedule(
                ranged
              ),

        lastUpdated

      });

    }


    /*
      ADMIN LOGIN
    */

    if (
      req.method === "POST" &&
      route === "/login"
    ) {

      requireAdmin(
        req
      );


      return json({
        ok:
          true
      });

    }


    /*
      CREATE / UPDATE EVENT
    */

    if (
      req.method === "POST" &&
      route === "/events"
    ) {

      requireAdmin(
        req
      );


      const body =
        await req.json();


      const forceConflict =
        body?.forceConflict ===
        true;


      const incoming =
        validateEvent(
          body
        );


      const events =
        await readEvents();


      const id =
        incoming.id ||
        crypto.randomUUID();


      const index =
        events.findIndex(
          (event) =>
            event.id ===
            id
        );


      if (
        incoming.id &&
        index < 0
      ) {

        return json(
          {
            error:
              "That event no longer exists. Refresh and try again."
          },
          404
        );

      }


      /*
        Check for overlapping blocked
        sessions before saving.
      */

      const conflictResult =
        findBlockedConflicts(
          incoming,
          events
        );


      if (
        !forceConflict &&
        conflictResult.total >
        0
      ) {

        return json(
          {
            code:
              "BLOCKED_CONFLICT",

            error:
              "This event overlaps an existing blocked session.",

            totalConflicts:
              conflictResult.total,

            conflicts:
              conflictResult.conflicts
          },
          409
        );

      }


      const now =
        new Date()
          .toISOString();


      const nextEvent = {
        ...incoming,

        id,

        updatedAt:
          now
      };


      if (
        index >= 0
      ) {

        events[
          index
        ] =
          nextEvent;

      } else {

        events.push(
          nextEvent
        );

      }


      await writeEvents(
        events
      );


      return json({
        id,
        updatedAt:
          now
      });

    }


    /*
      DELETE EVENT / SERIES
    */

    if (
      req.method === "DELETE" &&
      route.startsWith(
        "/events/"
      )
    ) {

      requireAdmin(
        req
      );


      const id =
        decodeURIComponent(
          route.slice(
            "/events/".length
          )
        );


      const events =
        await readEvents();


      const next =
        events.filter(
          (event) =>
            event.id !==
            id
        );


      if (
        next.length ===
        events.length
      ) {

        return json(
          {
            error:
              "That event no longer exists."
          },
          404
        );

      }


      await writeEvents(
        next
      );


      return json({
        ok:
          true
      });

    }


    return json(
      {
        error:
          "Not found."
      },
      404
    );


  } catch (err) {

    console.error(
      err
    );


    const status =
      err?.status ||
      500;


    return json(
      {
        error:
          status ===
          500
            ? "Something went wrong on the server."
            : err.message
      },
      status
    );

  }

};


/*
  CONFIG
*/

function getConfig() {

  return {
    portalTitle:
      process.env.PORTAL_TITLE ||
      "Ethan's Tutoring Availability",
      
    timezoneLabel:
      process.env.TIMEZONE_LABEL ||
      "Pacific Time (PT)",

    timezoneId:
      "America/Los_Angeles",

    dayStart:
      8,

    dayEnd:
      24
  };

}


/*
  STORAGE
*/

async function readEvents() {

  const store =
    getStore(
      STORE_NAME
    );


  const current =
    await store.get(
      EVENTS_KEY,
      {
        type:
          "json",

        consistency:
          "strong"
      }
    );


  if (
    Array.isArray(
      current
    )
  ) {

    return current.map(
      normalizeStoredEvent
    );

  }


  /*
    Migrate original event format.
  */

  const legacy =
    await store.get(
      LEGACY_EVENTS_KEY,
      {
        type:
          "json",

        consistency:
          "strong"
      }
    );


  if (
    !Array.isArray(
      legacy
    ) ||
    legacy.length ===
    0
  ) {

    return [];

  }


  const migrated =
    legacy
      .map(
        migrateLegacyEvent
      )
      .filter(
        Boolean
      );


  await store.setJSON(
    EVENTS_KEY,
    migrated
  );


  return migrated;

}


async function writeEvents(
  events
) {

  const store =
    getStore(
      STORE_NAME
    );


  await store.setJSON(
    EVENTS_KEY,
    events
  );

}


function normalizeStoredEvent(
  event
) {

  return {
    ...event,

    recurrence:
      event.recurrence ||
      null
  };

}


/*
  MIGRATE OLD date/startMin/endMin DATA
*/

function migrateLegacyEvent(
  event
) {

  try {

    if (
      !event?.date
    ) {

      return null;

    }


    const startMin =
      Number(
        event.startMin
      );


    const endMin =
      Number(
        event.endMin
      );


    if (
      !Number.isFinite(
        startMin
      ) ||
      !Number.isFinite(
        endMin
      )
    ) {

      return null;

    }


    return {
      id:
        String(
          event.id ||
          crypto.randomUUID()
        ),

      type:
        String(
          event.type ||
          "AVAILABLE"
        ).toUpperCase(),

      title:
        String(
          event.title ||
          ""
        ),

      start:
        dateAndMinutesToLocalDateTime(
          event.date,
          startMin
        ),

      end:
        dateAndMinutesToLocalDateTime(
          event.date,
          endMin
        ),

      notes:
        String(
          event.notes ||
          ""
        ),

      recurrence:
        null,

      updatedAt:
        String(
          event.updatedAt ||
          new Date()
            .toISOString()
        )
    };

  } catch {

    return null;

  }

}


/*
  AUTH
*/

function requireAdmin(
  req
) {

  if (
    !process.env.ADMIN_PASSWORD
  ) {

    const error =
      new Error(
        "ADMIN_PASSWORD is not configured in Netlify."
      );


    error.status =
      503;


    throw error;

  }


  if (
    !hasValidAdminPassword(
      req
    )
  ) {

    const error =
      new Error(
        "Incorrect admin password."
      );


    error.status =
      401;


    throw error;

  }

}


function hasValidAdminPassword(
  req
) {

  const expected =
    process.env.ADMIN_PASSWORD ||
    "";


  const supplied =
    req.headers.get(
      "x-admin-password"
    ) ||
    "";


  if (
    !expected ||
    !supplied
  ) {

    return false;

  }


  const expectedBuffer =
    Buffer.from(
      expected
    );


  const suppliedBuffer =
    Buffer.from(
      supplied
    );


  return (
    expectedBuffer.length ===
      suppliedBuffer.length &&
    crypto.timingSafeEqual(
      expectedBuffer,
      suppliedBuffer
    )
  );

}


/*
  EVENT VALIDATION
*/

function validateEvent(
  event
) {

  if (
    !event ||
    typeof event !==
    "object"
  ) {

    bad(
      "Invalid event."
    );

  }


  const type =
    String(
      event.type ||
      ""
    ).toUpperCase();


  if (
    ![
      "AVAILABLE",
      "BLOCKED"
    ].includes(
      type
    )
  ) {

    bad(
      "Event type must be AVAILABLE or BLOCKED."
    );

  }


  const start =
    normalizeLocalDateTime(
      event.start
    );


  const end =
    normalizeLocalDateTime(
      event.end
    );


  const startKey =
    localDateTimeToMinuteKey(
      start
    );


  const endKey =
    localDateTimeToMinuteKey(
      end
    );


  if (
    startKey ==
      null ||
    endKey ==
      null
  ) {

    bad(
      "Invalid start or end date/time."
    );

  }


  if (
    endKey <=
    startKey
  ) {

    bad(
      "End date/time must be after start date/time."
    );

  }


  const recurrence =
    validateRecurrence(
      event.recurrence,
      start
    );


  return {
    id:
      event.id
        ? String(
            event.id
          )
        : "",

    type,

    title:
      String(
        event.title ||
        ""
      )
        .trim()
        .slice(
          0,
          100
        ),

    start,

    end,

    notes:
      String(
        event.notes ||
        ""
      )
        .trim()
        .slice(
          0,
          500
        ),

    recurrence
  };

}


/*
  RECURRENCE VALIDATION
*/

function validateRecurrence(
  recurrence,
  start
) {

  if (
    !recurrence
  ) {

    return null;

  }


  if (
    recurrence.frequency !==
    "WEEKLY"
  ) {

    bad(
      "Unsupported recurrence type."
    );

  }


  const interval =
    Number(
      recurrence.interval ||
      1
    );


  if (
    !Number.isInteger(
      interval
    ) ||
    interval < 1 ||
    interval > 52
  ) {

    bad(
      "Invalid weekly repeat interval."
    );

  }


  const weekdays =
    [
      ...new Set(
        (
          recurrence.weekdays ||
          []
        ).map(
          Number
        )
      )
    ]
      .filter(
        (day) =>
          Number.isInteger(
            day
          ) &&
          day >=
            0 &&
          day <=
            6
      )
      .sort(
        (a, b) =>
          a -
          b
      );


  if (
    !weekdays.length
  ) {

    bad(
      "Select at least one repeat day."
    );

  }


  const endType =
    [
      "NEVER",
      "ON",
      "COUNT"
    ].includes(
      recurrence.endType
    )
      ? recurrence.endType
      : "NEVER";


  const result = {
    frequency:
      "WEEKLY",

    interval,

    weekdays,

    endType
  };


  if (
    endType ===
    "ON"
  ) {

    validateDate(
      recurrence.until
    );


    if (
      recurrence.until <
      start.slice(
        0,
        10
      )
    ) {

      bad(
        "Recurrence end date cannot be before the event starts."
      );

    }


    result.until =
      recurrence.until;

  }


  if (
    endType ===
    "COUNT"
  ) {

    const count =
      Number(
        recurrence.count
      );


    if (
      !Number.isInteger(
        count
      ) ||
      count < 1 ||
      count > 999
    ) {

      bad(
        "Invalid occurrence count."
      );

    }


    result.count =
      count;

  }


  return result;

}


/*
  EXPAND EVENTS FOR REQUESTED RANGE
*/

function expandEventsForRange(
  events,
  rangeStart,
  rangeEnd
) {

  const output =
    [];


  for (
    const event of events
  ) {

    if (
      !event.recurrence ||
      event.recurrence.frequency !==
        "WEEKLY"
    ) {

      const start =
        localDateTimeToMinuteKey(
          event.start
        );


      const end =
        localDateTimeToMinuteKey(
          event.end
        );


      if (
        start <
          rangeEnd &&
        end >
          rangeStart
      ) {

        output.push({
          ...event,

          masterId:
            event.id
        });

      }


      continue;

    }


    output.push(
      ...expandWeeklyEvent(
        event,
        rangeStart,
        rangeEnd
      )
    );

  }


  return output.sort(
    sortEvents
  );

}


/*
  WEEKLY RECURRENCE
*/

function expandWeeklyEvent(
  event,
  rangeStart,
  rangeEnd
) {

  const recurrence =
    event.recurrence;


  const seriesStart =
    localDateTimeToMinuteKey(
      event.start
    );


  const seriesEnd =
    localDateTimeToMinuteKey(
      event.end
    );


  const duration =
    seriesEnd -
    seriesStart;


  const startDate =
    event.start.slice(
      0,
      10
    );


  const startDayKey =
    localDateTimeToMinuteKey(
      `${startDate}T00:00`
    );


  const startTime =
    seriesStart -
    startDayKey;


  const startWeekday =
    new Date(
      startDayKey *
      60000
    ).getUTCDay();


  const anchorWeek =
    startDayKey -
    startWeekday *
    1440;


  let untilExclusive =
    Infinity;


  if (
    recurrence.endType ===
    "ON"
  ) {

    untilExclusive =
      localDateTimeToMinuteKey(
        `${
          addDaysToDate(
            recurrence.until,
            1
          )
        }T00:00`
      );

  }


  const weekdays =
    [
      ...recurrence.weekdays
    ].sort(
      (a, b) =>
        a -
        b
    );


  const output =
    [];


  let occurrenceNumber =
    0;


  /*
    10,000 recurrence cycles is far
    more than needed for this portal.
  */

  for (
    let cycle = 0;
    cycle < 10000;
    cycle++
  ) {

    const weekStart =
      anchorWeek +
      cycle *
      recurrence.interval *
      7 *
      1440;


    if (
      recurrence.endType !==
        "COUNT" &&
      weekStart >
        rangeEnd +
        7 *
        1440
    ) {

      break;

    }


    for (
      const weekday of weekdays
    ) {

      const occurrenceStart =
        weekStart +
        weekday *
        1440 +
        startTime;


      if (
        occurrenceStart <
        seriesStart
      ) {

        continue;

      }


      if (
        occurrenceStart >=
        untilExclusive
      ) {

        return output;

      }


      occurrenceNumber++;


      if (
        recurrence.endType ===
          "COUNT" &&
        occurrenceNumber >
          recurrence.count
      ) {

        return output;

      }


      const occurrenceEnd =
        occurrenceStart +
        duration;


      if (
        occurrenceStart <
          rangeEnd &&
        occurrenceEnd >
          rangeStart
      ) {

        output.push({
          ...event,

          masterId:
            event.id,

          start:
            minuteKeyToLocalDateTime(
              occurrenceStart
            ),

          end:
            minuteKeyToLocalDateTime(
              occurrenceEnd
            ),

          seriesStart:
            event.start,

          seriesEnd:
            event.end,

          occurrenceStart:
            minuteKeyToLocalDateTime(
              occurrenceStart
            )
        });

      }


      if (
        recurrence.endType ===
          "COUNT" &&
        occurrenceNumber >=
          recurrence.count
      ) {

        return output;

      }

    }

  }


  return output;

}


/*
  CONFLICT DETECTION

  Checks whether the event being
  saved overlaps an existing
  BLOCKED event.

  Recurring events are checked
  up to one year forward.
*/

function findBlockedConflicts(
  incoming,
  storedEvents
) {

  const incomingStart =
    localDateTimeToMinuteKey(
      incoming.start
    );


  const incomingEnd =
    localDateTimeToMinuteKey(
      incoming.end
    );


  let rangeEnd =
    incoming.recurrence
      ? incomingStart +
        366 *
        1440
      : incomingEnd;


  if (
    incoming.recurrence?.endType ===
    "ON"
  ) {

    const recurrenceEnd =
      localDateTimeToMinuteKey(
        `${
          addDaysToDate(
            incoming.recurrence.until,
            1
          )
        }T00:00`
      );


    rangeEnd =
      Math.min(
        rangeEnd,
        recurrenceEnd
      );

  }


  const candidates =
    expandEventsForRange(
      [
        {
          ...incoming,

          id:
            incoming.id ||
            "__candidate__"
        }
      ],
      incomingStart,
      rangeEnd
    );


  /*
    Do not compare an edited event
    against itself.
  */

  const blockedMasters =
    storedEvents.filter(
      (event) =>
        event.type ===
          "BLOCKED" &&
        (
          !incoming.id ||
          event.id !==
            incoming.id
        )
    );


  if (
    !blockedMasters.length
  ) {

    return {
      total:
        0,

      conflicts:
        []
    };

  }


  const blockedOccurrences =
    expandEventsForRange(
      blockedMasters,
      incomingStart,
      rangeEnd
    );


  const conflicts =
    [];


  const seen =
    new Set();


  for (
    const candidate of candidates
  ) {

    const candidateStart =
      localDateTimeToMinuteKey(
        candidate.start
      );


    const candidateEnd =
      localDateTimeToMinuteKey(
        candidate.end
      );


    for (
      const blocked of blockedOccurrences
    ) {

      const blockedStart =
        localDateTimeToMinuteKey(
          blocked.start
        );


      const blockedEnd =
        localDateTimeToMinuteKey(
          blocked.end
        );


      if (
        candidateStart <
          blockedEnd &&
        candidateEnd >
          blockedStart
      ) {

        const key =
          `${
            blocked.masterId ||
            blocked.id
          }|${blocked.start}|${candidate.start}`;


        if (
          seen.has(
            key
          )
        ) {

          continue;

        }


        seen.add(
          key
        );


        conflicts.push({
          id:
            blocked.masterId ||
            blocked.id,

          title:
            blocked.title ||
            "Blocked Session",

          start:
            blocked.start,

          end:
            blocked.end,

          overlapStart:
            minuteKeyToLocalDateTime(
              Math.max(
                candidateStart,
                blockedStart
              )
            ),

          overlapEnd:
            minuteKeyToLocalDateTime(
              Math.min(
                candidateEnd,
                blockedEnd
              )
            )
        });

      }

    }

  }


  conflicts.sort(
    (a, b) =>
      localDateTimeToMinuteKey(
        a.start
      ) -
      localDateTimeToMinuteKey(
        b.start
      )
  );


  return {
    total:
      conflicts.length,

    conflicts:
      conflicts.slice(
        0,
        20
      )
  };

}


/*
  PUBLIC SCHEDULE

  Private titles are removed here
  on the server before data is sent
  to public visitors.
*/

function buildPublicSchedule(
  events
) {

  const available =
    mergeIntervals(
      events
        .filter(
          (event) =>
            event.type ===
            "AVAILABLE"
        )
        .map(
          (event) => [
            localDateTimeToMinuteKey(
              event.start
            ),

            localDateTimeToMinuteKey(
              event.end
            )
          ]
        )
    );


  const blocked =
    mergeIntervals(
      events
        .filter(
          (event) =>
            event.type ===
            "BLOCKED"
        )
        .map(
          (event) => [
            localDateTimeToMinuteKey(
              event.start
            ),

            localDateTimeToMinuteKey(
              event.end
            )
          ]
        )
    );


  const open =
    subtractIntervals(
      available,
      blocked
    );


  /*
    Only show blocked sessions publicly
    where they overlap a period that was
    marked as tutoring availability.
  */

  const publicBlocked =
    [];


  for (
    const block of blocked
  ) {

    for (
      const availability of available
    ) {

      const start =
        Math.max(
          block[0],
          availability[0]
        );


      const end =
        Math.min(
          block[1],
          availability[1]
        );


      if (
        start <
        end
      ) {

        publicBlocked.push([
          start,
          end
        ]);

      }

    }

  }


  const mergedPublicBlocked =
    mergeIntervals(
      publicBlocked
    );


  const output =
    [];


  open.forEach(
    (
      range,
      index
    ) => {

      output.push({
        id:
          `public-available-${index}-${range[0]}`,

        type:
          "AVAILABLE",

        title:
          "Available",

        start:
          minuteKeyToLocalDateTime(
            range[0]
          ),

        end:
          minuteKeyToLocalDateTime(
            range[1]
          ),

        notes:
          "",

        recurrence:
          null,

        updatedAt:
          ""
      });

    }
  );


  mergedPublicBlocked.forEach(
    (
      range,
      index
    ) => {

      output.push({
        id:
          `public-blocked-${index}-${range[0]}`,

        type:
          "BLOCKED",

        title:
          "Blocked Session",

        start:
          minuteKeyToLocalDateTime(
            range[0]
          ),

        end:
          minuteKeyToLocalDateTime(
            range[1]
          ),

        notes:
          "",

        recurrence:
          null,

        updatedAt:
          ""
      });

    }
  );


  return output.sort(
    sortEvents
  );

}


/*
  INTERVAL HELPERS
*/

function mergeIntervals(
  intervals
) {

  if (
    !intervals.length
  ) {

    return [];

  }


  const sorted =
    intervals
      .filter(
        (range) =>
          Number.isFinite(
            range[0]
          ) &&
          Number.isFinite(
            range[1]
          ) &&
          range[1] >
          range[0]
      )
      .map(
        (range) => [
          Number(
            range[0]
          ),

          Number(
            range[1]
          )
        ]
      )
      .sort(
        (a, b) =>
          a[0] -
            b[0] ||
          a[1] -
            b[1]
      );


  if (
    !sorted.length
  ) {

    return [];

  }


  const merged = [
    sorted[0].slice()
  ];


  for (
    let i = 1;
    i <
    sorted.length;
    i++
  ) {

    const current =
      sorted[
        i
      ];


    const last =
      merged[
        merged.length -
        1
      ];


    if (
      current[0] <=
      last[1]
    ) {

      last[1] =
        Math.max(
          last[1],
          current[1]
        );

    } else {

      merged.push(
        current.slice()
      );

    }

  }


  return merged;

}


function subtractIntervals(
  available,
  blocked
) {

  let result =
    available.map(
      (range) =>
        range.slice()
    );


  for (
    const block of blocked
  ) {

    const next =
      [];


    for (
      const open of result
    ) {

      if (
        block[1] <=
          open[0] ||
        block[0] >=
          open[1]
      ) {

        next.push(
          open
        );

        continue;

      }


      if (
        block[0] >
        open[0]
      ) {

        next.push([
          open[0],

          Math.min(
            block[0],
            open[1]
          )
        ]);

      }


      if (
        block[1] <
        open[1]
      ) {

        next.push([
          Math.max(
            block[1],
            open[0]
          ),

          open[1]
        ]);

      }

    }


    result =
      next.filter(
        (range) =>
          range[1] >
          range[0]
      );

  }


  return result;

}


function sortEvents(
  a,
  b
) {

  return (
    localDateTimeToMinuteKey(
      a.start
    ) -
      localDateTimeToMinuteKey(
        b.start
      ) ||
    localDateTimeToMinuteKey(
      a.end
    ) -
      localDateTimeToMinuteKey(
        b.end
      )
  );

}


/*
  DATE VALIDATION
*/

function validateDate(
  value
) {

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(
        value ||
        ""
      )
  ) {

    bad(
      "Invalid date."
    );

  }


  if (
    localDateTimeToMinuteKey(
      `${value}T00:00`
    ) ==
    null
  ) {

    bad(
      "Invalid date."
    );

  }

}


function normalizeLocalDateTime(
  value
) {

  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/
      .exec(
        String(
          value ||
          ""
        )
      );


  return match
    ? match[1]
    : String(
        value ||
        ""
      );

}


/*
  YYYY-MM-DDTHH:MM
  TO MINUTE KEY
*/

function localDateTimeToMinuteKey(
  value
) {

  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
      .exec(
        value ||
        ""
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
      "0"
    )}-` +
    `${String(
      date.getUTCDate()
    ).padStart(
      2,
      "0"
    )}T` +
    `${String(
      date.getUTCHours()
    ).padStart(
      2,
      "0"
    )}:` +
    `${String(
      date.getUTCMinutes()
    ).padStart(
      2,
      "0"
    )}`
  );

}


function dateAndMinutesToLocalDateTime(
  dateStr,
  minutes
) {

  const dayStart =
    localDateTimeToMinuteKey(
      `${dateStr}T00:00`
    );


  return minuteKeyToLocalDateTime(
    dayStart +
    minutes
  );

}


function addDaysToDate(
  dateStr,
  amount
) {

  const start =
    localDateTimeToMinuteKey(
      `${dateStr}T00:00`
    );


  return minuteKeyToLocalDateTime(
    start +
    amount *
    1440
  ).slice(
    0,
    10
  );

}


/*
  ERRORS
*/

function bad(
  message
) {

  const error =
    new Error(
      message
    );


  error.status =
    400;


  throw error;

}


/*
  JSON
*/

function json(
  body,
  status = 200
) {

  return Response.json(
    body,
    {
      status,

      headers: {
        "Cache-Control":
          "no-store"
      }
    }
  );

}


/*
  NETLIFY ROUTE
*/

export const config = {
  path:
    "/api/*"
};