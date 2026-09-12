#!/usr/bin/env python3
"""The History drawer: every step listed with what it changed, "Undo to
here" reaching back several steps in one go, and "Restore" putting one
deleted session back on its own.

    python3 tests/history.py
"""
import asyncio, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8967
BASE = f"http://127.0.0.1:{PORT}"
oks, fails = [], []
def check(name, cond, extra=""):
    (oks if cond else fails).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {extra}" if extra and not cond else ""))

async def cards(page):
    return await page.locator(".event-card").count()

async def steps(page):
    return await page.evaluate("""() => [...document.querySelectorAll('#historyList .history-step')].map(s => ({
        label: s.querySelector('.history-step-label').textContent.trim(),
        when: s.querySelector('.history-step-when').textContent.trim(),
        lines: [...s.querySelectorAll('.history-change')].map(l => l.textContent.replace(/\\s+/g, ' ').trim()),
        buttons: [...s.querySelectorAll('.history-step-actions button')].map(b => b.textContent.trim()) }))""")

async def post(page, body, label):
    return await page.evaluate("""async ([body, label]) => {
        const r = await fetch('/api/events', { method: 'POST',
            headers: {'Content-Type': 'application/json', 'x-admin-password': 't', 'x-action-label': label},
            body: JSON.stringify(body) });
        return (await r.json()).id; }""", [body, label])

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        page = await (await b.new_context(viewport={"width": 1400, "height": 1000})).new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))

        await page.goto(BASE, wait_until="networkidle")
        await page.click("#adminBtn"); await page.fill("#adminPasswordInput", "t")
        await page.click("#loginSubmitBtn"); await page.wait_for_timeout(700)

        # ---- empty history reads as such
        await page.click("#historyBtn"); await page.wait_for_timeout(500)
        shown = await page.evaluate("!document.getElementById('historyDrawerBackdrop').classList.contains('hidden')")
        empty = await page.text_content("#historyList")
        check("History opens and says there is nothing yet", shown and "No changes recorded yet" in empty, empty[:80])
        await page.click("#closeHistoryDrawerBtn"); await page.wait_for_timeout(300)

        # ---- three steps: a series, a one-off, and a delete of the series
        dates = await page.evaluate("""() => {
            const cols = [...document.querySelectorAll('.day-column')].map(c => c.dataset.date);
            return { tue: cols.find(d => new Date(d + 'T12:00').getDay() === 2),
                     wed: cols.find(d => new Date(d + 'T12:00').getDay() === 3) }; }""")
        maya = await post(page, { "type": "BLOCKED", "title": "Maya - Algebra II",
            "start": dates["tue"] + "T16:00", "end": dates["tue"] + "T17:00",
            "recurrence": { "frequency": "WEEKLY", "interval": 1, "weekdays": [2, 4], "endType": "NEVER" } }, "add session")
        noah = await post(page, { "type": "BLOCKED", "title": "Noah", "notes": "",
            "start": dates["wed"] + "T10:00", "end": dates["wed"] + "T11:00", "recurrence": None }, "add session")
        await page.click("#todayBtn"); await page.wait_for_timeout(700)
        check("three cards on the week (Tue, Thu, Wed)", await cards(page) == 3, f"cards={await cards(page)}")

        # delete the series through the UI so the label is the real one
        await page.evaluate("""() => {
            const card = [...document.querySelectorAll('.event-card')].find(c =>
                new Date(c.closest('.day-column').dataset.date + 'T12:00').getDay() === 2);
            card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })); }""")
        await page.wait_for_timeout(250)
        await page.evaluate("""() => [...document.querySelectorAll('.context-menu-item')].find(i => i.textContent.trim() === 'Delete…').click()""")
        await page.wait_for_selector(".choice-modal")
        await page.evaluate("""() => { [...document.querySelectorAll('.choice-modal .choice-radio-row')]
            .find(r => r.textContent.trim() === 'All events, past and future').querySelector('input').click();
            [...document.querySelectorAll('.choice-modal button')].find(b => b.textContent.trim() === 'OK').click(); }""")
        await page.wait_for_timeout(900)
        check("the series is gone, Noah stays", await cards(page) == 1, f"cards={await cards(page)}")

        # ---- the list
        await page.click("#historyBtn"); await page.wait_for_timeout(600)
        st = await steps(page)
        check("three steps, newest first", [s["label"] for s in st] == ["Delete the whole series", "Add session", "Add session"],
              str([s["label"] for s in st]))
        top = st[0]
        check("the delete step lists what it removed, with its days and repeat rule",
              len(top["lines"]) == 1 and "removed" in top["lines"][0] and "Maya - Algebra II" in top["lines"][0]
              and "4 – 5 PM" in top["lines"][0] and "weekly on Tue, Thu" in top["lines"][0], str(top["lines"]))
        check("it offers Undo and a Restore for the removed series",
              top["buttons"] == ["Undo", "Restore Maya - Algebra II"], str(top["buttons"]))
        check("older steps offer Undo to here", st[1]["buttons"] == ["Undo to here"] and st[2]["buttons"] == ["Undo to here"],
              str([s["buttons"] for s in st]))
        check("each step is timestamped", all(s["when"] in ("just now",) or "ago" in s["when"] for s in st), str([s["when"] for s in st]))

        # ---- Restore only Maya
        await page.click("#historyList .history-step:nth-child(1) button:nth-child(2)"); await page.wait_for_timeout(1000)
        check("Restore brings the series back and leaves Noah", await cards(page) == 3, f"cards={await cards(page)}")
        st = await steps(page)
        check("the restore is a new step at the top, and the delete step now has no Restore",
              st[0]["label"].startswith("Restore Maya") and st[1]["buttons"] == ["Undo to here"], str([(s["label"], s["buttons"]) for s in st[:2]]))
        status = await page.text_content("#status")
        check("the status confirms it", "Restored Maya - Algebra II" in status, status)

        # ---- Undo to here on the oldest step: everything goes in one request
        await page.click("#historyList .history-step:nth-child(4) button"); await page.wait_for_timeout(1200)
        check("undo-to-here on the first step empties the week", await cards(page) == 0, f"cards={await cards(page)}")
        status = await page.text_content("#status")
        check("the status counts the steps", "4 steps" in status and "add session" in status, status)
        redo_shown = await page.evaluate("!document.getElementById('historyRedoSection').classList.contains('hidden')")
        redo_labels = await page.evaluate("[...document.querySelectorAll('#historyRedoList .history-step-label')].map(l => l.textContent.trim())")
        check("the undone steps move to the Undone section, newest first", redo_shown
              and redo_labels == ["Add session", "Add session", "Delete the whole series", "Restore Maya - Algebra II"], str(redo_labels))

        # ---- Redo to here on the last of them brings the lot back
        await page.click("#historyRedoList .history-step:nth-child(4) button"); await page.wait_for_timeout(1200)
        check("redo-to-here brings every step back", await cards(page) == 3, f"cards={await cards(page)}")
        redo_shown = await page.evaluate("!document.getElementById('historyRedoSection').classList.contains('hidden')")
        check("the Undone section clears", not redo_shown)

        # ---- Ctrl+Z while the drawer is open keeps the list current
        await page.keyboard.press("Escape")  # nothing to close; keys still go to the page
        await page.keyboard.press("Control+z"); await page.wait_for_timeout(1000)
        st = await steps(page)
        check("a keyboard undo with the drawer open refreshes the list", st[0]["label"] == "Delete the whole series"
              and await cards(page) == 1, str([s["label"] for s in st[:2]]))

        await page.click("#closeHistoryDrawerBtn"); await page.wait_for_timeout(300)
        await page.click("#exitAdminBtn"); await page.wait_for_timeout(400)
        check("leaving admin hides the History button",
              await page.evaluate("document.getElementById('historyBtn').classList.contains('hidden')"))

        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no page errors", not real, str(real[:3]))
        print(f"\n{len(oks)} passed, {len(fails)} failed")
        await b.close()
        return 1 if fails else 0

def run():
    subprocess.run(["node", "tests/install-shim.mjs"], check=True, stdout=subprocess.DEVNULL)
    server = subprocess.Popen(["node", "tests/server.mjs", str(PORT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
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
