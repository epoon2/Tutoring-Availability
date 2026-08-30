#!/usr/bin/env python3
"""Drags repeating blocks in a real browser and answers the three-reach
question each time: one block detaches to the kerb-snapped time, a cut
moves this-and-following to a new weekday, the whole series shifts an
hour with its past, and Never mind changes nothing.

    python3 tests/dragscopes.py
"""
import asyncio, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8945
BASE = f"http://127.0.0.1:{PORT}"
DAY_START = 8
oks, fails = [], []
def check(name, cond, extra=""):
    (oks if cond else fails).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {extra}" if extra and not cond else ""))

def y_for(minutes):
    return int((minutes - DAY_START * 60) / 60 * 64)

async def click_choice(page, prefix):
    await page.wait_for_selector(".choice-modal")
    await page.evaluate(
        """(prefix) => [...document.querySelectorAll('.choice-modal button')]
            .find(b => b.textContent.trim().startsWith(prefix)).click()""", prefix)
    await page.wait_for_timeout(900)

async def drag_card(page, from_date, to_date, to_minutes):
    src = page.locator(f'.day-column[data-date="{from_date}"] .event-card').first
    dst = page.locator(f'.day-column[data-date="{to_date}"]')
    await src.drag_to(dst, target_position={"x": 60, "y": y_for(to_minutes)})
    await page.wait_for_timeout(400)

async def fetch_week(page, start, end):
    return await page.evaluate("""async ([start, end]) => {
        const r = await fetch(`/api/events?start=${start}&end=${end}`,
            { headers: { 'x-admin-password': 't' } });
        return (await r.json()).events;
    }""", [start, end])

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        page = await (await b.new_context(viewport={"width": 1400, "height": 950})).new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

        await page.goto(BASE, wait_until="networkidle")
        await page.click("#adminBtn"); await page.fill("#adminPasswordInput", "t")
        await page.click("#loginSubmitBtn"); await page.wait_for_timeout(700)

        dates = await page.evaluate("""() => {
            const cols = [...document.querySelectorAll('.day-column')].map(c => c.dataset.date);
            const shift = (s, n) => { const [y,m,d] = s.split('-').map(Number);
                return new Date(Date.UTC(y, m-1, d+n)).toISOString().slice(0,10); };
            const tue = cols.find(d => new Date(d + 'T12:00').getDay() === 2);
            const thu = cols.find(d => new Date(d + 'T12:00').getDay() === 4);
            const fri = cols.find(d => new Date(d + 'T12:00').getDay() === 5);
            return { tue, thu, fri, lastTue: shift(tue, -7),
                     nextTue: shift(tue, 7), nextWed: shift(tue, 8), nextThu: shift(thu, 7),
                     afterWed: shift(tue, 15), afterThu: shift(thu, 14),
                     weekStart: cols[0], weekEnd: cols[6],
                     nextStart: shift(cols[0], 7), nextEnd: shift(cols[6], 7),
                     afterStart: shift(cols[0], 14), afterEnd: shift(cols[6], 14),
                     lastStart: shift(cols[0], -7), lastEnd: shift(cols[6], -7) };
        }""")
        await page.evaluate("""async (anchor) => {
            await fetch('/api/events', { method: 'POST',
                headers: {'Content-Type': 'application/json', 'x-admin-password': 't'},
                body: JSON.stringify({ id: 'series-1', type: 'BLOCKED', title: 'Maya - Algebra II',
                    start: anchor + 'T16:00', end: anchor + 'T17:00',
                    recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [2, 4],
                                  endType: 'NEVER' } }) });
        }""", dates["lastTue"])
        await page.reload(wait_until="networkidle")
        await page.click("#adminBtn"); await page.fill("#adminPasswordInput", "t")
        await page.click("#loginSubmitBtn"); await page.wait_for_timeout(800)

        # ---- The grey ghost clicks to the snapped quarter-hour under the drag.
        ghost = await page.evaluate("""([thu, fri]) => {
            const card = document.querySelector(`.day-column[data-date="${thu}"] .event-card`);
            const col = document.querySelector(`.day-column[data-date="${fri}"]`);
            const dt = new DataTransfer();
            card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
            const rect = col.getBoundingClientRect();
            const hover = (mins) => {
                const y = rect.top + (mins - 8 * 60) / 60 * 64;
                col.dispatchEvent(new DragEvent('dragover',
                    { bubbles: true, cancelable: true, clientY: y, dataTransfer: dt }));
                const g = document.querySelector('.drag-ghost');
                return g ? { top: g.style.top, height: g.style.height,
                             col: g.closest('.day-column').dataset.date,
                             label: g.textContent } : null;
            };
            const onHour = hover(16 * 60 + 7);      // pointing at 4:07 PM
            const onQuarter = hover(16 * 60 + 22);  // pointing at 4:22 PM
            card.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
            return { onHour, onQuarter, goneAfter: !document.querySelector('.drag-ghost') };
        }""", [dates["thu"], dates["fri"]])
        g = ghost["onHour"]
        q = ghost["onQuarter"]
        check("a ghost appears in the hovered column", bool(g) and g["col"] == dates["fri"], str(g))
        check("the ghost clicks to the 4:00 slot", bool(g) and g["top"] == "512px", str(g))
        check("the ghost carries the block's hour", bool(g) and g["height"] == "64px", str(g))
        check("the ghost names the landing times", bool(g) and "4" in g["label"]
              and "5 PM" in g["label"], str(g))
        check("a lower hover clicks to the quarter slot", bool(q) and q["top"] == "528px"
              and "4:15" in q["label"], str(q))
        check("letting go clears the ghost", ghost["goneAfter"])

        # ---- Never mind: a cancelled drag changes nothing.
        await drag_card(page, dates["thu"], dates["fri"], 16 * 60)
        await page.wait_for_selector(".choice-modal")
        await page.evaluate(
            """() => [...document.querySelectorAll('.choice-modal button')]
                .find(b => b.textContent.trim() === 'Never mind').click()""")
        await page.wait_for_timeout(600)
        ev = await fetch_week(page, dates["weekStart"], dates["weekEnd"])
        check("Never mind leaves the week alone",
              sorted(e["start"][:10] for e in ev) == sorted([dates["tue"], dates["thu"]]),
              str([e["start"] for e in ev]))

        # ---- Just this block: Thursday detaches to Friday, snapped to :00.
        await drag_card(page, dates["thu"], dates["fri"], 16 * 60 + 7)
        await click_choice(page, "Just this block")
        ev = await fetch_week(page, dates["weekStart"], dates["weekEnd"])
        loose = [e for e in ev if not e.get("recurrence")]
        check("the moved block is a standalone on Friday", len(loose) == 1 and
              loose[0]["start"][:10] == dates["fri"], str([e["start"] for e in ev]))
        check("the drop snapped to the quarter hour", loose and
              loose[0]["start"].endswith("T16:00"), loose and loose[0]["start"])
        check("the old Thursday is gone, Tuesday stays",
              sorted(e["start"][:10] for e in ev if e.get("recurrence")) == [dates["tue"]],
              str([e["start"] for e in ev]))
        ev = await fetch_week(page, dates["nextStart"], dates["nextEnd"])
        check("next week keeps both sessions", len(ev) == 2, str([e["start"] for e in ev]))
        status = await page.text_content("#status")
        check("status says the other weeks keep their time",
              "Every other week keeps its time" in status, status)

        # ---- This and every one after: next week's Tuesday moves to Wednesday.
        await page.click("#nextWeekBtn"); await page.wait_for_timeout(700)
        await drag_card(page, dates["nextTue"], dates["nextWed"], 16 * 60)
        await click_choice(page, "This and every one after")
        ev = await fetch_week(page, dates["nextStart"], dates["nextEnd"])
        check("next week now runs Wed and Thu",
              sorted(e["start"][:10] for e in ev) == sorted([dates["nextWed"], dates["nextThu"]]),
              str([e["start"] for e in ev]))
        ev = await fetch_week(page, dates["afterStart"], dates["afterEnd"])
        check("the week after follows the new pattern",
              sorted(e["start"][:10] for e in ev) == sorted([dates["afterWed"], dates["afterThu"]]),
              str([e["start"] for e in ev]))
        ev = await fetch_week(page, dates["weekStart"], dates["weekEnd"])
        recurring_days = sorted(e["start"][:10] for e in ev if e.get("recurrence"))
        check("this week is untouched by the cut", recurring_days == [dates["tue"]],
              str(recurring_days))

        # ---- The whole series: this week's Tuesday an hour later, past included.
        await page.click("#todayBtn"); await page.wait_for_timeout(700)
        await drag_card(page, dates["tue"], dates["tue"], 17 * 60)
        await click_choice(page, "The whole series")
        ev = await fetch_week(page, dates["weekStart"], dates["weekEnd"])
        tue_ev = [e for e in ev if e["start"][:10] == dates["tue"]]
        check("this week's Tuesday runs at 5 PM", tue_ev and
              tue_ev[0]["start"].endswith("T17:00"), str([e["start"] for e in ev]))
        ev = await fetch_week(page, dates["lastStart"], dates["lastEnd"])
        check("last week's Tuesday moved with it", any(
              e["start"] == dates["lastTue"] + "T17:00" for e in ev),
              str([e["start"] for e in ev]))
        ev = await fetch_week(page, dates["nextStart"], dates["nextEnd"])
        check("the split-off series keeps its own time", all(
              e["start"].endswith("T16:00") for e in ev), str([e["start"] for e in ev]))

        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no console errors", not real, str(real[:3]))

        print(f"\n{len(oks)} passed, {len(fails)} failed")
        await b.close()
        return 1 if fails else 0

def run():
    subprocess.run(["node", "tests/install-shim.mjs"], check=True)
    server = subprocess.Popen(["node", "tests/server.mjs", str(PORT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for _ in range(50):
        try:
            urllib.request.urlopen(f"{BASE}/index.html", timeout=1).read()
            break
        except Exception:
            time.sleep(0.2)
    else:
        print("server failed:", server.stderr.read().decode()[:400]); return 1
    try:
        return asyncio.run(main())
    finally:
        server.terminate()

sys.exit(run())
