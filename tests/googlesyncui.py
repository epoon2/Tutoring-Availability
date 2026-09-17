#!/usr/bin/env python3
"""The Google Calendar sync as the admin sees it: the Sync button only
where the site has credentials, the notice when a change did not reach
Google, and Sync now / Dismiss on that notice.

    python3 tests/googlesyncui.py
"""
import asyncio, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8951
BASE = f"http://127.0.0.1:{PORT}"
CAL = f"{BASE}/ethan"          # the first calendar, at its address
oks, fails = [], []
def check(name, cond, extra=""):
    (oks if cond else fails).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {extra}" if extra and not cond else ""))

def start_server(fake_google):
    env = dict(os.environ)
    if fake_google: env["FAKE_GOOGLE"] = fake_google
    else: env.pop("FAKE_GOOGLE", None)
    server = subprocess.Popen(["node", "tests/server.mjs", str(PORT)], env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for _ in range(50):
        try:
            urllib.request.urlopen(f"{BASE}/index.html", timeout=1).read(); return server
        except Exception:
            time.sleep(0.2)
    print("server failed:", server.stderr.read().decode()[:400]); sys.exit(1)

async def login(page):
    await page.goto(CAL, wait_until="networkidle")
    await page.click("#adminBtn"); await page.fill("#adminPasswordInput", "t")
    await page.click("#loginSubmitBtn"); await page.wait_for_timeout(700)

async def save_session(page):
    box = await page.locator(".day-column").nth(1).bounding_box()
    await page.mouse.click(box["x"] + box["width"]/2, box["y"] + 200)
    await page.wait_for_timeout(400)
    await page.evaluate("""() => {
        document.getElementById('eventType').value = 'BLOCKED';
        document.getElementById('eventTitle').value = 'Maya - Algebra II';
    }""")
    await page.click("#saveEventBtn")
    await page.wait_for_timeout(800)

async def visible(page, sel):
    return await page.evaluate(f"!document.querySelector('{sel}').classList.contains('hidden')")

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        errs = []

        # ---- no credentials: no button, no notice, saves unchanged
        server = start_server("")
        try:
            page = await (await b.new_context(viewport={"width": 1400, "height": 950})).new_page()
            page.on("pageerror", lambda e: errs.append(str(e)))
            await login(page)
            check("without credentials the Sync button stays hidden", not await visible(page, "#googleSyncBtn"))
            await save_session(page)
            check("a save with sync off shows no notice", not await visible(page, "#syncNotice"))
            check("and the card is on the schedule", await page.locator(".event-card").count() == 1)
        finally:
            server.terminate(); server.wait()

        # ---- credentials present, Google refusing
        server = start_server("failed")
        try:
            page = await (await b.new_context(viewport={"width": 1400, "height": 950})).new_page()
            page.on("pageerror", lambda e: errs.append(str(e)))
            await login(page)
            check("with credentials the Sync button shows for the admin", await visible(page, "#googleSyncBtn"))
            await save_session(page)
            text = await page.text_content("#syncNoticeText")
            check("a save Google refused shows the notice", await visible(page, "#syncNotice"))
            check("the notice says the save stood and why Google did not",
                  "Saved here, but Google Calendar was not updated" in text and "401" in text, text)
            check("the session was still saved", await page.locator(".event-card").count() == 1)
            check("the notice offers Sync now", await visible(page, "#syncNoticeRetryBtn"))
            await page.click("#syncNoticeCloseBtn"); await page.wait_for_timeout(200)
            check("Dismiss hides it", not await visible(page, "#syncNotice"))
            await page.click("#googleSyncBtn"); await page.wait_for_timeout(600)
            text = await page.text_content("#syncNoticeText")
            check("Sync now against a Google that still refuses says so, with the reason",
                  await visible(page, "#syncNotice") and "did not finish" in text and "401" in text, text)
            await page.evaluate("document.getElementById('exitAdminBtn').click()"); await page.wait_for_timeout(400)
            check("leaving admin hides the notice and the button",
                  not await visible(page, "#syncNotice") and not await visible(page, "#googleSyncBtn"))
        finally:
            server.terminate(); server.wait()

        # ---- credentials present, Google accepting
        server = start_server("ok")
        try:
            page = await (await b.new_context(viewport={"width": 1400, "height": 950})).new_page()
            page.on("pageerror", lambda e: errs.append(str(e)))
            await login(page)
            await save_session(page)
            check("a save Google accepted shows no notice", not await visible(page, "#syncNotice"))
            await page.click("#googleSyncBtn"); await page.wait_for_timeout(600)
            text = await page.text_content("#syncNoticeText")
            check("Sync Google Calendar reports what it pushed",
                  await visible(page, "#syncNotice") and "1 session pushed" in text, text)
            check("a good result reads as good and hides Sync now",
                  await page.evaluate("document.getElementById('syncNotice').classList.contains('ok')")
                  and not await visible(page, "#syncNoticeRetryBtn"))
        finally:
            server.terminate(); server.wait()

        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no page errors", not real, str(real[:3]))
        print(f"\n{len(oks)} passed, {len(fails)} failed")
        await b.close()
        return 1 if fails else 0

subprocess.run(["node", "tests/install-shim.mjs"], check=True, stdout=subprocess.DEVNULL)
sys.exit(asyncio.run(main()))
