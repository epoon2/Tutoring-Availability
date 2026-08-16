import { getStore } from "@netlify/blobs";
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
      new URL(req.url);

    const route =
      url.pathname.replace(
        /^\/api/,
        ""
      ) || "/";

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

      const ranged =
        events
          .filter(
            (e) => {
              const eventStart =
                localDateTimeToMinuteKey(
                  e.start
                );

              const eventEnd =
                localDateTimeToMinuteKey(
                  e.end
                );

              return (
                eventStart <
                  rangeEnd &&
                eventEnd >
                  rangeStart
              );
            }
          )
          .sort(
            sortEvents
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

        lastUpdated:
          ranged.reduce(
            (
              latest,
              e
            ) =>
              e.updatedAt >
              latest
                ? e.updatedAt
                : latest,
            ""
          )
      });
    }

    if (
      req.method === "POST" &&
      route === "/login"
    ) {
      requireAdmin(req);

      return json({
        ok: true
      });
    }

    if (
      req.method === "POST" &&
      route === "/events"
    ) {
      requireAdmin(req);

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

      if (index >= 0) {
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

    if (
      req.method === "DELETE" &&
      route.startsWith(
        "/events/"
      )
    ) {
      requireAdmin(req);

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
    return current;
  }

  /*
    Automatically migrate events
    saved by the original version.
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

function requireAdmin(req) {
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
    a.length === b.length &&
    crypto.timingSafeEqual(
      a,
      b
    )
  );
}

function validateEvent(
  event
) {
  if (
    !event ||
    typeof event !== "object"
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
        )
  };
}

function bad(message) {
  const err =
    new Error(
      message
    );

  err.status =
    400;

  throw err;
}

function buildPublicSchedule(events) {
  const available = mergeIntervals(
    events
      .filter(
        (e) =>
          e.type === "AVAILABLE"
      )
      .map(
        (e) => [
          localDateTimeToMinuteKey(e.start),
          localDateTimeToMinuteKey(e.end)
        ]
      )
  );

  const blocked = mergeIntervals(
    events
      .filter(
        (e) =>
          e.type === "BLOCKED"
      )
      .map(
        (e) => [
          localDateTimeToMinuteKey(e.start),
          localDateTimeToMinuteKey(e.end)
        ]
      )
  );

  /*
    Calculate the portions that remain available
    after blocked sessions are removed.
  */
  const open = subtractIntervals(
    available,
    blocked
  );

  /*
    Only show blocked sessions publicly when they
    overlap a time that was originally marked available.

    This prevents random private events outside your
    tutoring availability from appearing publicly.
  */
  const publicBlocked = [];

  for (const block of blocked) {
    for (const avail of available) {
      const start = Math.max(
        block[0],
        avail[0]
      );

      const end = Math.min(
        block[1],
        avail[1]
      );

      if (start < end) {
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
    Public available sections.
  */
  open.forEach(
    (range, index) => {
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

        updatedAt:
          ""
      });
    }
  );

  /*
    Public blocked sections.

    Notice that the original event title and notes
    are NEVER included.
  */
  mergedPublicBlocked.forEach(
    (range, index) => {
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

        updatedAt:
          ""
      });
    }
  );

  return output.sort(
    (a, b) =>
      localDateTimeToMinuteKey(
        a.start
      ) -
      localDateTimeToMinuteKey(
        b.start
      )
  );
}

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
          Number(x[0]),
          Number(x[1])
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
    i < sorted.length;
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
        next.push(open);
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

function validateDate(
  value
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(
        value || ""
      )
  ) {
    bad(
      "Invalid date range."
    );
  }

  if (
    localDateTimeToMinuteKey(
      `${value}T00:00`
    ) == null
  ) {
    bad(
      "Invalid date range."
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
          value || ""
        )
      );

  return match
    ? match[1]
    : String(
        value || ""
      );
}

function localDateTimeToMinuteKey(
  value
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
      .exec(
        value || ""
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
    ).padStart(2, "0")}-` +
    `${String(
      d.getUTCDate()
    ).padStart(2, "0")}T` +
    `${String(
      d.getUTCHours()
    ).padStart(2, "0")}:` +
    `${String(
      d.getUTCMinutes()
    ).padStart(2, "0")}`
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
    amount * 1440
  ).slice(
    0,
    10
  );
}

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

export const config = {
  path: "/api/*"
};