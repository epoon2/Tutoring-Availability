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


      if (startDate) {
        validateDate(
          startDate
        );
      }


      if (endDate) {
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


      /*
        Expand recurring master events
        into occurrences for this week.
      */

      const ranged =
        expandEventsForRange(
          events,
          rangeStart,
          rangeEnd
        );


      /*
        Determine last update from the
        original master events that have
        an occurrence in this range.
      */

      const lastUpdated =
        ranged.reduce(
          (
            latest,
            e
          ) =>
            (
              e.updatedAt &&
              e.updatedAt >
              latest
            )
              ? e.updatedAt
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


        /*
          Admin receives private titles.

          Public receives only calculated
          availability and anonymized
          blocked sessions.
        */

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
      ADMIN LOGIN CHECK
    */

    if (
      req.method === "POST" &&
      route === "/login"
    ) {

      requireAdmin(
        req
      );


      return json({
        ok: true
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


      const incoming =
        validateEvent(
          await req.json()
        );


      const events =
        await readEvents();


      const now =
        new Date()
          .toISOString();


      const id =
        incoming.id ||
        crypto.randomUUID();


      const nextEvent = {
        ...incoming,
        id,
        updatedAt: now
      };


      const index =
        events.findIndex(
          (e) =>
            e.id === id
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


      if (
        index >= 0
      ) {

        events[index] =
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
        updatedAt: now
      });

    }


    /*
      DELETE EVENT OR ENTIRE
      RECURRING SERIES
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
          (e) =>
            e.id !== id
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
        ok: true
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
          status === 500
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
      "Tutoring Availability",

    timezoneLabel:
      process.env.TIMEZONE_LABEL ||
      "Pacific Time (PT)",

    dayStart: 8,

    dayEnd: 24

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
        type: "json",
        consistency: "strong"
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
    Migrate original startMin/endMin
    event format if needed.
  */

  const legacy =
    await store.get(
      LEGACY_EVENTS_KEY,
      {
        type: "json",
        consistency: "strong"
      }
    );


  if (
    !Array.isArray(
      legacy
    ) ||
    legacy.length === 0
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


/*
  Make older v2 events compatible
  with recurrence field.
*/

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
  MIGRATE V1 EVENTS
*/

function migrateLegacyEvent(
  event
) {

  try {

    if (!event?.date) {
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


    const start =
      dateAndMinutesToLocalDateTime(
        event.date,
        startMin
      );


    const end =
      dateAndMinutesToLocalDateTime(
        event.date,
        endMin
      );


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

      start,

      end,

      notes:
        String(
          event.notes ||
          ""
        ),

      recurrence: null,

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
  AUTHENTICATION
*/

function requireAdmin(
  req
) {

  if (
    !process.env.ADMIN_PASSWORD
  ) {

    const err =
      new Error(
        "ADMIN_PASSWORD is not configured in Netlify yet."
      );


    err.status =
      503;


    throw err;

  }


  if (
    !hasValidAdminPassword(
      req
    )
  ) {

    const err =
      new Error(
        "Incorrect admin password."
      );


    err.status =
      401;


    throw err;

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


  const a =
    Buffer.from(
      expected
    );


  const b =
    Buffer.from(
      supplied
    );


  return (
    a.length ===
      b.length &&
    crypto.timingSafeEqual(
      a,
      b
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
    ].includes(type)
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
    startKey == null ||
    endKey == null
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

  if (!recurrence) {
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
          day >= 0 &&
          day <= 6
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
  EXPAND MASTER EVENTS FOR
  REQUESTED CALENDAR RANGE
*/

function expandEventsForRange(
  events,
  rangeStart,
  rangeEnd
) {

  const output = [];


  for (
    const event of events
  ) {

    /*
      NORMAL ONE-TIME EVENT
    */

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


    /*
      WEEKLY RECURRING EVENT
    */

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
  WEEKLY SERIES EXPANSION

  Example:

  Start Monday 4 PM
  Repeat Monday/Wednesday/Friday

  Produces one occurrence on each
  selected day.
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


  /*
    Sunday = 0
    Monday = 1
    ...
    Saturday = 6
  */

  const startWeekday =
    new Date(
      startDayKey *
      60000
    ).getUTCDay();


  /*
    Beginning of the week containing
    the first event.
  */

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


  const output = [];


  let occurrenceNumber =
    0;


  /*
    Supports up to about 100 years
    of weekly recurrence.
  */

  for (
    let cycle = 0;
    cycle < 5200;
    cycle++
  ) {

    const weekStart =
      anchorWeek +
      cycle *
      recurrence.interval *
      7 *
      1440;


    /*
      Once this recurrence week is
      beyond the requested range,
      we can stop unless we still
      need to count occurrences.

      COUNT series must continue only
      until its count is exhausted.
    */

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


      /*
        Never create an occurrence
        before the original series start.
      */

      if (
        occurrenceStart <
        seriesStart
      ) {

        continue;

      }


      /*
        End-on-date limit.
      */

      if (
        occurrenceStart >=
        untilExclusive
      ) {

        return output;

      }


      occurrenceNumber++;


      /*
        Count limit.
      */

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


      /*
        Only send occurrences that
        overlap the requested week.
      */

      if (
        occurrenceStart <
          rangeEnd &&
        occurrenceEnd >
          rangeStart
      ) {

        output.push({

          /*
            Event details.
          */

          ...event,


          /*
            Keep master ID so clicking
            an occurrence edits/deletes
            the entire series.
          */

          masterId:
            event.id,


          /*
            Each rendered occurrence gets
            the occurrence start/end.
          */

          start:
            minuteKeyToLocalDateTime(
              occurrenceStart
            ),

          end:
            minuteKeyToLocalDateTime(
              occurrenceEnd
            ),


          /*
            Original series values are
            preserved for the editor.
          */

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


      /*
        Optimization for count-based
        series once the count is reached.
      */

      if (
        recurrence.endType ===
          "COUNT" &&
        occurrenceNumber >=
          recurrence.count
      ) {

        return output;

      }

    }


    /*
      Normal series do not need to
      continue searching once we have
      passed the requested range.
    */

    if (
      recurrence.endType !==
        "COUNT" &&
      weekStart >
        rangeEnd
    ) {

      break;

    }

  }


  return output;
}


/*
  PUBLIC SCHEDULE

  Public sees:
  green availability
  red "Blocked Session"

  Private titles and notes are never
  included in this response.
*/

function buildPublicSchedule(
  events
) {

  /*
    Merge all availability.
  */

  const available =
    mergeIntervals(
      events
        .filter(
          (e) =>
            e.type ===
            "AVAILABLE"
        )
        .map(
          (e) => [
            localDateTimeToMinuteKey(
              e.start
            ),

            localDateTimeToMinuteKey(
              e.end
            )
          ]
        )
    );


  /*
    Merge blocked sessions.
  */

  const blocked =
    mergeIntervals(
      events
        .filter(
          (e) =>
            e.type ===
            "BLOCKED"
        )
        .map(
          (e) => [
            localDateTimeToMinuteKey(
              e.start
            ),

            localDateTimeToMinuteKey(
              e.end
            )
          ]
        )
    );


  /*
    Availability minus blocked sessions.
  */

  const open =
    subtractIntervals(
      available,
      blocked
    );


  /*
    Only display blocked sessions publicly
    where they overlap an availability
    period.

    Example:

    Available 7:30-12
    Blocked 8:30-9:30

    Public gets:
    7:30-8:30 Available
    8:30-9:30 Blocked Session
    9:30-12 Available
  */

  const publicBlocked = [];


  for (
    const block of blocked
  ) {

    for (
      const avail of available
    ) {

      const start =
        Math.max(
          block[0],
          avail[0]
        );


      const end =
        Math.min(
          block[1],
          avail[1]
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


  const output = [];


  /*
    Available sections.
  */

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


  /*
    Anonymized blocked sections.
  */

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
  INTERVAL UTILITIES
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
        (x) =>
          Number.isFinite(
            x[0]
          ) &&
          Number.isFinite(
            x[1]
          ) &&
          x[1] >
          x[0]
      )
      .map(
        (x) => [
          Number(
            x[0]
          ),

          Number(
            x[1]
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
      sorted[i];


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
      (x) =>
        x.slice()
    );


  for (
    const block of blocked
  ) {

    const next = [];


    for (
      const open of result
    ) {

      /*
        No overlap.
      */

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


      /*
        Portion before block.
      */

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


      /*
        Portion after block.
      */

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
        (x) =>
          x[1] >
          x[0]
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
  DATE/TIME TO INTEGER MINUTE KEY
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


  if (!match) {
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
      key *
      60000
    );


  return (
    `${d.getUTCFullYear()}-` +

    `${String(
      d.getUTCMonth() +
      1
    ).padStart(
      2,
      "0"
    )}-` +

    `${String(
      d.getUTCDate()
    ).padStart(
      2,
      "0"
    )}T` +

    `${String(
      d.getUTCHours()
    ).padStart(
      2,
      "0"
    )}:` +

    `${String(
      d.getUTCMinutes()
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

  const err =
    new Error(
      message
    );


  err.status =
    400;


  throw err;

}


/*
  JSON RESPONSE
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
  path: "/api/*"
};