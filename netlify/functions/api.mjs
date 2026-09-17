import {
  getStore
} from "@netlify/blobs";

import {
  purgeCache
} from "@netlify/functions";

import crypto from "node:crypto";

import {
  feedTokenIsValid,
  buildIcs,
  FEED_WEEKS_BACK,
  FEED_WEEKS_AHEAD
} from "./feeds.mjs";

import {
  googleSyncConfigured,
  mirrorSavedEvent,
  mirrorDifference,
  resyncAll
} from "./googlesync.mjs";

import {
  mailConfigured,
  sendMail,
  requestNotification,
  verificationEmail,
  resetEmail
} from "./mail.mjs";
import {
  VERIFY_HOURS,
  RESET_HOURS,
  emailIsValid,
  normalizeEmail,
  passwordMatches,
  passwordProblem,
  hashPassword,
  issueSession,
  readUser,
  findUserByEmail,
  writeUser,
  createUser,
  userFromRequest,
  issueToken,
  consumeToken,
  clientAddress,
  rateLimit,
  slugify,
  slugIsValid,
  claimSlug,
  calendarForSlug
} from "./accounts.mjs";
import {
  recordBeforeWrite,
  applyUndo,
  applyRedo,
  summarizeHistory,
  listHistory,
  findRemovedEvent
} from "./history.mjs";


const STORE_NAME =
  "tutoring-availability";

const EVENTS_CACHE_TAG = "events";

const TIMEZONE_ID =
  "America/Los_Angeles";


const EVENTS_KEY =
  "events-v2";


const LEGACY_EVENTS_KEY =
  "events-v1";


const REQUESTS_KEY =
  "requests-v1";


/*
  Custom colours the admin has used, oldest first, so a colour picked
  once is a preset next time - the way a document keeps its own
  custom colours.
*/
const SETTINGS_KEY =
  "settings-v1";

const MAX_CUSTOM_COLORS =
  16;

const HISTORY_KEY =
  "history-v1";

/*
  The submit endpoint is open to anyone, so the queue is bounded
  rather than left to grow with whatever arrives.
*/

const MAX_STORED_REQUESTS =
  100;

const MAX_REQUEST_MINUTES =
  8 * 60;


/*
  CALENDARS

  Every account owns one calendar. The first calendar - the one the
  site ran with before there were accounts - is "main" and keeps its
  original storage keys, so nothing already saved moves; every later
  calendar keeps its records under cal/<id>/. A request names its
  calendar by slug (?calendar=ethan); with none it means main, which
  is what older links and the feed expect.
*/

const MAIN_CALENDAR_ID =
  "main";

let activeCalendar =
  { id: MAIN_CALENDAR_ID, slug: null };

/*
  The signed-in account behind the request's session header, if any.
*/
let activeUser =
  null;

function storageKey(
  name
) {
  return activeCalendar.id === MAIN_CALENDAR_ID
    ? name
    : `cal/${ activeCalendar.id }/${ name }`;
}

function cacheTag() {
  return activeCalendar.id === MAIN_CALENDAR_ID
    ? EVENTS_CACHE_TAG
    : `cal-${ activeCalendar.id }`;
}

/*
  Which calendar a request is about. An unknown slug is a 404 for
  everything but the account routes, which belong to no calendar.
*/
async function resolveCalendar(
  store,
  slug
) {
  if ( !slug ) {
    return { id: MAIN_CALENDAR_ID, slug: null };
  }
  const id =
    await calendarForSlug( store, slug );
  if ( id ) {
    return { id, slug };
  }
  /*
    Main's address is not indexed until someone asks for it, so the
    first request to /ethan claims it from the display name.
  */
  const mainSlug =
    await ensureMainSlug( store );
  return mainSlug === slug
    ? { id: MAIN_CALENDAR_ID, slug }
    : null;
}

async function ensureMainSlug(
  store
) {
  const stored =
    await store.get( SETTINGS_KEY, { type: "json", consistency: "strong" } ) || {};
  if ( stored.slug ) {
    return stored.slug;
  }
  const wanted =
    slugify( settingsFrom( stored ).displayName ) || "calendar";
  const slug =
    await claimSlug( store, wanted, MAIN_CALENDAR_ID );
  await store.setJSON( SETTINGS_KEY, { ...stored, slug } );
  return slug;
}


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


    const store =
      getStore(
        STORE_NAME
      );


    /*
      Who is asking, and about which calendar. The account routes
      come first: they belong to no calendar and must work even when
      the address in the query is stale.
    */
    activeUser =
      await userFromRequest(
        store,
        req
      );


    if (
      route === "/site" ||
      route === "/signup" ||
      route === "/login" ||
      route === "/me" ||
      route === "/verify" ||
      route === "/resend" ||
      route === "/forgot" ||
      route === "/reset" ||
      route === "/account/password"
    ) {
      activeCalendar =
        { id: MAIN_CALENDAR_ID, slug: null };
      useSettings(
        await readSettings()
      );
      const handled =
        await handleAccountRoute(
          req,
          route,
          url,
          store
        );
      if ( handled ) {
        return handled;
      }
    }


    const calendar =
      await resolveCalendar(
        store,
        (
          url.searchParams.get( "calendar" ) ||
          req.headers.get( "x-calendar" ) ||
          ""
        ).trim().toLowerCase()
      );


    if (
      !calendar
    ) {
      return json(
        {
          error:
            "There is no calendar at this address.",
          missing:
            true
        },
        404
      );
    }


    activeCalendar =
      calendar;


    /*
      The calendar's settings shape everything below - hours, colours,
      wording, time zone - so they are read before the route is.
    */
    useSettings(
      await readSettings()
    );


    /*
      A calendar whose owner has not confirmed their email is not
      public yet: the owner sees it, nobody else does. The first
      calendar was live before accounts existed and stays so.
    */
    if (
      activeCalendar.id !== MAIN_CALENDAR_ID &&
      !activeRecord.live &&
      !ownsActiveCalendar()
    ) {
      return json(
        {
          error:
            "This calendar is not published yet. Its owner still has to confirm their email.",
          unpublished:
            true
        },
        404
      );
    }


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

        /*
          The calendar's address, and what became of the session the
          page sent: "valid" (an account, though maybe not this
          calendar's owner), "invalid" (expired or signed out
          everywhere), or nothing when none was sent.
        */
        calendar: {
          slug:
            await currentSlug( store ),
          claimed:
            Boolean( activeRecord.ownerId ) ||
            activeCalendar.id !== MAIN_CALENDAR_ID,
          live:
            activeCalendar.id === MAIN_CALENDAR_ID ||
            Boolean( activeRecord.live )
        },

        session:
          req.headers.get( "x-session" )
            ? ( activeUser ? "valid" : "invalid" )
            : null,

        ...(
          activeUser
            ? {
                account:
                  await accountSummary( store, activeUser, url.origin )
              }
            : {}
        ),

        events:
          admin
            ? ranged
            : buildPublicSchedule(
                ranged
              ),

        lastUpdated,

        /*
          What the Undo and Redo buttons
          can offer right now. Admin only;
          the public body is cached and
          must not vary with it.
        */

        ...(
          admin
            ? {
                history:
                  summarizeHistory(
                    await readHistory()
                  ),
                customColors:
                  customColorsOf(
                    await readSettings()
                  ),
                mail:
                  mailStatus()
              }
            : {}
        )
      },
        200,
        publicCacheHeaders(
          req,
          admin
        )
      );

    }


    /*
      CALENDAR FEED

      /api/feed/<token>/tutoring.ics - every booked session as a
      plain "Tutoring" block, for Google Calendar to subscribe to.

      The token is the whole secret, so a wrong or absent one is a
      plain 404 - nothing here says whether the feed exists.
    */

    if (
      req.method === "GET" &&
      route.startsWith(
        "/feed/"
      )
    ) {

      const feedMatch =
        /^\/feed\/([^/]+)\/tutoring\.ics$/
          .exec(
            route
          );


      if (
        !feedMatch ||
        !feedTokenIsValid(
          decodeURIComponent(
            feedMatch[1]
          )
        )
      ) {

        return json(
          {
            error:
              "Not found."
          },
          404
        );

      }


      const events =
        await readEvents();


      const nowKey =
        currentMinuteKey();


      const expanded =
        expandEventsForRange(
          events,
          nowKey -
            FEED_WEEKS_BACK *
            7 *
            1440,
          nowKey +
            FEED_WEEKS_AHEAD *
            7 *
            1440
        );


      return new Response(
        buildIcs(
          expanded,
          { timeZone: activeSettings.timezoneId }
        ),
        {
          status:
            200,

          headers: {
            "Cache-Control":
              "private, no-store",

            "Content-Type":
              "text/calendar; charset=utf-8",

            "Content-Disposition":
              'inline; filename="tutoring.ics"'
          }
        }
      );

    }


    /*
      SETTINGS
      GET  /settings  the full record (admin only: it holds the
                      notification address)
      PUT  /settings  change any of it; the config the page uses comes
                      back. A time zone change re-pushes every booked
                      session to Google, since their instants moved.
    */
    if (
      route === "/settings" &&
      req.method === "GET"
    ) {
      requireAdmin(
        req
      );
      return json({
        settings:
          activeSettings,
        slug:
          await currentSlug( store ),
        config:
          getConfig(),
        mail:
          mailStatus()
      });
    }
    /*
      POST /settings/testmail - send a test to the notification
      address, so the setup can be checked without waiting for a
      request. A success also clears a remembered failure.
    */
    if (
      route === "/settings/testmail" &&
      req.method === "POST"
    ) {
      requireAdmin(
        req
      );
      const to =
        activeSettings.notificationEmail;
      if ( !mailConfigured() ) {
        fail( "Email sending is not set up on the site yet (BREVO_API_KEY and NOTIFY_FROM_EMAIL).", 400 );
      }
      if ( !to ) {
        fail( "Enter and save a notification email first.", 400 );
      }
      /*
        The test reads like a real notification, with a made-up
        request in it, so what arrives is what a real one will look
        like - only the subject line says it is a test.
      */
      const sample =
        sampleRequest();
      const message =
        requestNotification({
          request:
            sample,
          config:
            activeConfig,
          siteUrl:
            url.origin + "/"
        });
      try {
        await sendMail({
          to,
          fromName:
            activeConfig.portalTitle,
          replyTo:
            sample.email,
          subject:
            `[Test] ${ message.subject }`,
          text:
            `This is a test from ${ activeConfig.portalTitle }. A real request will look like this:\n\n` + message.text,
          html:
            `<p style="color:#6b7280">This is a test from ${ activeConfig.portalTitle.replace( /[&<>]/g, "" ) }. A real request will look like this:</p>` + message.html
        });
      } catch ( error ) {
        await rememberMailOutcome( error );
        fail( error.message, 502 );
      }
      await rememberMailOutcome( null );
      return json({
        ok:
          true,
        to
      });
    }
    if (
      route === "/settings" &&
      req.method === "PUT"
    ) {
      requireAdmin(
        req
      );
      const body =
        await req.json();
      const stored =
        await readSettings();
      const next =
        validateSettings(
          body,
          settingsFrom( stored )
        );
      const zoneChanged =
        next.timezoneId !== activeSettings.timezoneId;
      /*
        The calendar's address. A change frees the old one; an address
        someone else holds is refused rather than altered.
      */
      let slug =
        stored.slug || null;
      if ( "slug" in body ) {
        const wanted =
          String( body.slug || "" ).trim().toLowerCase();
        if ( !slugIsValid( wanted ) ) {
          bad( "An address is 3 to 30 letters, numbers and dashes, and cannot be a word the site uses itself." );
        }
        if ( wanted !== stored.slug ) {
          const owner =
            await calendarForSlug( store, wanted );
          if ( owner && owner !== activeCalendar.id ) {
            bad( "That address is taken. Please choose another." );
          }
          slug =
            await claimSlug( store, wanted, activeCalendar.id, stored.slug || null );
        }
      }
      await writeSettings({
        ...stored,
        ...next,
        ...( slug ? { slug } : {} )
      });
      useSettings({
        ...stored,
        ...next,
        ...( slug ? { slug } : {} )
      });
      let sync;
      if ( zoneChanged ) {
        sync =
          await resyncAll(
            await readEvents(),
            process.env,
            { timeZone: activeSettings.timezoneId }
          );
      }
      return json({
        ok:
          true,
        settings:
          activeSettings,
        slug:
          slug || await currentSlug( store ),
        config:
          getConfig(),
        ...( sync ? { sync } : {} )
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


      /*
        Color is the one thing a re-save may leave unsaid. A body
        without "color" keeps the stored color; a series re-saved
        without "colorRules" keeps its rules - unless the color
        itself was changed outright, which repaints the whole series
        and makes the old exceptions meaningless.
      */
      if ( index >= 0 ) {
        const stored =
          events[ index ];
        if ( !( "color" in incoming ) && stored.color ) {
          nextEvent.color =
            stored.color;
        }
        if (
          nextEvent.recurrence &&
          stored.recurrence &&
          stored.recurrence.colorRules &&
          !( "colorRules" in nextEvent.recurrence ) &&
          ( !( "color" in incoming ) || ( incoming.color || null ) === ( stored.color || null ) )
        ) {
          nextEvent.recurrence.colorRules =
            stored.recurrence.colorRules;
        }
      }
      if ( !nextEvent.color ) {
        delete nextEvent.color;
      }
      if ( nextEvent.recurrence && nextEvent.recurrence.colorRules && !nextEvent.recurrence.colorRules.length ) {
        delete nextEvent.recurrence.colorRules;
      }


      const before =
        events.map(
          (event) => event
        );


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


      const normalized =
        normalizeSchedule(
          events,
          {
            absorbInto:
              nextEvent.recurrence
                ? id
                : null
          }
        );


      await commitEvents(
        req,
        before,
        normalized
      );


      /*
        The schedule is saved; the Google mirror follows and reports
        how it went rather than deciding whether the save succeeded.
        Everything that differs is mirrored, not only the event that
        was posted - the pass above may have folded others into it.
      */

      const sync =
        await mirrorDifference(
          before,
          normalized,
          process.env,
          { timeZone: activeSettings.timezoneId }
        );
      await rememberCustomColor(
        nextEvent.color
      );
      return json({
        id,
        updatedAt:
          now,
        sync
      });

    }


    /*
      SUBMIT A SESSION REQUEST

      Deliberately unauthenticated: this is
      how a student asks for a slot.
    */

    if (
      req.method === "POST" &&
      route === "/requests"
    ) {

      const body =
        await req.json();


      const incoming =
        validateRequest(
          body
        );


      /*
        Anyone may send a request, so one address cannot send them
        without end.
      */
      const wait =
        await rateLimit(
          store,
          "request",
          clientAddress( req )
        );
      if ( wait ) {
        fail( `Too many requests from this device. Please try again in ${ describeWait( wait ) }.`, 429 );
      }


      const requests =
        await readRequests();


      if (
        requests.length >=
        MAX_STORED_REQUESTS
      ) {

        fail(
          `${ activeSettings.displayName } has too many pending requests right now. Please try again later.`,
          429
        );

      }


      requests.push(
        incoming
      );
      await writeRequests(
        requests
      );
      await notifyNewRequest(
        incoming,
        url.origin + "/"
      );
      return json(
        {
          id:
            incoming.id
        },
        201
      );

    }


    /*
      REVIEW SESSION REQUESTS
    */

    if (
      req.method === "GET" &&
      route === "/requests"
    ) {

      requireAdmin(
        req
      );


      const requests =
        await readRequests();


      /*
        Oldest first. This is a queue to
        work through, not a feed to scroll.
      */

      return json({
        requests:
          requests
            .slice()
            .sort(
              (a, b) =>
                String(
                  a.createdAt
                ).localeCompare(
                  String(
                    b.createdAt
                  )
                )
            )
      });

    }


    /*
      DISMISS A SESSION REQUEST
    */

    if (
      req.method === "DELETE" &&
      route.startsWith(
        "/requests/"
      )
    ) {

      requireAdmin(
        req
      );


      const requestId =
        decodeURIComponent(
          route.slice(
            "/requests/".length
          )
        );


      const requests =
        await readRequests();


      const next =
        requests.filter(
          (request) =>
            request.id !==
            requestId
        );


      if (
        next.length ===
        requests.length
      ) {

        return json(
          {
            error:
              "That request no longer exists."
          },
          404
        );

      }


      await writeRequests(
        next
      );


      return json({
        ok:
          true
      });

    }


    /*
      SKIP ONE OCCURRENCE OF A SERIES
      POST /events/:id/skip  { date: "YYYY-MM-DD" }
      Deletes just that week's occurrence; the series is untouched.
    */

    if (
      req.method === "POST" &&
      route.startsWith(
        "/events/"
      ) &&
      route.endsWith(
        "/skip"
      )
    ) {

      requireAdmin(
        req
      );


      const id =
        decodeURIComponent(
          route.slice(
            "/events/".length,
            -"/skip".length
          )
        );


      const body =
        await req.json();


      const date =
        body?.date;

      validateDate(
        date
      );


      const events =
        await readEvents();


      const event =
        events.find(
          (item) =>
            item.id === id
        );


      if ( !event ) {
        return json(
          {
            error:
              "That event no longer exists."
          },
          404
        );
      }


      if ( !event.recurrence ) {
        return json(
          {
            error:
              "Only a repeating event has single weeks to skip."
          },
          400
        );
      }


      /*
        Only accept a date the series actually lands on, so a stray
        call cannot pollute the exception list.
      */

      const dayStart =
        localDateTimeToMinuteKey(
          date + "T00:00"
        );


      const lands =
        expandWeeklyEvent(
          event,
          dayStart,
          dayStart + 1440
        )
          .some(
            (occurrence) =>
              occurrence.start.slice( 0, 10 ) === date
          );


      if ( !lands ) {
        return json(
          {
            error:
              "That series has no session on that date."
          },
          400
        );
      }


      const before =
        events.map(
          (item) =>
            item === event
              ? {
                  ...item,
                  recurrence: {
                    ...item.recurrence
                  }
                }
              : item
        );


      event.recurrence.exdates =
        [ ...new Set(
          [
            ...( event.recurrence.exdates || [] ),
            date
          ]
        ) ]
          .sort();


      const normalized =
        normalizeSchedule(
          events
        );


      await commitEvents(
        req,
        before,
        normalized
      );


      const sync =
        await mirrorDifference(
          before,
          normalized,
          process.env,
          { timeZone: activeSettings.timezoneId }
        );


      return json({
        ok:
          true,
        sync
      });

    }


    /*
      RECOLOUR AN EVENT OR PART OF A SERIES
      POST /events/:id/color  { color, scope, date }
        color  "#rrggbb", or null for the default
        scope  "one" | "following" | "weekday" | "all"
        date   the clicked block's date (all scopes but "all")
      A series is never split for a color: the reach becomes a rule
      on the recurrence and every block keeps its identity.
    */
    if (
      req.method === "POST" &&
      route.startsWith(
        "/events/"
      ) &&
      route.endsWith(
        "/color"
      )
    ) {
      requireAdmin(
        req
      );
      const id =
        decodeURIComponent(
          route.slice(
            "/events/".length,
            -"/color".length
          )
        );
      const body =
        await req.json();
      const color =
        normalizeColor(
          body?.color === undefined
            ? null
            : body.color
        );
      const scope =
        String( body?.scope || "all" );
      const events =
        await readEvents();
      const index =
        events.findIndex(
          (item) =>
            item.id === id
        );
      if ( index < 0 ) {
        return json(
          {
            error:
              "That event no longer exists."
          },
          404
        );
      }
      const event =
        events[ index ];
      const painted =
        color === defaultColorFor( event.type )
          ? null
          : color;
      await rememberCustomColor(
        painted
      );
      if ( event.recurrence && scope !== "all" ) {
        validateDate(
          body?.date
        );
        const dayStart =
          localDateTimeToMinuteKey(
            body.date + "T00:00"
          );
        const lands =
          expandWeeklyEvent(
            { ...event, recurrence: { ...event.recurrence, exdates: [] } },
            dayStart,
            dayStart + 1440
          ).length > 0;
        if ( !lands ) {
          return json(
            {
              error:
                "That series has no session on that date."
            },
            400
          );
        }
      }
      const next =
        events.map(
          (item, position) =>
            position === index
              ? {
                  ...applyColorScope(
                    item,
                    {
                      color:
                        painted,
                      scope,
                      date:
                        body?.date
                    }
                  ),
                  updatedAt:
                    new Date().toISOString()
                }
              : item
        );
      const normalized =
        normalizeSchedule(
          next
        );
      await commitEvents(
        req,
        events,
        normalized
      );
      const sync =
        await mirrorDifference(
          events,
          normalized,
          process.env,
          { timeZone: activeSettings.timezoneId }
        );
      return json({
        ok:
          true,
        sync
      });
    }
    /*
      REMOVE ONE WEEKDAY FROM A SERIES
      POST /events/:id/weekday  { weekday: 0-6 }   (0 = Sunday)
      "Delete all Mondays": the series keeps its other days.
    */
    if (
      req.method === "POST" &&
      route.startsWith(
        "/events/"
      ) &&
      route.endsWith(
        "/weekday"
      )
    ) {
      requireAdmin(
        req
      );
      const id =
        decodeURIComponent(
          route.slice(
            "/events/".length,
            -"/weekday".length
          )
        );
      const body =
        await req.json();
      const weekday =
        Number( body?.weekday );
      const events =
        await readEvents();
      const index =
        events.findIndex(
          (item) =>
            item.id === id
        );
      if ( index < 0 ) {
        return json(
          {
            error:
              "That event no longer exists."
          },
          404
        );
      }
      const next =
        events.map(
          (item, position) =>
            position === index
              ? {
                  ...dropWeekday(
                    item,
                    weekday
                  ),
                  updatedAt:
                    new Date().toISOString()
                }
              : item
        );
      const normalized =
        normalizeSchedule(
          next
        );
      await commitEvents(
        req,
        events,
        normalized
      );
      const sync =
        await mirrorDifference(
          events,
          normalized,
          process.env,
          { timeZone: activeSettings.timezoneId }
        );
      return json({
        ok:
          true,
        sync
      });
    }
    /*
      FORGET A CUSTOM COLOUR PRESET
      DELETE /customcolors/<hex>
      The colour stays on any block that has it; it just stops being
      offered as a preset.
    */
    if (
      req.method === "DELETE" &&
      route.startsWith(
        "/customcolors/"
      )
    ) {
      requireAdmin(
        req
      );
      const color =
        normalizeColor(
          decodeURIComponent(
            route.slice(
              "/customcolors/".length
            )
          )
        );
      const settings =
        await readSettings();
      const remaining =
        customColorsOf( settings )
          .filter(
            (hex) =>
              hex !== color
          );
      await writeSettings({
        ...settings,
        customColors:
          remaining
      });
      return json({
        ok:
          true,
        customColors:
          remaining
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


      const normalized =
        normalizeSchedule(
          next
        );


      await commitEvents(
        req,
        events,
        normalized
      );


      const sync =
        await mirrorDifference(
          events,
          normalized,
          process.env,
          { timeZone: activeSettings.timezoneId }
        );


      return json({
        ok:
          true,
        sync
      });

    }


    /*
      UNDO / REDO

      Swap the schedule for the snapshot taken before the last action
      (or after it, for redo), then bring Google in line with only
      what changed.
    */

    if (
      req.method === "POST" &&
      (
        route === "/undo" ||
        route === "/redo"
      )
    ) {

      requireAdmin(
        req
      );


      const current =
        await readEvents();


      let history =
        await readHistory();


      /*
        One step by default; with "until", every step down to and
        including the named one, so the history list can offer
        "undo back to here" without the page looping requests.
      */

      let body =
        {};

      try {
        body =
          await req.json();
      } catch {
        body =
          {};
      }


      const until =
        typeof body?.until === "string"
          ? body.until
          : null;


      let result =
        null;


      let events =
        current;


      const entries =
        [];


      for (
        let step = 0;
        step < 200;
        step++
      ) {

        const next =
          route === "/undo"
            ? applyUndo(
                history,
                events
              )
            : applyRedo(
                history,
                events
              );


        if ( !next ) {
          break;
        }


        history =
          next.history;

        events =
          next.events;

        entries.push(
          next.entry
        );

        result =
          {
            history,
            events,
            entry:
              next.entry
          };


        if (
          !until ||
          next.entry.id === until
        ) {
          break;
        }

      }


      if ( !result ) {

        return json(
          {
            error:
              route === "/undo"
                ? "Nothing to undo."
                : "Nothing to redo."
          },
          409
        );

      }


      await writeHistory(
        result.history
      );


      await writeEvents(
        result.events
      );


      const sync =
        await mirrorDifference(
          current,
          result.events,
          process.env,
          { timeZone: activeSettings.timezoneId }
        );


      return json({
        ok:
          true,

        undone:
          route === "/undo"
            ? result.entry
            : null,

        redone:
          route === "/redo"
            ? result.entry
            : null,

        steps:
          entries.length,

        history:
          summarizeHistory(
            result.history
          ),

        sync
      });

    }


    /*
      THE HISTORY, STEP BY STEP
    */

    if (
      req.method === "GET" &&
      route === "/history"
    ) {

      requireAdmin(
        req
      );


      return json(
        listHistory(
          await readHistory(),
          await readEvents()
        )
      );

    }


    /*
      RESTORE A WHOLE VERSION

      The schedule as it stood before a given step comes back as a new
      change on top of everything since - the way a spreadsheet's
      version history restores - so nothing is unwound and the restore
      is itself undoable.
    */

    if (
      req.method === "POST" &&
      route === "/history/restoreversion"
    ) {

      requireAdmin(
        req
      );


      const body =
        await req.json();


      const history =
        await readHistory();


      const entry =
        (
          history?.undo ||
          []
        ).find(
          (item) =>
            item.id === String( body?.entryId || "" )
        );


      if ( !entry ) {

        return json(
          {
            error:
              "That version is no longer in the history."
          },
          404
        );

      }


      const current =
        await readEvents();


      const version =
        entry.events ||
        [];


      if (
        JSON.stringify( current ) ===
        JSON.stringify( version )
      ) {

        return json({
          ok:
            true,

          unchanged:
            true,

          sync: {
            google:
              "ok",
            changed:
              0
          }
        });

      }


      await commitEvents(
        req,
        current,
        version
      );


      const sync =
        await mirrorDifference(
          current,
          version,
          process.env,
          { timeZone: activeSettings.timezoneId }
        );


      return json({
        ok:
          true,

        restored:
          {
            id:
              entry.id,
            at:
              entry.at
          },

        sync
      });

    }


    /*
      PUT ONE REMOVED EVENT BACK

      Not an undo: the event a step removed is re-added as it was, on
      top of everything that happened since, as a fresh change of its
      own (so it is itself undoable).
    */

    if (
      req.method === "POST" &&
      route === "/history/restore"
    ) {

      requireAdmin(
        req
      );


      const body =
        await req.json();


      const restored =
        findRemovedEvent(
          await readHistory(),
          String( body?.entryId || "" ),
          String( body?.eventId || "" )
        );


      if ( !restored ) {

        return json(
          {
            error:
              "That step has no such event to restore."
          },
          404
        );

      }


      const events =
        await readEvents();


      if (
        events.some(
          (event) =>
            event.id === restored.id
        )
      ) {

        return json(
          {
            error:
              "That event is already on the schedule."
          },
          409
        );

      }


      const nextEvent = {
        ...restored,

        updatedAt:
          new Date()
            .toISOString()
      };


      await commitEvents(
        req,
        events,
        [
          ...events,
          nextEvent
        ]
      );


      const sync =
        await mirrorSavedEvent(
          nextEvent
        );


      return json({
        ok:
          true,

        event:
          nextEvent,

        sync
      });

    }


    /*
      REPLAY THE WHOLE SCHEDULE TO GOOGLE

      For first setup and after an outage: every booked session pushed
      again, and stale mirrored events removed.
    */

    if (
      req.method === "POST" &&
      route === "/google/resync"
    ) {

      requireAdmin(
        req
      );


      const events =
        await readEvents();


      return json(
        await resyncAll(
          events,
          process.env,
          { timeZone: activeSettings.timezoneId }
        )
      );

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

/*
  SETTINGS

  What makes this calendar this calendar: its title, whose name it
  speaks in, its time zone, the hours it shows, the two default
  colours, and the words it uses for open and booked time. Stored in
  the settings record beside the custom colour presets; anything not
  set falls back to the environment, then to the built-in defaults.
  The public page sees the resulting config, never the record itself,
  so the notification address stays private.
*/

/*
  ACCOUNT ROUTES

    POST /signup            email, password, display name; the site's
                            admin password too, to take over the first
                            calendar rather than start a new one
    POST /login             email and password -> a session token
                            (or, with no email, the older admin-password
                            login for the first calendar)
    GET  /me                the account behind a session
    GET  /site              what the home page shows before sign-in
    POST /verify            the code from the confirmation email
    POST /resend            another confirmation email
    POST /forgot            a password-reset email, if the address exists
    POST /reset             the code from that email and a new password
    POST /account/password  change the password while signed in

  Every route that could be hammered is rate-limited by address; the
  answers never say whether an email address has an account, except
  at sign-up, where the person typing it needs to know.

  Returns null for a request that is none of these.
*/

async function handleAccountRoute(
  req,
  route,
  url,
  store
) {
  if ( req.method !== "POST" && route !== "/me" && route !== "/site" ) {
    return null;
  }
  const origin =
    url.origin;

  /*
    What the home page needs before anyone is signed in: the site's
    name, whether the first calendar still waits to be claimed, and
    whether email works here.
  */
  if ( route === "/site" ) {
    if ( req.method !== "GET" ) {
      return null;
    }
    return json({
      name:
        siteName( url ),
      claimed:
        Boolean( activeRecord.ownerId ),
      mail:
        mailConfigured(),
      mainSlug:
        await ensureMainSlug( store )
    });
  }
  const address =
    clientAddress( req );
  const readBody =
    async () => {
      try {
        const body =
          await req.json();
        return body && typeof body === "object" ? body : {};
      } catch {
        return {};
      }
    };
  const limited =
    async (bucket, who = address) => {
      const wait =
        await rateLimit( store, bucket, who );
      if ( wait ) {
        fail( `Too many attempts. Please try again in ${ describeWait( wait ) }.`, 429 );
      }
    };
  const answer =
    async (user, extra = {}, status = 200) =>
      json({
        ok:
          true,
        ...issueSession( user ),
        account:
          await accountSummary( store, user, origin ),
        ...extra
      }, status );

  if ( route === "/signup" ) {
    const body =
      await readBody();
    const email =
      normalizeEmail( body.email );
    if ( !emailIsValid( email ) ) {
      bad( "Please enter a valid email address." );
    }
    const problem =
      passwordProblem( body.password );
    if ( problem ) {
      bad( problem );
    }
    const displayName =
      String( body.displayName || "" ).trim().slice( 0, SETTINGS_LIMITS.displayName ) || email.split( "@" )[ 0 ];
    if ( await findUserByEmail( store, email ) ) {
      fail( "There is already an account with that email. Log in instead, or reset your password.", 409 );
    }
    await limited( "signup" );
    const mainRecord =
      await store.get( SETTINGS_KEY, { type: "json", consistency: "strong" } ) || {};
    const claimingMain =
      typeof body.adminPassword === "string" && body.adminPassword !== "";
    let calendarId;
    let slug;
    if ( claimingMain ) {
      if ( mainRecord.ownerId ) {
        fail( "That calendar already belongs to an account.", 409 );
      }
      if ( !adminPasswordMatches( body.adminPassword ) ) {
        fail( "Incorrect admin password.", 401 );
      }
      calendarId =
        MAIN_CALENDAR_ID;
      slug =
        await ensureMainSlug( store );
    } else {
      calendarId =
        crypto.randomUUID();
      const wanted =
        slugify( body.slug || displayName ) || "calendar";
      if ( body.slug && !slugIsValid( wanted ) ) {
        bad( "An address is 3 to 30 letters, numbers and dashes, and cannot be a word the site uses itself." );
      }
      if ( body.slug && await calendarForSlug( store, wanted ) ) {
        bad( "That address is taken. Please choose another." );
      }
      slug =
        await claimSlug( store, slugIsValid( wanted ) ? wanted : "calendar", calendarId );
    }
    const user =
      await createUser( store, { email, password: body.password, displayName, calendarId } );
    if ( claimingMain ) {
      const fresh =
        await store.get( SETTINGS_KEY, { type: "json", consistency: "strong" } ) || {};
      await store.setJSON( SETTINGS_KEY, {
        ...fresh,
        ownerId:
          user.id,
        slug,
        live:
          true,
        ...( fresh.notificationEmail ? {} : { notificationEmail: email } )
      });
    } else {
      await store.setJSON( `cal/${ calendarId }/${ SETTINGS_KEY }`, {
        ownerId:
          user.id,
        slug,
        title:
          `${ displayName }'s Calendar`,
        displayName,
        notificationEmail:
          email,
        live:
          false,
        feedToken:
          crypto.randomBytes( 24 ).toString( "base64url" ),
        createdAt:
          new Date().toISOString()
      });
    }
    const verification =
      await sendVerification( store, user, origin );
    return answer( user, { verification }, 201 );
  }

  if ( route === "/login" ) {
    const body =
      await readBody();
    if ( !body.email ) {
      return legacyLogin( req, body );
    }
    await limited( "login" );
    const email =
      normalizeEmail( body.email );
    await limited( "login", `email:${ email }` );
    const user =
      await findUserByEmail( store, email );
    if ( !user || !passwordMatches( body.password, user ) ) {
      fail( "That email and password do not match.", 401 );
    }
    return answer( user );
  }

  if ( route === "/me" ) {
    if ( req.method !== "GET" ) {
      return null;
    }
    if ( !activeUser ) {
      fail( "Please log in.", 401 );
    }
    return json({
      ok:
        true,
      account:
        await accountSummary( store, activeUser, origin )
    });
  }

  if ( route === "/verify" ) {
    await limited( "verify" );
    const body =
      await readBody();
    const record =
      await consumeToken( store, body.token, "verify" );
    const user =
      record ? await readUser( store, record.userId ) : null;
    if ( !user ) {
      fail( "That confirmation link has expired or was already used. Log in and ask for a new one.", 400 );
    }
    if ( !user.verifiedAt ) {
      user.verifiedAt =
        new Date().toISOString();
      await writeUser( store, user );
      await publishCalendar( store, user.calendarId );
    }
    return answer( user );
  }

  if ( route === "/resend" ) {
    if ( !activeUser ) {
      fail( "Please log in.", 401 );
    }
    if ( activeUser.verifiedAt ) {
      return json({ ok: true, verification: "done" });
    }
    await limited( "verify", `user:${ activeUser.id }` );
    const verification =
      await sendVerification( store, activeUser, origin );
    return json({ ok: true, verification });
  }

  if ( route === "/forgot" ) {
    await limited( "forgot" );
    const body =
      await readBody();
    const email =
      normalizeEmail( body.email );
    if ( !emailIsValid( email ) ) {
      bad( "Please enter a valid email address." );
    }
    if ( !mailConfigured() ) {
      fail( "Password reset by email is not set up on this site yet.", 400 );
    }
    const user =
      await findUserByEmail( store, email );
    if ( user ) {
      const token =
        await issueToken( store, { kind: "reset", userId: user.id, hours: RESET_HOURS } );
      const link =
        `${ origin }/?reset=${ token }`;
      try {
        await sendMail({
          to:
            user.email,
          fromName:
            siteName( url ),
          ...resetEmail({ displayName: user.displayName, link, siteName: siteName( url ), hours: RESET_HOURS })
        });
      } catch ( error ) {
        console.error( "Reset email failed", error );
        fail( "The reset email could not be sent right now. Please try again later.", 502 );
      }
    }
    return json({
      ok:
        true,
      message:
        "If that address has an account, a reset link is on its way. It works for two hours."
    });
  }

  if ( route === "/reset" ) {
    await limited( "verify" );
    const body =
      await readBody();
    const problem =
      passwordProblem( body.password );
    if ( problem ) {
      bad( problem );
    }
    const record =
      await consumeToken( store, body.token, "reset" );
    const user =
      record ? await readUser( store, record.userId ) : null;
    if ( !user ) {
      fail( "That reset link has expired or was already used. Ask for a new one.", 400 );
    }
    Object.assign( user, hashPassword( body.password ) );
    user.pwVersion =
      ( user.pwVersion || 1 ) + 1;
    if ( !user.verifiedAt ) {
      user.verifiedAt =
        new Date().toISOString();
      await publishCalendar( store, user.calendarId );
    }
    await writeUser( store, user );
    return answer( user );
  }

  if ( route === "/account/password" ) {
    if ( !activeUser ) {
      fail( "Please log in.", 401 );
    }
    const body =
      await readBody();
    if ( !passwordMatches( body.current, activeUser ) ) {
      fail( "Your current password is not right.", 401 );
    }
    const problem =
      passwordProblem( body.password );
    if ( problem ) {
      bad( problem );
    }
    Object.assign( activeUser, hashPassword( body.password ) );
    activeUser.pwVersion =
      ( activeUser.pwVersion || 1 ) + 1;
    await writeUser( store, activeUser );
    return answer( activeUser );
  }

  return null;
}


/*
  The older way in: the site's admin password in a header opens the
  first calendar until an account claims it. "Keep me signed in"
  answers with a token the device holds instead of the password: the
  password's HMAC over an expiry, which proves nothing on its own and
  dies for every device the moment the password changes on Netlify.
*/
function legacyLogin(
  req,
  body
) {
  requireAdmin(
    req
  );
  const remember =
    body.remember === true;
  return json({
    ok:
      true,
    ...(
      remember
        ? {
            token:
              issueAdminToken(),
            expiresAt:
              new Date(
                Date.now() +
                ADMIN_TOKEN_DAYS * 86400000
              ).toISOString()
          }
        : {}
    )
  });
}


function adminPasswordMatches(
  password
) {
  const expected =
    Buffer.from( process.env.ADMIN_PASSWORD || "" );
  const supplied =
    Buffer.from( String( password || "" ) );
  return (
    expected.length > 0 &&
    expected.length === supplied.length &&
    crypto.timingSafeEqual( expected, supplied )
  );
}


function describeWait(
  seconds
) {
  if ( seconds < 90 ) {
    return `${ seconds } seconds`;
  }
  const minutes =
    Math.ceil( seconds / 60 );
  return minutes === 1 ? "a minute" : `${ minutes } minutes`;
}


/*
  What the site calls itself in emails and on the home page: SITE_NAME
  if set, else the host made readable - ethan-calendar.netlify.app
  becomes "Ethan Calendar".
*/
function siteName(
  url
) {
  if ( process.env.SITE_NAME ) {
    return process.env.SITE_NAME;
  }
  const host =
    url.hostname.replace( /\.netlify\.app$/, "" ).replace( /^www\./, "" );
  if ( /^(localhost|127\.0\.0\.1|\d+(\.\d+){3})$/.test( host ) ) {
    return "Calendar";
  }
  return host
    .split( /[-.]/ )
    .filter( Boolean )
    .map( (part) => part.charAt( 0 ).toUpperCase() + part.slice( 1 ) )
    .join( " " );
}


/*
  What the page is told about the signed-in account: never the hash,
  never the id.
*/
async function accountSummary(
  store,
  user,
  origin
) {
  const slug =
    await slugOfCalendar( store, user.calendarId );
  return {
    email:
      user.email,
    displayName:
      user.displayName,
    verified:
      Boolean( user.verifiedAt ),
    slug,
    url:
      `${ origin }/${ slug }`
  };
}


async function slugOfCalendar(
  store,
  calendarId
) {
  if ( calendarId === MAIN_CALENDAR_ID ) {
    return ensureMainSlug( store );
  }
  const record =
    await store.get( `cal/${ calendarId }/${ SETTINGS_KEY }`, { type: "json", consistency: "strong" } ) || {};
  return record.slug || null;
}


/*
  The address of the calendar in hand, claimed for the first calendar
  the first time anyone asks.
*/
async function currentSlug(
  store
) {
  return activeCalendar.slug || activeRecord.slug || slugOfCalendar( store, activeCalendar.id );
}


/*
  A confirmed email makes the calendar public.
*/
async function publishCalendar(
  store,
  calendarId
) {
  if ( calendarId === MAIN_CALENDAR_ID ) {
    return;
  }
  const key =
    `cal/${ calendarId }/${ SETTINGS_KEY }`;
  const record =
    await store.get( key, { type: "json", consistency: "strong" } ) || {};
  await store.setJSON( key, { ...record, live: true } );
}


/*
  The confirmation email. Where the site cannot send mail at all, the
  address is taken on trust and the calendar goes live at once -
  there is no other way to confirm it.
*/
async function sendVerification(
  store,
  user,
  origin
) {
  if ( !mailConfigured() ) {
    if ( !user.verifiedAt ) {
      user.verifiedAt =
        new Date().toISOString();
      await writeUser( store, user );
      await publishCalendar( store, user.calendarId );
    }
    return "off";
  }
  const token =
    await issueToken( store, { kind: "verify", userId: user.id, hours: VERIFY_HOURS } );
  const link =
    `${ origin }/?verify=${ token }`;
  const name =
    siteName( new URL( origin ) );
  try {
    await sendMail({
      to:
        user.email,
      fromName:
        name,
      ...verificationEmail({ displayName: user.displayName, link, siteName: name, hours: VERIFY_HOURS })
    });
    return "sent";
  } catch ( error ) {
    console.error( "Verification email failed", error );
    return "failed";
  }
}


const SETTINGS_LIMITS = {
  title: 80,
  displayName: 40,
  label: 30,
  noun: 20,
  email: 120
};

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function envDefaults() {
  return {
    title:
      process.env.PORTAL_TITLE ||
      "Ethan's Tutoring Availability",
    displayName:
      process.env.TUTOR_NAME ||
      "Ethan",
    timezoneId:
      TIMEZONE_ID,
    dayStart:
      8,
    dayEnd:
      24,
    colors: {
      available:
        "#2f7d4a",
      blocked:
        "#b42318"
    },
    labels: {
      available:
        "Available",
      blocked:
        "Blocked Session",
      person:
        "student",
      people:
        "students"
    },
    notificationEmail:
      ""
  };
}

function timezoneIsValid(
  id
) {
  try {
    new Intl.DateTimeFormat( "en-US", { timeZone: id } );
    return true;
  } catch {
    return false;
  }
}

/*
  "Pacific Time (PT)", "Eastern Time (ET)", "United Kingdom Time" -
  the generic names, so the label does not flip with daylight saving.
*/
function timezoneLabelFor(
  id
) {
  const name =
    (style) => {
      try {
        return new Intl.DateTimeFormat( "en-US", { timeZone: id, timeZoneName: style } )
          .formatToParts( new Date() )
          .find( (part) => part.type === "timeZoneName" )?.value || "";
      } catch {
        return "";
      }
    };
  const long =
    name( "longGeneric" ) || id;
  const short =
    name( "shortGeneric" );
  return short && short !== long && short.length <= 6
    ? `${ long } (${ short })`
    : long;
}

/*
  The stored record over the defaults, field by field, so a record
  written by an older version is still whole.
*/
function settingsFrom(
  stored
) {
  const base =
    envDefaults();
  const record =
    stored && typeof stored === "object"
      ? stored
      : {};
  const out = {
    ...base,
    ...( typeof record.title === "string" && record.title.trim() ? { title: record.title } : {} ),
    ...( typeof record.displayName === "string" && record.displayName.trim() ? { displayName: record.displayName } : {} ),
    ...( typeof record.timezoneId === "string" && timezoneIsValid( record.timezoneId ) ? { timezoneId: record.timezoneId } : {} ),
    ...( Number.isInteger( record.dayStart ) ? { dayStart: record.dayStart } : {} ),
    ...( Number.isInteger( record.dayEnd ) ? { dayEnd: record.dayEnd } : {} ),
    ...( typeof record.notificationEmail === "string" ? { notificationEmail: record.notificationEmail } : {} ),
    colors: {
      ...base.colors,
      ...( record.colors && HEX_COLOR.test( record.colors.available || "" ) ? { available: record.colors.available } : {} ),
      ...( record.colors && HEX_COLOR.test( record.colors.blocked || "" ) ? { blocked: record.colors.blocked } : {} )
    },
    labels: {
      ...base.labels,
      ...Object.fromEntries(
        Object.entries( record.labels || {} )
          .filter( ([ key, value ]) => key in base.labels && typeof value === "string" && value.trim() )
      )
    }
  };
  if ( !( out.dayStart >= 0 && out.dayStart <= 23 && out.dayEnd >= 1 && out.dayEnd <= 24 && out.dayEnd > out.dayStart ) ) {
    out.dayStart = base.dayStart;
    out.dayEnd = base.dayEnd;
  }
  return out;
}

/*
  What the page is told. Everything a visitor may see; the
  notification address is not among it.
*/
function configFrom(
  settings
) {
  return {
    portalTitle:
      settings.title,
    tutorName:
      settings.displayName,
    timezoneId:
      settings.timezoneId,
    timezoneLabel:
      timezoneLabelFor( settings.timezoneId ),
    dayStart:
      settings.dayStart,
    dayEnd:
      settings.dayEnd,
    colors:
      { ...settings.colors },
    labels:
      { ...settings.labels },
    googleSync:
      googleSyncConfigured()
  };
}

/*
  A settings body from the admin: every field checked, unknown fields
  ignored, the presets and anything else in the record left alone.
*/
function validateSettings(
  body,
  current
) {
  if ( !body || typeof body !== "object" ) {
    bad( "Invalid settings." );
  }
  const text =
    (value, limit, what) => {
      const out =
        String( value ?? "" ).trim();
      if ( !out ) bad( `Please enter ${ what }.` );
      if ( out.length > limit ) bad( `${ what[ 0 ].toUpperCase() + what.slice( 1 ) } is too long (${ limit } characters at most).` );
      return out;
    };
  const next =
    { ...current };
  if ( "title" in body ) next.title = text( body.title, SETTINGS_LIMITS.title, "a calendar title" );
  if ( "displayName" in body ) next.displayName = text( body.displayName, SETTINGS_LIMITS.displayName, "a display name" );
  if ( "timezoneId" in body ) {
    const id =
      String( body.timezoneId || "" ).trim();
    if ( !timezoneIsValid( id ) ) bad( "That time zone is not recognised." );
    next.timezoneId = id;
  }
  if ( "dayStart" in body ) next.dayStart = Number( body.dayStart );
  if ( "dayEnd" in body ) next.dayEnd = Number( body.dayEnd );
  if (
    !Number.isInteger( next.dayStart ) || !Number.isInteger( next.dayEnd ) ||
    next.dayStart < 0 || next.dayStart > 23 || next.dayEnd < 1 || next.dayEnd > 24
  ) {
    bad( "Day start and end must be whole hours between 12 AM and 12 AM." );
  }
  if ( next.dayEnd <= next.dayStart ) {
    bad( "The day must end after it starts." );
  }
  if ( body.colors && typeof body.colors === "object" ) {
    next.colors = { ...current.colors };
    for ( const key of [ "available", "blocked" ] ) {
      if ( key in body.colors ) {
        const color =
          normalizeColor( body.colors[ key ] );
        if ( !color ) bad( `Please choose a colour for ${ key } time.` );
        next.colors[ key ] = color;
      }
    }
  }
  if ( body.labels && typeof body.labels === "object" ) {
    next.labels = { ...current.labels };
    for ( const key of [ "available", "blocked" ] ) {
      if ( key in body.labels ) next.labels[ key ] = text( body.labels[ key ], SETTINGS_LIMITS.label, `a name for ${ key } time` );
    }
    for ( const key of [ "person", "people" ] ) {
      if ( key in body.labels ) next.labels[ key ] = text( body.labels[ key ], SETTINGS_LIMITS.noun, `a word for what the summary counts (${ key === "person" ? "one" : "several" })` );
    }
  }
  if ( "notificationEmail" in body ) {
    const email =
      String( body.notificationEmail || "" ).trim();
    if ( email && ( email.length > SETTINGS_LIMITS.email || !EMAIL_PATTERN.test( email ) ) ) {
      bad( "That notification email address does not look right." );
    }
    next.notificationEmail = email;
  }
  return next;
}

/*
  The settings in force for the request being handled. A function
  instance serves one request at a time, so this is set once at the
  top of the handler and read by the helpers below without every
  validator having to carry it.
*/
let activeSettings =
  settingsFrom( null );

let activeConfig =
  configFrom( activeSettings );

/*
  The stored record as it is, for the few things kept on it that are
  not settings - the last email failure, say.
*/
let activeRecord =
  {};

function useSettings(
  stored
) {
  activeRecord =
    stored && typeof stored === "object"
      ? stored
      : {};
  activeSettings =
    settingsFrom( stored );
  activeConfig =
    configFrom( activeSettings );
}

/*
  What the admin page shows about email: whether sending is set up,
  where notifications go, and the last failure if one is remembered.
*/
function mailStatus() {
  return {
    configured:
      mailConfigured(),
    address:
      activeSettings.notificationEmail || "",
    lastError:
      activeRecord.lastMailError || null
  };
}

async function rememberMailOutcome(
  error
) {
  const stored =
    await readSettings();
  const next =
    { ...stored };
  if ( error ) {
    next.lastMailError = {
      at:
        new Date().toISOString(),
      message:
        String( error.message || error )
    };
  } else {
    delete next.lastMailError;
  }
  await writeSettings( next );
  useSettings( next );
}

/*
  A made-up request for the test email: a named student and guardian,
  next Tuesday at four in the calendar's own clock.
*/
function sampleRequest() {
  const todayKey =
    currentMinuteKey();
  const today =
    minuteKeyToLocalDateTime( todayKey ).slice( 0, 10 );
  const weekday =
    new Date( today + "T12:00:00Z" ).getUTCDay();
  const daysAhead =
    ( ( 2 - weekday + 7 ) % 7 ) || 7;
  const date =
    addDaysToDate( today, daysAhead );
  return {
    id:
      "test",
    name:
      "John Doe",
    email:
      "john.doe@example.com",
    phone:
      "(555) 555-0123",
    guardian:
      "Jane Doe",
    subject:
      "Algebra II",
    format:
      "Online",
    recurrence:
      null,
    start:
      date + "T16:00",
    end:
      date + "T17:00"
  };
}

/*
  Tell the admin about a new request. Nothing here can fail the
  request itself: a send that goes wrong is logged and remembered for
  the banner, and the requester is none the wiser.
*/
async function notifyNewRequest(
  request,
  siteUrl
) {
  const to =
    activeSettings.notificationEmail;
  if ( !to || !mailConfigured() ) {
    return { sent: false, reason: !to ? "no-address" : "not-configured" };
  }
  const message =
    requestNotification({
      request,
      config:
        activeConfig,
      siteUrl
    });
  try {
    await sendMail({
      to,
      fromName:
        activeConfig.portalTitle,
      replyTo:
        request.email,
      ...message
    });
    if ( activeRecord.lastMailError ) {
      await rememberMailOutcome( null );
    }
    return { sent: true };
  } catch ( error ) {
    console.error( "Request notification failed", error );
    await rememberMailOutcome( error );
    return { sent: false, reason: "failed", error: error.message };
  }
}

function getConfig() {
  return activeConfig;
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
      storageKey( EVENTS_KEY ),
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
    activeCalendar.id !== MAIN_CALENDAR_ID
      ? null
      : await store.get(
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
    storageKey( EVENTS_KEY ),
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
    storageKey( EVENTS_KEY ),
    events
  );


  try {
    await purgeCache({ tags: [ cacheTag() ] });
  } catch (error) {
    console.error("Cache purge failed", error);
  }

}

/*
  Every write goes through here so the schedule as it was lands on the
  undo stack first. The page names the action with two headers: an id
  that groups the several writes one gesture can make, and a label for
  the Undo button to show.
*/

async function commitEvents(
  req,
  previousEvents,
  nextEvents
) {

  const actionId =
    (
      req.headers.get(
        "x-action-id"
      ) ||
      ""
    ).slice( 0, 80 ) ||
    null;


  const label =
    req.headers.get(
      "x-action-label"
    );


  const history =
    recordBeforeWrite(
      await readHistory(),
      {
        actionId,
        label,
        previousEvents
      }
    );


  await writeHistory(
    history
  );


  await writeEvents(
    nextEvents
  );

}


async function readHistory() {

  const store =
    getStore(
      STORE_NAME
    );


  return await store.get(
    storageKey( HISTORY_KEY ),
    {
      type:
        "json",

      consistency:
        "strong"
    }
  );

}


async function writeHistory(
  history
) {

  const store =
    getStore(
      STORE_NAME
    );


  await store.setJSON(
    storageKey( HISTORY_KEY ),
    history
  );

}


async function readSettings() {
  const store =
    getStore(
      STORE_NAME
    );
  const settings =
    await store.get(
      storageKey( SETTINGS_KEY ),
      {
        type:
          "json",
        consistency:
          "strong"
      }
    );
  return settings && typeof settings === "object"
    ? settings
    : {};
}


async function writeSettings(
  settings
) {
  const store =
    getStore(
      STORE_NAME
    );
  await store.setJSON(
    storageKey( SETTINGS_KEY ),
    settings
  );
}


/*
  A colour outside the basic palette (and not a type's default) joins
  the custom presets, at the end - they keep the order they were
  first used in, and using one again does not move it. The list stays
  short: the oldest drops off past sixteen.
*/
async function rememberCustomColor(
  color
) {
  if (
    !color ||
    PALETTE_HEXES.has( color ) ||
    Object.values( defaultColors() ).includes( color )
  ) {
    return;
  }
  const settings =
    await readSettings();
  const current =
    Array.isArray( settings.customColors )
      ? settings.customColors
      : [];
  if ( current.includes( color ) ) {
    return;
  }
  const next =
    [ ...current, color ]
      .slice( -MAX_CUSTOM_COLORS );
  await writeSettings({
    ...settings,
    customColors:
      next
  });
}


function customColorsOf(
  settings
) {
  return (
    Array.isArray( settings.customColors )
      ? settings.customColors
      : []
  )
    .filter(
      (hex) =>
        typeof hex === "string" &&
        HEX_COLOR.test( hex )
    )
    .slice( 0, MAX_CUSTOM_COLORS );
}


async function readRequests() {

  const store =
    getStore(
      STORE_NAME
    );


  const current =
    await store.get(
      storageKey( REQUESTS_KEY ),
      {
        type:
          "json",

        consistency:
          "strong"
      }
    );


  return Array.isArray(
    current
  )
    ? current
    : [];

}


/*
  Unlike writeEvents this does not purge the cache tag. Requests never
  reach a cached response -- the public schedule does not contain them
  and the admin list is never cached -- so purging would throw away a
  still-correct schedule on every submission.
*/

async function writeRequests(
  requests
) {

  const store =
    getStore(
      STORE_NAME
    );


  await store.setJSON(
    storageKey( REQUESTS_KEY ),
    requests
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
    hasValidAdminPassword(
      req
    )
  ) {
    return;
  }

  /*
    A session that no longer opens this calendar: it expired, the
    password changed, or it belongs to someone else's account.
  */
  if (
    req.headers.get( "x-session" )
  ) {
    fail(
      activeUser
        ? "This is not your calendar."
        : "Please log in again.",
      401
    );
  }

  if (
    !process.env.ADMIN_PASSWORD
  ) {
    fail(
      "ADMIN_PASSWORD is not configured in Netlify.",
      503
    );
  }

  fail(
    "Incorrect admin password.",
    401
  );

}


/*
  The owner of the calendar in hand: a signed-in account that owns
  it, or - for the first calendar, until an account claims it - the
  site's admin password or the device token made from it.
*/
function ownsActiveCalendar() {
  return Boolean(
    activeUser &&
    activeUser.calendarId === activeCalendar.id
  );
}


const ADMIN_TOKEN_DAYS =
  90;


function issueAdminToken() {

  const expires =
    Date.now() +
    ADMIN_TOKEN_DAYS * 86400000;


  return `${expires}.${
    adminTokenSignature(
      expires
    )
  }`;

}


function adminTokenSignature(
  expires
) {

  return crypto
    .createHmac(
      "sha256",
      process.env.ADMIN_PASSWORD ||
      ""
    )
    .update(
      `admin-session:${expires}`
    )
    .digest(
      "base64url"
    );

}


function hasValidAdminToken(
  token
) {

  const match =
    /^(\d{10,16})\.([A-Za-z0-9_-]{20,})$/
      .exec(
        token ||
        ""
      );


  if (
    !match ||
    !process.env.ADMIN_PASSWORD
  ) {

    return false;

  }


  const expires =
    Number(
      match[ 1 ]
    );


  if (
    !Number.isFinite( expires ) ||
    expires < Date.now()
  ) {

    return false;

  }


  const expected =
    Buffer.from(
      adminTokenSignature(
        expires
      )
    );


  const supplied =
    Buffer.from(
      match[ 2 ]
    );


  return (
    expected.length ===
      supplied.length &&
    crypto.timingSafeEqual(
      expected,
      supplied
    )
  );

}


function hasValidAdminPassword(
  req
) {

  if (
    ownsActiveCalendar()
  ) {

    return true;

  }


  if (
    activeCalendar.id !== MAIN_CALENDAR_ID ||
    activeRecord.ownerId
  ) {

    return false;

  }


  const expected =
    process.env.ADMIN_PASSWORD ||
    "";


  const supplied =
    req.headers.get(
      "x-admin-password"
    ) ||
    "";


  if (
    !supplied &&
    hasValidAdminToken(
      req.headers.get(
        "x-admin-token"
      )
    )
  ) {

    return true;

  }


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
      "Please select a session type."
    );

  }

  const title =
    String(
      event.title ||
      ""
    ).trim();


  if (!title) {

    bad(
      "Please enter a title for this event."
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
      start,
      type
    );


  let color =
    normalizeColor(
      event.color
    );
  if ( color === defaultColorFor( type ) ) {
    color = null;
  }


  return {
    id:
      event.id
        ? String(
            event.id
          )
        : "",

    type,

    /*
      Left out of the body entirely, the color is "whatever it was";
      the update below keeps the stored one. Null clears it.
    */
    ...(
      color === undefined
        ? {}
        : { color }
    ),


    title:
      title.slice(
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
  KEEPING THE SCHEDULE HONEST ABOUT WHAT REPEATS

  Two things can make the stored shape disagree with what the admin
  sees. A series can be whittled down - "this and following" from the
  second week, "this event only" on the first - until one block is
  left, which is a standalone session in every way that matters and
  should be edited and deleted as one. And a standalone block can sit
  exactly where a series lands - same day of the week, same time,
  same length, same title, same notes - after the admin adds the
  series around it; that block belongs to the series.

  This pass runs after every save. It absorbs matching standalones
  into a series (only when the save was a series, so the detached
  copies that scoped edits deliberately create are left alone), then
  collapses any finite series with one block left into a plain event,
  and drops one with none. The result is what the admin meant.
*/

function normalizeSchedule(
  events,
  { absorbInto = null } = {}
) {

  let list =
    events.map(
      (event) => ({
        ...event,
        recurrence:
          event.recurrence
            ? {
                ...event.recurrence,
                weekdays:
                  [ ...( event.recurrence.weekdays || [] ) ],
                exdates:
                  [ ...( event.recurrence.exdates || [] ) ]
              }
            : null
      })
    );


  if ( absorbInto ) {

    const series =
      list.find(
        (event) =>
          event.id === absorbInto &&
          event.recurrence &&
          event.recurrence.frequency === "WEEKLY"
      );


    if ( series ) {

      list =
        absorbStandalones(
          list,
          series
        );

    }

  }


  return collapseSingles(
    list
  );

}


/*
  Every occurrence of a series that has an end. A series that never
  ends is left alone here - it cannot be down to one block.
*/

const FAR_FUTURE_KEY =
  localDateTimeToMinuteKey(
    "2200-01-01T00:00"
  );


function allOccurrences(
  event
) {

  return expandWeeklyEvent(
    event,
    0,
    FAR_FUTURE_KEY
  );

}


function collapseSingles(
  list
) {

  const out =
    [];


  for (
    const event of list
  ) {

    const recurrence =
      event.recurrence;


    if (
      !recurrence ||
      recurrence.frequency !== "WEEKLY" ||
      recurrence.endType === "NEVER"
    ) {

      out.push(
        event
      );

      continue;

    }


    const occurrences =
      allOccurrences(
        event
      );


    if ( occurrences.length === 0 ) {

      continue;

    }


    if ( occurrences.length === 1 ) {
      const single = {
        ...event,
        start:
          occurrences[ 0 ].start,
        end:
          occurrences[ 0 ].end,
        recurrence:
          null
      };
      const color =
        resolveOccurrenceColor(
          event,
          occurrences[ 0 ].start.slice( 0, 10 )
        );
      if ( color ) single.color = color;
      else delete single.color;
      out.push(
        single
      );
      continue;
    }


    out.push(
      event
    );

  }


  return out;

}


/*
  A standalone matches a series when it is the same kind of block on
  one of the series' weekdays: same type, title and notes, same start
  time of day, same length. The date decides what happens:

    on a skipped week          the skip is lifted, the block dropped
    on a week the series lands the block is a duplicate and dropped
    before the first week      the series starts there instead, with
                               the weeks in between skipped unless a
                               matching block fills them too
    after the last week        the series runs to there instead, the
                               weeks in between skipped likewise

  The cadence must agree: a block two weeks ahead of an every-third-
  week series is not on the series.
*/

function absorbStandalones(
  list,
  series
) {

  const recurrence =
    series.recurrence;


  const interval =
    recurrence.interval ||
    1;


  const seriesStartKey =
    localDateTimeToMinuteKey(
      series.start
    );


  const duration =
    localDateTimeToMinuteKey(
      series.end
    ) -
    seriesStartKey;


  const timeOfDay =
    seriesStartKey -
    localDateTimeToMinuteKey(
      series.start.slice( 0, 10 ) + "T00:00"
    );


  const sameText =
    (a, b) =>
      String( a || "" ).trim().toLowerCase() ===
      String( b || "" ).trim().toLowerCase();


  const matches =
    list.filter(
      (event) => {

        if (
          event === series ||
          event.recurrence ||
          event.type !== series.type ||
          !sameText( event.title, series.title ) ||
          !sameText( event.notes, series.notes )
        ) {

          return false;

        }


        const startKey =
          localDateTimeToMinuteKey(
            event.start
          );


        const dayKey =
          localDateTimeToMinuteKey(
            event.start.slice( 0, 10 ) + "T00:00"
          );


        if (
          startKey === null ||
          dayKey === null ||
          startKey - dayKey !== timeOfDay ||
          localDateTimeToMinuteKey( event.end ) - startKey !== duration
        ) {

          return false;

        }


        const weekday =
          new Date(
            dayKey * 60000
          ).getUTCDay();


        if (
          !recurrence.weekdays.includes(
            weekday
          )
        ) {

          return false;

        }


        /*
          Same phase as the series: a whole number of intervals
          between its week and the series' anchor week.
        */

        const anchorWeek =
          weekOf(
            series.start.slice( 0, 10 )
          );


        const blockWeek =
          weekOf(
            event.start.slice( 0, 10 )
          );


        const weeksApart =
          Math.round(
            ( blockWeek - anchorWeek ) /
            ( 7 * 1440 )
          );


        return (
          ( ( weeksApart % interval ) + interval ) % interval
        ) === 0;

      }
    );


  if ( !matches.length ) {

    return list;

  }


  const absorbed =
    new Set();


  const exdates =
    new Set(
      recurrence.exdates ||
      []
    );


  /*
    Work outward: the earliest match may move the start back, the
    latest may push the end out. Everything in between is handled by
    the same rule - a slot is either filled by a matching block or
    skipped.
  */

  const dates =
    matches
      .map(
        (event) =>
          event.start.slice( 0, 10 )
      )
      .sort();


  let firstOccurrence =
    allOccurrencesOrFirst(
      series
    );


  let newStart =
    series.start;


  let newEnd =
    series.end;


  for (
    const date of dates
  ) {

    const dayKey =
      localDateTimeToMinuteKey(
        date + "T00:00"
      );


    if ( exdates.has( date ) ) {

      exdates.delete(
        date
      );

      absorbed.add(
        date
      );

      continue;

    }


    const landsHere =
      expandWeeklyEvent(
        { ...series, start: newStart, end: newEnd,
          recurrence: { ...recurrence, exdates: [] } },
        dayKey,
        dayKey + 1440
      ).length > 0;


    if ( landsHere ) {

      absorbed.add(
        date
      );

      continue;

    }


    if (
      dayKey < localDateTimeToMinuteKey( newStart )
    ) {

      /*
        Earlier than the series: it now starts here. Slots between
        here and the old first block are skipped unless another
        matching block fills them.
      */

      const slotsBetween =
        expandWeeklyEvent(
          { ...series, start: date + "T" + series.start.slice( 11 ), end: minuteKeyToLocalDateTime( dayKey + timeOfDay + duration ),
            recurrence: { ...recurrence, endType: "NEVER", exdates: [] } },
          dayKey + timeOfDay + duration,
          localDateTimeToMinuteKey( firstOccurrence ) - 1
        )
          .map(
            (occurrence) =>
              occurrence.start.slice( 0, 10 )
          );


      for (
        const slot of slotsBetween
      ) {

        if ( dates.includes( slot ) ) {

          absorbed.add(
            slot
          );

        } else {

          exdates.add(
            slot
          );

        }

      }


      newStart =
        date + "T" + series.start.slice( 11 );


      newEnd =
        minuteKeyToLocalDateTime(
          dayKey + timeOfDay + duration
        );


      firstOccurrence =
        newStart;


      absorbed.add(
        date
      );

      continue;

    }


    /*
      Later than the series' last block: it runs to here instead.
    */

    if ( recurrence.endType === "NEVER" ) {

      continue;

    }


    const lastOccurrence =
      allOccurrences(
        { ...series, start: newStart, end: newEnd, recurrence: { ...recurrence, exdates: [] } }
      )
        .pop();


    if ( !lastOccurrence ) {

      continue;

    }


    const slotsBetween =
      expandWeeklyEvent(
        { ...series, start: newStart, end: newEnd,
          recurrence: { ...recurrence, endType: "NEVER", exdates: [] } },
        localDateTimeToMinuteKey( lastOccurrence.end ),
        dayKey + timeOfDay
      )
        .map(
          (occurrence) =>
            occurrence.start.slice( 0, 10 )
        );


    for (
      const slot of slotsBetween
    ) {

      if ( dates.includes( slot ) ) {

        absorbed.add(
          slot
        );

      } else {

        exdates.add(
          slot
        );

      }

    }


    if ( recurrence.endType === "ON" ) {

      recurrence.until =
        date;

    } else if ( recurrence.endType === "COUNT" ) {

      recurrence.count =
        ( recurrence.count || 0 ) + slotsBetween.length + 1;

    }


    absorbed.add(
      date
    );

  }


  if ( !absorbed.size ) {

    return list;

  }


  /*
    Moving the start earlier on a counted series adds slots at the
    front; the count grows by as many so the far end stays put.
  */

  if (
    recurrence.endType === "COUNT" &&
    newStart !== series.start
  ) {

    const movedSlots =
      expandWeeklyEvent(
        { ...series, start: newStart, end: newEnd,
          recurrence: { ...recurrence, endType: "NEVER", exdates: [] } },
        localDateTimeToMinuteKey( newStart ),
        localDateTimeToMinuteKey( series.start ) - 1
      ).length;


    recurrence.count =
      ( recurrence.count || 0 ) + movedSlots;

  }


  series.start =
    newStart;
  series.end =
    newEnd;
  recurrence.exdates =
    [ ...exdates ].sort();
  /*
    A block that joins the series keeps the color it had: where that
    differs from what the series would show on its date, a one-date
    rule records it.
  */
  let colorRules =
    [ ...( recurrence.colorRules || [] ) ];
  for (
    const event of matches
  ) {
    const date =
      event.start.slice( 0, 10 );
    if ( !absorbed.has( date ) ) {
      continue;
    }
    const want =
      event.color || null;
    const have =
      resolveOccurrenceColor(
        { ...series, recurrence: { ...recurrence, colorRules } },
        date
      );
    if ( want !== have ) {
      colorRules =
        colorRules.filter( (rule) => rule.date !== date );
      colorRules.push({ date, color: want });
    }
  }
  if ( colorRules.length ) recurrence.colorRules = colorRules;
  else delete recurrence.colorRules;
  return list.filter(
    (event) =>
      event === series ||
      event.recurrence ||
      !(
        matches.includes( event ) &&
        absorbed.has( event.start.slice( 0, 10 ) )
      )
  );

}


function weekOf(
  date
) {

  const dayKey =
    localDateTimeToMinuteKey(
      date + "T00:00"
    );


  const weekday =
    new Date(
      dayKey * 60000
    ).getUTCDay();


  return dayKey - weekday * 1440;

}


/*
  Where a series really begins: the first listed weekday on or after
  its start date, which lies within the first interval of weeks.
*/

function allOccurrencesOrFirst(
  series
) {

  const startKey =
    localDateTimeToMinuteKey(
      series.start
    );


  const span =
    ( series.recurrence.interval || 1 ) * 7 * 1440 * 2;


  const first =
    expandWeeklyEvent(
      { ...series, recurrence: { ...series.recurrence, exdates: [], endType: "NEVER" } },
      startKey - 1,
      startKey + span
    )[ 0 ];


  return first
    ? first.start
    : series.start;

}


/*
  BLOCK COLOURS

  A block is red when it is blocked and green when it is availability,
  and that is all a visitor ever sees. The admin can paint over the
  default: an event carries an optional color, a "#rrggbb" string,
  and a series carries color RULES on its recurrence so that one
  Monday, every Monday, or everything from a date onward can differ
  from the rest without the series being split into pieces.

  Rules are applied in order and the last one that matches wins, so
  the most recent decision is the one on screen. A rule's color may
  be null, meaning "back to the default for this kind of block".

    { date: "YYYY-MM-DD", color }   this event only
    { weekday: 0-6,       color }   all Mondays
    { from: "YYYY-MM-DD", color }   this and following
*/

const HEX_COLOR =
  /^#[0-9a-f]{6}$/;

/*
  The colour a block has when it has none: the two defaults from the
  settings, red and green unless the admin chose otherwise. Painting a
  block that exact colour is painting it nothing, and is stored that
  way.
*/
function defaultColors() {
  return {
    BLOCKED:
      activeSettings.colors.blocked,
    AVAILABLE:
      activeSettings.colors.available
  };
}

/*
  The basic palette the client offers; anything else is "custom".
*/
const PALETTE_HEXES =
  new Set([
    "#b42318", "#c2410c", "#a16207", "#2f7d4a", "#0f766e",
    "#1d4ed8", "#6d28d9", "#be185d", "#7c4a1e", "#4b5563"
  ]);

function defaultColorFor(
  type
) {
  const colors =
    defaultColors();
  return colors[ type ] || colors.BLOCKED;
}

/*
  Absent (undefined) means "not mentioned" - an update keeps what it
  had. Null or an empty string means "no color": back to the default.
  Anything else must be a six-digit hex color.
*/
function normalizeColor(
  value
) {
  if ( value === undefined ) {
    return undefined;
  }
  if ( value === null || value === "" ) {
    return null;
  }
  const color =
    String( value ).trim().toLowerCase();
  if ( !HEX_COLOR.test( color ) ) {
    bad( "Invalid color. Use a hex color like #1d4ed8." );
  }
  return color;
}

function weekdayOfDate(
  date
) {
  return new Date(
    localDateTimeToMinuteKey( date + "T00:00" ) * 60000
  ).getUTCDay();
}

function validateColorRules(
  rules,
  weekdays,
  type
) {
  if ( rules === undefined ) {
    return undefined;
  }
  if ( !Array.isArray( rules ) ) {
    bad( "Invalid color rules." );
  }
  if ( rules.length > 400 ) {
    bad( "Too many color rules on one series." );
  }
  const out = [];
  for ( const rule of rules ) {
    if ( !rule || typeof rule !== "object" ) {
      bad( "Invalid color rule." );
    }
    let color =
      normalizeColor( rule.color );
    if ( color === defaultColorFor( type ) ) {
      color = null;
    }
    const kinds =
      [ "date", "weekday", "from" ]
        .filter( (key) => rule[ key ] !== undefined && rule[ key ] !== null );
    if ( kinds.length !== 1 || color === undefined ) {
      bad( "A color rule names one date, one weekday or a start date, and a color." );
    }
    if ( rule.date !== undefined && rule.date !== null ) {
      validateDate( rule.date );
      out.push({ date: rule.date, color });
    } else if ( rule.weekday !== undefined && rule.weekday !== null ) {
      const weekday = Number( rule.weekday );
      if ( !Number.isInteger( weekday ) || weekday < 0 || weekday > 6 ) {
        bad( "Invalid weekday in a color rule." );
      }
      /*
        A rule for a weekday the series no longer lands on is dead
        weight; drop it quietly.
      */
      if ( weekdays.includes( weekday ) ) {
        out.push({ weekday, color });
      }
    } else {
      validateDate( rule.from );
      out.push({ from: rule.from, color });
    }
  }
  return out;
}

/*
  The color one occurrence of an event shows: the event's own color,
  overridden by whichever of its rules match, latest last. Null means
  the default for its type.
*/
function resolveOccurrenceColor(
  event,
  date
) {
  let color =
    event.color || null;
  const rules =
    ( event.recurrence && event.recurrence.colorRules ) || [];
  if ( !rules.length ) {
    return color;
  }
  const weekday =
    weekdayOfDate( date );
  for ( const rule of rules ) {
    if ( rule.date !== undefined ) {
      if ( rule.date === date ) color = rule.color;
    } else if ( rule.weekday !== undefined ) {
      if ( rule.weekday === weekday ) color = rule.color;
    } else if ( rule.from !== undefined ) {
      if ( date >= rule.from ) color = rule.color;
    }
  }
  return color;
}

/*
  Paint a series (or one event) at one of four reaches. Each reach
  first clears the rules it supersedes, so "all Mondays" really does
  recolor every Monday, including one that was singled out before,
  and the rule list never grows with decisions nobody can see.
  Returns the event as it should now be stored.
*/
function applyColorScope(
  event,
  { color, scope, date }
) {
  if ( !event.recurrence || scope === "all" ) {
    const next = { ...event };
    if ( color ) next.color = color; else delete next.color;
    if ( next.recurrence && next.recurrence.colorRules ) {
      next.recurrence = { ...next.recurrence };
      delete next.recurrence.colorRules;
    }
    return next;
  }
  validateDate( date );
  const recurrence =
    { ...event.recurrence };
  let rules =
    [ ...( recurrence.colorRules || [] ) ];
  if ( scope === "one" ) {
    rules = rules.filter( (rule) => rule.date !== date );
    rules.push({ date, color });
  } else if ( scope === "following" ) {
    if ( date <= event.start.slice( 0, 10 ) ) {
      return applyColorScope( event, { color, scope: "all" } );
    }
    rules = rules.filter(
      (rule) =>
        !( rule.date !== undefined && rule.date >= date ) &&
        !( rule.from !== undefined && rule.from >= date )
    );
    rules.push({ from: date, color });
  } else if ( scope === "weekday" ) {
    const weekday =
      weekdayOfDate( date );
    if ( !recurrence.weekdays.includes( weekday ) ) {
      bad( "That series has no sessions on that weekday." );
    }
    if ( recurrence.weekdays.length === 1 ) {
      return applyColorScope( event, { color, scope: "all" } );
    }
    rules = rules.filter(
      (rule) =>
        rule.weekday !== weekday &&
        !( rule.date !== undefined && weekdayOfDate( rule.date ) === weekday )
    );
    rules.push({ weekday, color });
  } else {
    bad( "Unknown color scope." );
  }
  /*
    A rule that restores exactly what the block would show without it
    is noise - unless an earlier rule would otherwise still apply.
    Keep it simple: keep every rule; only an empty list is dropped.
  */
  if ( rules.length ) recurrence.colorRules = rules;
  else delete recurrence.colorRules;
  return { ...event, recurrence };
}

/*
  Take one weekday out of a multi-day series - "delete all Mondays".
  A counted series is first pinned to the date it currently ends on,
  so losing a weekday cannot stretch it further into the future to
  make up the numbers. Skips and color rules on that weekday go with
  it. Returns the event as it should now be stored.
*/
function dropWeekday(
  event,
  weekday
) {
  const recurrence =
    event.recurrence;
  if ( !recurrence ) {
    bad( "Only a repeating event has weekdays to remove." );
  }
  if ( !Number.isInteger( weekday ) || !recurrence.weekdays.includes( weekday ) ) {
    bad( "That series has no sessions on that weekday." );
  }
  if ( recurrence.weekdays.length === 1 ) {
    bad( "That is the only day this series meets - delete the series instead." );
  }
  const next =
    { ...recurrence, weekdays: recurrence.weekdays.filter( (day) => day !== weekday ) };
  if ( recurrence.endType === "COUNT" ) {
    const last =
      allOccurrences( { ...event, recurrence: { ...recurrence, exdates: [] } } ).pop();
    next.endType = "ON";
    next.until = ( last || event ).start.slice( 0, 10 );
    delete next.count;
  }
  if ( recurrence.exdates ) {
    next.exdates =
      recurrence.exdates.filter( (date) => weekdayOfDate( date ) !== weekday );
    if ( !next.exdates.length ) delete next.exdates;
  }
  if ( recurrence.colorRules ) {
    next.colorRules =
      recurrence.colorRules.filter(
        (rule) =>
          rule.weekday !== weekday &&
          !( rule.date !== undefined && weekdayOfDate( rule.date ) === weekday )
      );
    if ( !next.colorRules.length ) delete next.colorRules;
  }
  return { ...event, recurrence: next };
}


/*
  RECURRENCE VALIDATION
*/

function validateRecurrence(
  recurrence,
  start,
  type
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


  /*
    Exception dates: single occurrences deleted out of the series, the
    way every calendar's "delete just this one" works. Stored as plain
    YYYY-MM-DD strings on the recurrence.
  */

  const exdates =
    [ ...new Set(
      ( recurrence.exdates || [] )
        .filter( (d) => typeof d === "string" )
    ) ]
      .sort();


  if ( exdates.length > 366 ) {
    bad( "Too many skipped dates on one series." );
  }


  for ( const d of exdates ) {
    validateDate( d );
  }


  if ( exdates.length ) {
    result.exdates = exdates;
  }


  /*
    Color rules ride on the recurrence too. Left out, they are kept
    from the stored series; an explicit list (even empty) replaces it.
  */
  const colorRules =
    validateColorRules(
      recurrence.colorRules,
      weekdays,
      type
    );
  if ( colorRules !== undefined ) {
    result.colorRules = colorRules;
  }



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

/*
  A request arrives from an anonymous visitor, so every field is
  treated as hostile: bounded length, a known set of values, and a
  time that is real, ordered and still ahead of us.
*/

function validateRequest(
  request
) {

  if (
    !request ||
    typeof request !==
    "object"
  ) {

    bad(
      "Invalid request."
    );

  }


  const name =
    String(
      request.name ||
      ""
    ).trim();


  if (
    !name ||
    name.length >
    80
  ) {

    bad(
      "Please enter your name."
    );

  }


  const subject =
    String(
      request.subject ||
      ""
    ).trim();


  if (
    !subject ||
    subject.length >
    80
  ) {

    bad(
      "Please enter the subject."
    );

  }


  const format =
    String(
      request.format ||
      ""
    ).toUpperCase();


  if (
    ![
      "ONLINE",
      "IN_PERSON"
    ].includes(
      format
    )
  ) {

    bad(
      "Please choose online or in person."
    );

  }


  const start =
    normalizeLocalDateTime(
      request.start
    );


  const end =
    normalizeLocalDateTime(
      request.end
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
      "The end time must be after the start time."
    );

  }


  if (
    endKey -
    startKey >
    MAX_REQUEST_MINUTES
  ) {

    bad(
      "A single session cannot run longer than eight hours."
    );

  }


  if (
    startKey <
    currentMinuteKey()
  ) {

    bad(
      "Please choose a time in the future."
    );

  }


  const recurrence =
    request.recurrence
      ? validateRecurrence(
          request.recurrence,
          start
        )
      : null;


  /*
    How to reach them: an email is required, since it is what the
    admin answers with; a phone and a parent or guardian are offered
    but not demanded. All three are seen only by the admin.
  */
  const email =
    String( request.email || "" ).trim().toLowerCase();
  if ( !email || email.length > 120 || !EMAIL_PATTERN.test( email ) ) {
    bad( `Please enter an email address ${ activeSettings.displayName } can reply to.` );
  }
  const phone =
    String( request.phone || "" ).trim().slice( 0, 40 );
  if ( phone && !/^[0-9+()\-.\s]{5,40}$/.test( phone ) ) {
    bad( "That phone number does not look right." );
  }
  const guardian =
    String( request.guardian || "" ).trim().slice( 0, 80 );
  return {
    id:
      crypto.randomUUID(),
    name,
    email,
    ...( phone ? { phone } : {} ),
    ...( guardian ? { guardian } : {} ),
    subject,
    format,
    recurrence,
    start,
    end,
    createdAt:
      new Date()
        .toISOString()
  };

}


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


  /*
    Dates deleted out of the series one at a time. A skipped week still
    counts toward a COUNT-limited series - deleting one Thursday must
    not quietly add a bonus week at the far end.
  */

  const exdates =
    new Set( recurrence.exdates || [] );


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


      if (
        exdates.has(
          minuteKeyToLocalDateTime( occurrenceStart )
            .slice( 0, 10 )
        )
      ) {
        continue;
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
            ),

          /*
            What this block shows, rules applied; the series' own
            color is kept beside it for the editor.
          */
          color:
            resolveOccurrenceColor(
              event,
              minuteKeyToLocalDateTime(
                occurrenceStart
              ).slice( 0, 10 )
            ) || undefined,

          seriesColor:
            event.color ||
            null
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

  /*
    Only a BLOCKED session can conflict with another one. Availability
    that spans booked sessions is not a clash - it is the normal shape
    of this schedule, and the public view is literally built by
    subtracting blocked time out of available time. Checking it warned
    on every ordinary edit, and worse, it refused the internal saves
    that deleting or moving part of a series performs.
  */

  if (
    incoming.type !==
    "BLOCKED"
  ) {

    return {
      total:
        0,

      conflicts:
        []
    };

  }


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

  /*
    The whole week is published, past included: the page draws a line
    at the current time instead of amputating everything behind it, so
    a visitor can see the shape of a day that already happened. What
    has elapsed still cannot be BOOKED - validateRequest refuses any
    request starting before now - but hiding it was a display choice,
    and it was the wrong one.
  */

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


  const blockedSessions =
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
      );


  /*
    Merged only for working out what is left
    open, where overlapping sessions would
    otherwise be subtracted twice.
  */

  const blocked =
    mergeIntervals(
      blockedSessions
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

    Each session is published separately.
    Merging back-to-back ones into a single
    span would hide how many there are, and
    that count is the honest signal of how
    busy the day is.
  */

  const publicBlocked =
    [];


  for (
    const block of blockedSessions
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


  publicBlocked.forEach(
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

/*
  Every stored time is a Pacific wall-clock string, so "now" has to be
  expressed the same way before it can be compared against one. Asking
  Intl for the parts keeps this correct across DST without introducing
  a real timezone conversion anywhere else.
*/

function currentMinuteKey() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          activeSettings.timezoneId,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hourCycle:
          "h23"
      }
    )
      .formatToParts(
        new Date()
      );


  const value =
    {};


  for (
    const part of parts
  ) {

    value[part.type] =
      part.value;

  }


  return localDateTimeToMinuteKey(
    `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`
  );

}


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

function fail(
  message,
  status
) {

  const error =
    new Error(
      message
    );


  error.status =
    status;


  throw error;

}


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

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders          // spread last, so it can override
    }
  });
}

/*
  The public body no longer depends on when it was built - the elapsed
  part of the week ships too, and the "now" line is drawn by the page
  from the visitor's own clock. So the cache needs no clock-driven
  expiry at all: the body changes only when the schedule changes, and
  every write purges the cache tag. The hour cap is a backstop for the
  day a purge fails, nothing more.
*/

function publicCacheHeaders(req, admin) {
  if (admin || req.headers.get("x-admin-password") || req.headers.get("x-admin-token") || req.headers.get("x-session")) {
    return {};                       // admin, or anyone carrying a credential header: never cache
  }
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control":
      "public, s-maxage=3600, durable",
    "Netlify-Cache-Tag": cacheTag(),
    "Vary": "x-admin-password, x-admin-token, x-session"
  };
}

/*
  Exported for the unit tests only; the page never imports this module.
*/

export {
  expandEventsForRange,
  expandWeeklyEvent,
  localDateTimeToMinuteKey,
  buildPublicSchedule,
  findBlockedConflicts,
  normalizeSchedule,
  resolveOccurrenceColor,
  applyColorScope,
  dropWeekday,
  settingsFrom,
  configFrom,
  validateSettings
};


/*
  NETLIFY ROUTE
*/

export const config = {
  path:
    "/api/*"
};