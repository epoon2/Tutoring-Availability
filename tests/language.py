#!/usr/bin/env python3
"""Languages: a visitor's browser language picks the page's language
when it is one of ours, the header menu changes it and the choice
sticks, the calendar's own default applies to everyone else, and the
owner's tools stay in English.

    python3 tests/language.py
"""
import asyncio, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8997
BASE = f"http://127.0.0.1:{PORT}"
CAL = f"{BASE}/ethan"
oks, fails = [], []
def check(name, cond, extra=""):
    (oks if cond else fails).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {extra}" if extra and not cond else ""))

async def text(page, sel):
    return (await page.text_content(sel) or "").strip()

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        errs = []

        # ---- an English browser
        page = await (await b.new_context(viewport={"width": 1300, "height": 900}, locale="en-US")).new_page()
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(CAL, wait_until="networkidle"); await page.wait_for_timeout(400)
        check("an English browser reads English", await text(page, "#requestBtn") == "Request a session" and await text(page, "#todayBtn") == "Today")
        check("the header offers six languages, English chosen", await page.evaluate("document.getElementById('langSelect').options.length") == 6
              and await page.evaluate("document.getElementById('langSelect').value") == "en")
        check("the document is marked as English", await page.evaluate("document.documentElement.lang") == "en")

        # ---- switching in the header
        await page.select_option("#langSelect", "es"); await page.wait_for_timeout(600)
        check("Spanish: the header and toolbar change", await text(page, "#requestBtn") == "Solicitar una sesión" and await text(page, "#todayBtn") == "Hoy"
              and await text(page, "#adminBtn") == "Iniciar sesión", await text(page, "#requestBtn"))
        check("the status line too", "Ethan" in await text(page, "#updatedLabel") and "horario" in await text(page, "#updatedLabel"), await text(page, "#updatedLabel"))
        week_label = (await text(page, "#weekLabel")).lower()
        check("and the week label speaks Spanish", any(m in week_label for m in ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]), week_label)
        await page.click("#requestBtn"); await page.wait_for_timeout(300)
        check("the request form is in Spanish, owner named", await text(page, "#requestModalTitle") == "Solicitar una sesión"
              and "Ethan lo confirme" in await text(page, "#requestIntro") and await text(page, "#sendRequestBtn") == "Enviar solicitud"
              and await page.get_attribute("#requestName", "placeholder") == "p. ej. Juan")
        letters = await page.evaluate("[...document.querySelectorAll('#requestModal .weekday-btn')].map(b => b.textContent.trim())")
        check("weekday letters follow", letters == ["D", "L", "M", "X", "J", "V", "S"], str(letters))
        await page.evaluate("document.getElementById('sendRequestBtn').click()"); await page.wait_for_timeout(300)
        check("a validation message is in Spanish", await text(page, "#requestError") == "Escribe tu nombre.", await text(page, "#requestError"))
        await page.evaluate("document.querySelector('#requestModal [data-close]').click()")
        check("Cancel closes it, and the choice is stored on the device", await page.evaluate("localStorage.getItem('lang')") == "es")
        await page.reload(wait_until="networkidle"); await page.wait_for_timeout(400)
        check("a reload keeps Spanish", await text(page, "#todayBtn") == "Hoy" and await page.evaluate("document.getElementById('langSelect').value") == "es")

        await page.select_option("#langSelect", "zh"); await page.wait_for_timeout(600)
        check("Chinese", await text(page, "#requestBtn") == "预约时段" and await page.evaluate("document.documentElement.lang") == "zh-CN")
        await page.select_option("#langSelect", "en"); await page.wait_for_timeout(600)
        check("and back to English", await text(page, "#requestBtn") == "Request a session")

        # ---- the owner's tools stay English whatever the language
        await page.select_option("#langSelect", "fr"); await page.wait_for_timeout(400)
        await page.click("#adminBtn"); await page.wait_for_timeout(200)
        check("the log-in dialog (admin password, first calendar) is English", await text(page, "#loginTitle") == "Admin access")
        await page.fill("#adminPasswordInput", "t"); await page.click("#loginSubmitBtn"); await page.wait_for_timeout(700)
        check("the admin banner and Settings are English", "Admin mode" in await text(page, "#adminBanner"))
        await page.evaluate("document.getElementById('settingsBtn').click()"); await page.wait_for_timeout(500)
        check("Settings offers a default language for visitors, English", await page.evaluate("document.getElementById('settingLanguage').value") == "en"
              and await text(page, "#settingsModal h2") == "Settings")
        await page.select_option("#settingLanguage", "vi")
        await page.click("#saveSettingsBtn"); await page.wait_for_timeout(900)
        check("saving keeps this device's own choice (French)", await text(page, "#todayBtn") == "Aujourd’hui", await text(page, "#todayBtn"))

        # ---- a Vietnamese default: a German browser gets it, a Korean browser gets Korean
        german = await (await b.new_context(viewport={"width": 1300, "height": 900}, locale="de-DE")).new_page()
        await german.goto(CAL, wait_until="networkidle"); await german.wait_for_timeout(500)
        check("a browser in a language we lack reads the calendar's default (Vietnamese)", await text(german, "#requestBtn") == "Đặt buổi học", await text(german, "#requestBtn"))
        korean = await (await b.new_context(viewport={"width": 1300, "height": 900}, locale="ko-KR")).new_page()
        await korean.goto(CAL, wait_until="networkidle"); await korean.wait_for_timeout(500)
        check("a Korean browser reads Korean", await text(korean, "#requestBtn") == "세션 요청", await text(korean, "#requestBtn"))
        check("the theme button's tooltip follows too", await korean.get_attribute("#themeBtn", "title") == "라이트/다크 전환")

        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no page errors", not real, str(real[:3]))
        print(f"\n{len(oks)} passed, {len(fails)} failed")
        await b.close()
        return 1 if fails else 0

def run():
    subprocess.run(["node", "tests/install-shim.mjs"], check=True, stdout=subprocess.DEVNULL)
    server = subprocess.Popen(["node", "tests/server.mjs", str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
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
