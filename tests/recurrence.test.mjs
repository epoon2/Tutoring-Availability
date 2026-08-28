// Unit tests for weekly expansion with exception dates, run against the
// REAL server module (Netlify imports are shimmed in node_modules):
//   node tests/recurrence.test.mjs
import {
    expandWeeklyEvent, localDateTimeToMinuteKey
} from '../netlify/functions/api.mjs';

let n = 0;
function ok(cond, name, extra = '') {
    n++;
    if (!cond) { console.error('FAIL', name, extra); process.exit(1); }
    console.log('  ok', name);
}

const minute = (s) => localDateTimeToMinuteKey(s);

// A Tue/Thu series: Sep 2026. Tue Sep 1, Thu Sep 3, Tue Sep 8, Thu Sep 10...
function series(extra = {}) {
    return {
        id: 'ev1', type: 'BLOCKED', title: 'Maya',
        start: '2026-09-01T16:00', end: '2026-09-01T17:00',
        recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [2, 4], endType: 'NEVER', ...extra }
    };
}

const rangeStart = minute('2026-08-30T00:00');
const rangeEnd = minute('2026-09-13T00:00');

{   // baseline: two weeks -> four occurrences
    const out = expandWeeklyEvent(series(), rangeStart, rangeEnd);
    ok(out.length === 4, 'two weeks of Tue/Thu is four sessions', String(out.length));
}

{   // skip one Thursday: that one vanishes, everything else stays
    const out = expandWeeklyEvent(series({ exdates: ['2026-09-03'] }), rangeStart, rangeEnd);
    const dates = out.map((o) => o.start.slice(0, 10));
    ok(!dates.includes('2026-09-03'), 'the skipped Thursday is gone');
    ok(dates.includes('2026-09-01'), 'that week\'s Tuesday stays');
    ok(dates.includes('2026-09-10'), 'next week\'s Thursday stays');
    ok(out.length === 3, 'exactly one session removed', String(dates));
}

{   // a COUNT series must not grow a bonus week when one is skipped
    const plain = expandWeeklyEvent(series({ endType: 'COUNT', count: 4 }), rangeStart, minute('2026-10-01T00:00'));
    const skipped = expandWeeklyEvent(series({ endType: 'COUNT', count: 4, exdates: ['2026-09-03'] }),
        rangeStart, minute('2026-10-01T00:00'));
    ok(plain.length === 4, 'count series delivers its count', String(plain.length));
    ok(skipped.length === 3, 'skipping inside a count series removes, never extends', String(skipped.length));
    ok(plain[plain.length - 1].start === skipped[skipped.length - 1].start,
       'the series still ends on the same day');
}

{   // skipping the LAST occurrence of a count series terminates cleanly
    const out = expandWeeklyEvent(series({ endType: 'COUNT', count: 2, exdates: ['2026-09-03'] }),
        rangeStart, minute('2026-10-01T00:00'));
    ok(out.length === 1 && out[0].start.slice(0, 10) === '2026-09-01',
       'skipping the final occurrence leaves only the first', JSON.stringify(out.map(o => o.start)));
}

{   // two exdates
    const out = expandWeeklyEvent(series({ exdates: ['2026-09-01', '2026-09-10'] }), rangeStart, rangeEnd);
    const dates = out.map((o) => o.start.slice(0, 10));
    ok(dates.join(',') === '2026-09-03,2026-09-08', 'multiple skips each remove their own week', dates.join(','));
}

console.log(`recurrence: all ${n} checks passed`);
