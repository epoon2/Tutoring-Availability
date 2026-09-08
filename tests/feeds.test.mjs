// The private calendar feed: booked sessions only, no names, behind the
// feed token. Run: node tests/install-shim.mjs && node tests/feeds.test.mjs
import handler from '../netlify/functions/api.mjs';
import { foldIcsLine, icsText, feedTokenIsValid } from '../netlify/functions/feeds.mjs';
import { getStore } from '@netlify/blobs';

let ran = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  ran++;
  if (cond) console.log('  ok ' + name);
  else fails.push(name + (extra ? `\n    ${extra}` : ''));
};

const TOKEN = 'feed-token-for-tests-0123456789';

// ---- pure helpers
ok('ICS text escapes commas, semicolons and newlines',
  icsText('a,b;c\nd') === 'a\\,b\\;c\\nd');
const long = 'SUMMARY:' + 'x'.repeat(200);
const folded = foldIcsLine(long);
ok('long lines fold at 75 octets with a leading space', folded.split('\r\n').length === 3
  && folded.split('\r\n').slice(1).every(l => l.startsWith(' '))
  && folded.split('\r\n').every(l => Buffer.byteLength(l) <= 75));
ok('a token shorter than 16 characters is never valid', !feedTokenIsValid('short', 'short'));
ok('the right token validates', feedTokenIsValid(TOKEN, TOKEN));
ok('a wrong token does not', !feedTokenIsValid(TOKEN + 'x', TOKEN));

// ---- seed the store the way the app would, around today
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (n) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = today.getUTCDay();
const wed = shift((3 - dow + 7) % 7 || 7);             // next Wednesday
const wedAfter = shift(((3 - dow + 7) % 7 || 7) + 7);  // the one after
const fri = shift((5 - dow + 7) % 7 || 7);

const store = getStore('tutoring-availability');
await store.setJSON('events-v2', [
  { id: 'series-1', type: 'BLOCKED', title: 'Maya - Algebra II', notes: 'chapter 4, review',
    start: wed + 'T16:00', end: wed + 'T17:00',
    recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [3], endType: 'NEVER',
                  exdates: [wedAfter] } },
  { id: 'one-off', type: 'BLOCKED', title: 'Noah', notes: '',
    start: fri + 'T10:00', end: fri + 'T11:30', recurrence: null },
  { id: 'open', type: 'AVAILABLE', title: 'Open',
    start: fri + 'T09:00', end: fri + 'T13:00', recurrence: null },
]);

const get = (path) => handler(new Request('http://localhost/api' + path, { method: 'GET' }));

// ---- gate
delete process.env.CALENDAR_FEED_TOKEN;
ok('the feed is off with no token configured', (await get(`/feed/${TOKEN}/tutoring.ics`)).status === 404);
process.env.CALENDAR_FEED_TOKEN = TOKEN;
ok('a wrong token is a plain 404', (await get(`/feed/nope/tutoring.ics`)).status === 404);
ok('any other feed name is a 404', (await get(`/feed/${TOKEN}/sessions.json`)).status === 404);

// ---- the feed
const res = await get(`/feed/${TOKEN}/tutoring.ics`);
const ics = await res.text();
ok('tutoring.ics serves as text/calendar', res.status === 200
  && res.headers.get('content-type').startsWith('text/calendar'), res.headers.get('content-type'));
ok('and is never cached', res.headers.get('cache-control').includes('no-store'));
ok('lines end in CRLF', ics.includes('\r\n') && !/[^\r]\n/.test(ics));
ok('carries the Los Angeles VTIMEZONE', ics.includes('TZID:America/Los_Angeles')
  && ics.includes('TZNAME:PDT'));
const events = ics.split('BEGIN:VEVENT').length - 1;
// 52 Wednesdays fall inside the year-ahead window whichever weekday
// today is; one is skipped, and the Friday one-off joins them.
ok('the year ahead of Wednesdays, minus the skipped one, plus the Friday',
  events === 52 - 1 + 1, `events=${events}`);
ok('every block reads Tutoring and nothing else',
  (ics.match(/SUMMARY:Tutoring\r\n/g) || []).length === events);
ok('no student name, subject or notes leak', !ics.includes('Maya') && !ics.includes('Noah')
  && !ics.includes('Algebra') && !ics.includes('chapter') && !ics.includes('DESCRIPTION'));
ok('availability is not in the feed', !ics.includes('T090000') && !ics.includes('Open'));
ok('first Wednesday starts at 4 PM local with a TZID',
  ics.includes(`DTSTART;TZID=America/Los_Angeles:${wed.replace(/-/g, '')}T160000`));
ok('the skipped week is missing', !ics.includes(`${wedAfter.replace(/-/g, '')}T160000`));
ok('UIDs are the series id plus the date',
  ics.includes(`UID:series-1-${wed.replace(/-/g, '')}@tutoring-availability`));
ok('the one-off keeps its 90 minutes', ics.includes(`DTEND;TZID=America/Los_Angeles:${fri.replace(/-/g, '')}T113000`));

console.log(fails.length ? '\nFAILED:\n  ' + fails.join('\n  ') : `\nfeeds: all ${ran} checks passed`);
process.exit(fails.length ? 1 : 0);
