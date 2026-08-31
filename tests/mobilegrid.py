#!/usr/bin/env python3
"""On a phone-sized screen the week grid itself renders - no agenda
list - swiped sideways inside its own scroll, cards and all.

    python3 tests/mobilegrid.py
"""
import asyncio, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8946
BASE = f"http://127.0.0.1:{PORT}"
oks, fails = [], []
def check(name, cond, extra=""):
    (oks if cond else fails).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {extra}" if extra and not cond else ""))

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()

        # Seed on a desktop-sized page.
        seed = await (await b.new_context(viewport={"width": 1400, "height": 950})).new_page()
        await seed.goto(BASE, wait_until="networkidle")
        await seed.click("#adminBtn"); await seed.fill("#adminPasswordInput", "t")
        await seed.click("#loginSubmitBtn"); await seed.wait_for_timeout(700)
        await seed.evaluate("""async () => {
            const cols = [...document.querySelectorAll('.day-column')].map(c => c.dataset.date);
            const tue = cols.find(d => new Date(d + 'T12:00').getDay() === 2);
            const post = (body) => fetch('/api/events', { method: 'POST',
                headers: {'Content-Type': 'application/json', 'x-admin-password': 't'},
                body: JSON.stringify(body) });
            await post({ type: 'AVAILABLE', title: 'Open',
                start: tue + 'T15:00', end: tue + 'T18:00' });
            await post({ id: 'series-1', type: 'BLOCKED', title: 'Maya - Algebra II',
                start: tue + 'T16:00', end: tue + 'T17:00',
                recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [2, 4],
                              endType: 'NEVER' } });
        }""")

        # A phone.
        phone = await (await b.new_context(
            viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
            device_scale_factor=3)).new_page()
        errs = []
        phone.on("pageerror", lambda e: errs.append(str(e)))
        phone.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await phone.goto(BASE, wait_until="networkidle")
        await phone.wait_for_timeout(700)

        grid = await phone.evaluate("""() => {
            const cal = document.getElementById('calendar');
            const style = getComputedStyle(cal);
            return { display: style.display,
                     columns: document.querySelectorAll('.day-column').length,
                     cards: document.querySelectorAll('.event-card').length,
                     agenda: !!document.getElementById('agenda'),
                     scrollable: cal.scrollWidth > cal.clientWidth };
        }""")
        check("the grid renders on a phone", grid["display"] == "grid", str(grid))
        check("all seven day columns are there", grid["columns"] == 7, str(grid))
        check("the week's schedule shows as cards", grid["cards"] == 3, str(grid))
        check("the agenda list is gone", not grid["agenda"], str(grid))
        check("the week swipes sideways inside the grid", grid["scrollable"], str(grid))

        # The phone admin can still log in and see the same grid.
        await phone.click("#adminBtn"); await phone.fill("#adminPasswordInput", "t")
        await phone.click("#loginSubmitBtn"); await phone.wait_for_timeout(700)
        admin_cards = await phone.locator(".event-card").count()
        check("admin on the phone sees the grid too", admin_cards == 4, f"cards={admin_cards}")

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
