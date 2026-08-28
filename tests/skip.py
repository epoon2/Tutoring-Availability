#!/usr/bin/env python3
"""Drives the skip-one-week flow in a real browser: a Tue/Thu series loses
just one Thursday, keeps every other session, and the series survives.

    python3 tests/skip.py
"""
import asyncio, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8942
BASE = f"http://127.0.0.1:{PORT}"
oks, fails = [], []
def check(name, cond, extra=""):
    (oks if cond else fails).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {extra}" if extra and not cond else ""))

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        page = await (await b.new_context(viewport={"width": 1400, "height": 950})).new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("dialog", lambda d: d.accept())

        await page.goto(BASE, wait_until="networkidle")
        await page.click("#adminBtn"); await page.fill("#adminPasswordInput", "t")
        await page.click("#loginSubmitBtn"); await page.wait_for_timeout(700)

        # Seed a Tue/Thu weekly series anchored on this week's Tuesday.
        seeded = await page.evaluate("""async () => {
            const cols = [...document.querySelectorAll('.day-column')].map(c => c.dataset.date);
            const tuesday = cols.find(d => new Date(d + 'T12:00').getDay() === 2);
            const ev = {
                id: 'series-1', type: 'BLOCKED', title: 'Maya - Algebra II',
                start: tuesday + 'T16:00', end: tuesday + 'T17:00',
                recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [2, 4], endType: 'NEVER' }
            };
            await fetch('/api/events', { method: 'POST',
                headers: {'Content-Type': 'application/json', 'x-admin-password': 't'},
                body: JSON.stringify(ev) });
            return tuesday;
        }""")
        await page.reload(wait_until="networkidle")
        await page.click("#adminBtn"); await page.fill("#adminPasswordInput", "t")
        await page.click("#loginSubmitBtn"); await page.wait_for_timeout(800)

        cards = await page.locator(".event-card").count()
        check("series renders both weekdays this week", cards == 2, f"cards={cards}")

        # Right-click the SECOND occurrence (Thursday) and read the menu.
        await page.locator(".event-card").nth(1).click(button="right")
        await page.wait_for_timeout(300)
        items = await page.evaluate("[...document.querySelectorAll('.context-menu-item')].map(i => i.textContent.trim())")
        check("menu names series verbs", any(i == "Edit series" for i in items) and any(i == "Delete series" for i in items), str(items))
        check("menu offers skipping this week", any(i.startswith("Skip just this week") for i in items), str(items))

        await page.evaluate("""() => [...document.querySelectorAll('.context-menu-item')]
            .find(i => i.textContent.trim().startsWith('Skip just this week')).click()""")
        await page.wait_for_timeout(900)   # confirm auto-accepted; loadWeek refreshes

        cards_after = await page.locator(".event-card").count()
        check("this week lost exactly the one session", cards_after == 1, f"cards={cards_after}")
        status = await page.text_content("#status")
        check("status says the series is untouched", "series is untouched" in status, status)

        # Next week must still have both.
        await page.click("#nextWeekBtn"); await page.wait_for_timeout(800)
        next_cards = await page.locator(".event-card").count()
        check("next week keeps both sessions", next_cards == 2, f"cards={next_cards}")

        # And the week after (paranoia).
        await page.click("#nextWeekBtn"); await page.wait_for_timeout(800)
        check("week after keeps both sessions", await page.locator(".event-card").count() == 2)

        # Back to this week: still one, and the survivor is the Tuesday.
        await page.click("#todayBtn"); await page.wait_for_timeout(800)
        survivor = await page.evaluate("""() => {
            const card = document.querySelector('.event-card');
            const col = card && card.closest('.day-column');
            return col ? new Date(col.dataset.date + 'T12:00').getDay() : -1;
        }""")
        check("the survivor is the Tuesday", survivor == 2, f"weekday={survivor}")

        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no console errors", not real, str(real[:3]))

        print(f"\n{len(oks)} passed, {len(fails)} failed")
        await b.close()
        return 1 if fails else 0

def run():
    subprocess.run([sys.executable if False else "node", "tests/install-shim.mjs"], check=True)
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
