#!/usr/bin/env python3
"""Several calendars per account: the dashboard lists and makes
calendars, each with its own address, and can delete one.

    python3 tests/multical.py
"""
import asyncio, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8998
BASE = f"http://127.0.0.1:{PORT}"
oks, fails = [], []
def check(name, cond, extra=""):
    (oks if cond else fails).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {extra}" if extra and not cond else ""))

async def hidden(page, sel):
    return await page.evaluate(f"document.querySelector('{sel}').classList.contains('hidden')")

async def signup(page, name, title, email):
    await page.goto(BASE + "/?signup", wait_until="networkidle"); await page.wait_for_timeout(300)
    await page.fill("#signupName", name); await page.fill("#signupTitle", title)
    await page.fill("#signupEmail", email); await page.fill("#signupPassword", "pass-word-1")
    await page.click("#signupSubmit"); await page.wait_for_load_state("networkidle"); await page.wait_for_timeout(800)

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        page = await (await b.new_context(viewport={"width": 1300, "height": 900})).new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))

        # ---- one calendar: straight in, no switch, but a way to the dashboard
        await signup(page, "Maya Chen", "Maya's Tutoring", "maya@example.com")
        check("sign-up with no email set up lands straight on the calendar, confirmed", page.url.endswith("/maya-chen") and not await hidden(page, "#adminBanner"))
        await page.click("#profileBtn"); await page.wait_for_timeout(200)
        check("the profile menu offers My calendars", not await hidden(page, "#dashboardLink"))
        await page.click("#dashboardLink"); await page.wait_for_load_state("networkidle"); await page.wait_for_timeout(500)

        # ---- the dashboard
        check("the dashboard lists the one calendar as the main one, public", page.url.endswith("/dashboard")
              and await page.evaluate("document.querySelectorAll('.cal-card').length") == 1
              and "Main calendar" in await page.text_content(".cal-card") and "Public" in await page.text_content(".cal-card"))
        await page.fill("#newCalName", "Piano lessons")
        await page.click("#newCalBtn"); await page.wait_for_timeout(800)
        cards = await page.evaluate("[...document.querySelectorAll('.cal-card')].map(c => c.dataset.slug)")
        check("a new calendar is made from its name", cards == ["maya-chen", "piano-lessons"], str(cards))
        check("the main calendar cannot be deleted from here, the new one can", await page.evaluate("!document.querySelector('.cal-card[data-slug=\"maya-chen\"] .danger-link') && !!document.querySelector('.cal-card[data-slug=\"piano-lessons\"] .danger-link')"))
        await page.goto(BASE + "/", wait_until="networkidle"); await page.wait_for_timeout(800)
        check("the home page now sends her to the dashboard, since she has two", page.url.endswith("/dashboard"))

        # ---- the second calendar is hers, and gets a block
        await page.goto(BASE + "/piano-lessons", wait_until="networkidle"); await page.wait_for_timeout(600)
        check("the new calendar opens in admin mode with its own title and her name", not await hidden(page, "#adminBanner") and await page.text_content("#portalTitle") == "Piano lessons"
              and await page.text_content("#profileName") == "Maya Chen")
        await page.evaluate("""async () => {
            const cols = [...document.querySelectorAll('.day-column')].map(c => c.dataset.date);
            const wed = cols.find(d => new Date(d + 'T12:00').getDay() === 3);
            const token = JSON.parse(localStorage.getItem('calendarSession')).token;
            await fetch('/api/events?calendar=piano-lessons', { method: 'POST', headers: {'Content-Type': 'application/json', 'x-session': token},
                body: JSON.stringify({ type: 'BLOCKED', title: 'Kai - piano', start: wed + 'T16:00', end: wed + 'T17:00' }) });
        }""")

        # ---- deleting a calendar
        await page.goto(BASE + "/dashboard", wait_until="networkidle"); await page.wait_for_timeout(600)
        page.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.click(".cal-card[data-slug='piano-lessons'] .danger-link"); await page.wait_for_timeout(800)
        cards = await page.evaluate("[...document.querySelectorAll('.cal-card')].map(c => c.dataset.slug)")
        check("deleting the second calendar leaves the first", cards == ["maya-chen"], str(cards))
        await page.goto(BASE + "/piano-lessons", wait_until="networkidle"); await page.wait_for_timeout(500)
        check("and its address is gone", await page.evaluate("document.body.classList.contains('calendar-missing')"))

        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no page errors", not real, str(real[:3]))
        print(f"\n{len(oks)} passed, {len(fails)} failed")
        await b.close()
        return 1 if fails else 0

def run():
    subprocess.run(["node", "tests/install-shim.mjs"], check=True, stdout=subprocess.DEVNULL)
    env = dict(os.environ)
    env.pop("FAKE_MAIL", None)
    server = subprocess.Popen(["node", "tests/server.mjs", str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=env)
    for _ in range(50):
        try:
            urllib.request.urlopen(f"{BASE}/index.html", timeout=1).read(); break
        except Exception:
            time.sleep(0.2)
    else:
        print("server failed:", server.stderr.read().decode()[:400]); return 1
    try:
        return asyncio.run(main())
    finally:
        server.terminate()

sys.exit(run())
