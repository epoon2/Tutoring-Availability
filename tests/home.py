#!/usr/bin/env python3
"""The home page moves: the hero rises in, the sample calendar plays
its loop, each section reveals as it scrolls into view, the "made
for" row glides, the header casts a shadow once scrolled - and with
"reduce motion" set on the device none of it moves and everything
shows at once. The page also uses the width it has.

    python3 tests/home.py
"""
import asyncio, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8994
BASE = f"http://127.0.0.1:{PORT}"
oks, fails = [], []
def check(name, cond, extra=""):
    (oks if cond else fails).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {extra}" if extra and not cond else ""))

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        errs = []

        # ---- a wide screen
        page = await (await b.new_context(viewport={"width": 1900, "height": 700})).new_page()
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(BASE + "/", wait_until="networkidle"); await page.wait_for_timeout(300)
        widths = await page.evaluate("""() => ({
            page: window.innerWidth,
            wrap: document.querySelector('.band-hero .wrap').getBoundingClientRect().width,
            preview: document.getElementById('homePreview').getBoundingClientRect().width })""")
        check("on a wide screen the content uses most of it", widths["wrap"] >= widths["page"] * 0.9 and widths["preview"] >= 600, str(widths))
        check("the hero rises in, in steps", await page.evaluate("document.querySelectorAll('.band-hero .hero-in').length") == 4
              and await page.evaluate("getComputedStyle(document.querySelector('.home-hero h1')).animationName") == "rise"
              and await page.evaluate("document.querySelector('.home-cta').style.getPropertyValue('--d')") == "240ms")
        check("color drifts behind the hero", await page.evaluate("[...document.querySelectorAll('.band-hero .blob')].every(b => getComputedStyle(b).animationName === 'drift')"))
        check("the sample calendar starts at rest", await page.get_attribute("#homePreview", "data-step") == "0")
        steps = set()
        for _ in range(12):
            await page.wait_for_timeout(900)
            steps.add(await page.get_attribute("#homePreview", "data-step"))
        check("and plays its loop: a slot opens, a request comes, it is accepted", {"1", "2", "3"} <= steps, str(sorted(steps)))
        await page.evaluate("document.getElementById('homePreview').setAttribute('data-step', '3')"); await page.wait_for_timeout(600)
        check("the request card shows at step 3", await page.evaluate("getComputedStyle(document.querySelector('.home-preview-request')).opacity") == "1")
        await page.evaluate("document.getElementById('homePreview').setAttribute('data-step', '4')"); await page.wait_for_timeout(600)
        check("and at step 4 the slot is booked and confirmed", await page.evaluate("getComputedStyle(document.querySelector('.ghost-booked')).opacity") == "1"
              and await page.evaluate("getComputedStyle(document.querySelector('.home-preview-toast')).opacity") == "1")

        # ---- reveal on scroll
        check("the header casts no shadow at the top", not await page.evaluate("document.querySelector('.home-top').classList.contains('scrolled')"))
        below = await page.evaluate("[...document.querySelectorAll('#features .reveal')].map(el => el.classList.contains('in'))")
        check("sections further down wait, unrevealed", below and not any(below), str(below))
        await page.evaluate("document.getElementById('features').scrollIntoView()"); await page.wait_for_timeout(900)
        below = await page.evaluate("[...document.querySelectorAll('#features .reveal')].map(el => el.classList.contains('in'))")
        check("scrolling to them reveals them", below and all(below), str(below))
        delays = await page.evaluate("[...document.querySelectorAll('#features li')].map(li => li.style.getPropertyValue('--d'))")
        check("the cards come in one after another", delays[:3] == ["0ms", "70ms", "140ms"], str(delays))
        check("and the header now casts a shadow", await page.evaluate("document.querySelector('.home-top').classList.contains('scrolled')"))
        chips = await page.evaluate("document.querySelectorAll('#homeChips span').length")
        check("the made-for row is repeated so it can glide without a gap", chips == 36
              and await page.evaluate("getComputedStyle(document.getElementById('homeChips')).animationName") == "glide", str(chips))
        await page.select_option("#langSelect", "es"); await page.wait_for_timeout(300)
        texts = await page.evaluate("[...document.querySelectorAll('#homeChips span')].map(s => s.textContent)")
        check("a language change reaches every copy", texts[0] == "Tutores" and len(set(texts)) == 6 and texts[0] == texts[6] == texts[30], str(texts[:8]))
        check("cards lift under the pointer", (await page.evaluate("getComputedStyle(document.querySelector('.home-features li')).transitionProperty")).startswith("transform"))
        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no page errors", not real, str(real[:3]))

        # ---- reduce motion: everything shown at once, nothing moving
        calm = await (await b.new_context(viewport={"width": 1400, "height": 700}, reduced_motion="reduce")).new_page()
        calm.on("pageerror", lambda e: errs.append(str(e)))
        await calm.goto(BASE + "/", wait_until="networkidle"); await calm.wait_for_timeout(400)
        check("with reduce motion every section is shown at once", await calm.evaluate("[...document.querySelectorAll('.reveal')].every(el => el.classList.contains('in'))"))
        check("the hero and the sample calendar stand still", await calm.evaluate("getComputedStyle(document.querySelector('.home-hero h1')).animationName") == "none"
              and await calm.evaluate("getComputedStyle(document.getElementById('homePreview')).animationName") == "none"
              and await calm.evaluate("getComputedStyle(document.getElementById('homeChips')).animationName") == "none")
        await calm.wait_for_timeout(2200)
        check("and the loop never starts", await calm.get_attribute("#homePreview", "data-step") == "0")

        # ---- a phone
        phone = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)).new_page()
        phone.on("pageerror", lambda e: errs.append(str(e)))
        await phone.goto(BASE + "/", wait_until="networkidle"); await phone.wait_for_timeout(400)
        check("a phone has no sideways scroll", await phone.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))

        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no page errors anywhere", not real, str(real[:3]))
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
