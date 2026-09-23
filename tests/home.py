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
        await page.evaluate("document.querySelector('#featureList .feature-item:last-child').scrollIntoView()"); await page.wait_for_timeout(900)
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
        check("cards lift under the pointer", (await page.evaluate("getComputedStyle(document.querySelector('.home-step')).transitionProperty")).startswith("transform"))

        # ---- Everything included: one feature open at a time, its scene on the stage
        await page.select_option("#langSelect", "en"); await page.wait_for_timeout(200)
        await page.evaluate("document.getElementById('features').scrollIntoView()"); await page.wait_for_timeout(300)
        state = await page.evaluate("""() => ({
            items: document.querySelectorAll('#featureList .feature-item').length,
            active: [...document.querySelectorAll('#featureList .feature-item')].map(i => i.classList.contains('active')),
            expanded: [...document.querySelectorAll('.feature-head')].map(b => b.getAttribute('aria-expanded')),
            scene: document.getElementById('featureStage').getAttribute('data-scene'),
            shown: [...document.querySelectorAll('.feature-stage .scene')].map(sc => getComputedStyle(sc).opacity),
            gradient: getComputedStyle(document.querySelector('.feature-stage .s1')).backgroundImage.includes('gradient') })""")
        which = state["active"].index(True) if True in state["active"] else -1
        check("nine features, one open, its scene alone on a gradient stage", state["items"] == 9 and state["active"].count(True) == 1
              and state["expanded"][which] == "true" and state["expanded"].count("true") == 1 and state["scene"] == str(which + 1)
              and state["shown"][which] == "1" and all(o == "0" for i, o in enumerate(state["shown"]) if i != which) and state["gradient"], str(state))
        was = await page.get_attribute("#featureStage", "data-scene")
        seen = set()
        for _ in range(8):
            await page.wait_for_timeout(1000)
            seen.add(await page.get_attribute("#featureStage", "data-scene"))
        check("the next opens on its own after a few seconds", str(int(was) % 9 + 1) in seen, f"was {was}, then {sorted(seen)}")
        await page.evaluate("[...document.querySelectorAll('.feature-head')][6].click()"); await page.wait_for_timeout(700)
        state = await page.evaluate("""() => ({
            scene: document.getElementById('featureStage').getAttribute('data-scene'),
            active: [...document.querySelectorAll('#featureList .feature-item')].findIndex(i => i.classList.contains('active')),
            body: getComputedStyle(document.querySelectorAll('.feature-body')[6]).maxHeight,
            s7: getComputedStyle(document.querySelector('.feature-stage .s7')).opacity })""")
        check("a click opens any of them at once, with its scene", state["scene"] == "7" and state["active"] == 6 and state["body"] != "0px" and state["s7"] == "1", str(state))
        check("the scenes' pieces float", await page.evaluate("[...document.querySelectorAll('.feature-stage .s7 .tile')].every(t => getComputedStyle(t).animationName === 'bob')"))

        # ---- What your visitors see: a gradient band with the card in the middle and pills around it
        band = await page.evaluate("""() => { const b = document.getElementById('visitors'); const cs = getComputedStyle(b);
            return { gradient: cs.backgroundImage.includes('gradient'), color: cs.color,
                     pills: document.querySelectorAll('#visitors .story-pill').length,
                     floating: [...document.querySelectorAll('#visitors .story-pill')].every(p => getComputedStyle(p).animationName === 'bob'),
                     card: !!document.querySelector('#visitors .stories-card .home-phone') }; }""")
        check("the visitors band is a gradient with white text, four floating pills and the card between them", band["gradient"] and band["color"] == "rgb(255, 255, 255)"
              and band["pills"] == 4 and band["floating"] and band["card"], str(band))
        check("the ready band is a gradient too, and the step numbers are not all one color", await page.evaluate("getComputedStyle(document.querySelector('.home-ready')).backgroundImage.includes('gradient')")
              and await page.evaluate("new Set([...document.querySelectorAll('.home-step')].map(s => getComputedStyle(s, '::before').color)).size") == 3)
        real = [e for e in errs if "fonts" not in e and "favicon" not in e]
        check("no page errors", not real, str(real[:3]))

        # ---- reduce motion: everything shown at once, nothing moving
        calm = await (await b.new_context(viewport={"width": 1400, "height": 700}, reduced_motion="reduce")).new_page()
        calm.on("pageerror", lambda e: errs.append(str(e)))
        await calm.goto(BASE + "/", wait_until="networkidle"); await calm.wait_for_timeout(400)
        check("with reduce motion every section is shown at once", await calm.evaluate("[...document.querySelectorAll('.reveal')].every(el => el.classList.contains('in'))"))
        await calm.wait_for_timeout(5600)
        check("and the features do not rotate on their own", await calm.get_attribute("#featureStage", "data-scene") == "1"
              and await calm.evaluate("[...document.querySelectorAll('.feature-stage .tile, #visitors .story-pill')].every(t => getComputedStyle(t).animationName === 'none')"))
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
