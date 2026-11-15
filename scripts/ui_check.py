"""Interactive UI checks with Playwright driving the installed Chrome.

Needs the backend on :8000 and `vite preview` on :4173.
Setup: pip install playwright   (uses channel="chrome"; no browser download)
Run from the repo root:  python3 scripts/ui_check.py
"""

import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8000"
WEB = "http://localhost:4173"
AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"
failures = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        failures.append(msg)


def api(path):
    with urllib.request.urlopen(API + path, timeout=120) as r:
        return json.load(r)


def settle(page):
    page.wait_for_selector(".metrics-table", timeout=90000)
    page.wait_for_function(
        "()=>!document.querySelector('.is-stale') &&"
        " !document.body.innerText.includes('Querying NASA')", timeout=90000)


def cells(page, label):
    return page.evaluate(
        """(label)=>{for(const r of document.querySelectorAll('.metrics-table tbody tr')){
             const th=r.querySelector('th'); if(!th||!r.querySelector('td')) continue;
             if(th.childNodes[0].textContent.trim()===label)
               return [...r.querySelectorAll('td')].map(td=>({text:td.childNodes[0].textContent.trim(),
                 best:td.classList.contains('is-best'), tie:!!td.querySelector('.tie-tag')}))}
           return null}""", label)


def set_cursor(page, index):
    s = page.locator("#cursor")
    s.focus()
    page.keyboard.press("Home")
    for _ in range(index):
        page.keyboard.press("ArrowRight")


def readout(page, site_index, body):
    fig = page.locator(".panorama").nth(site_index)
    r = fig.locator(".readout").nth(0 if body == "Sun" else 1)
    return r.locator(".readout__state").inner_text(), r.locator(
        ".readout__reason").inner_text()


with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    page = b.new_page(viewport={"width": 1360, "height": 900})

    print("Default experience")
    page.goto(WEB + "/")
    settle(page)
    check("sites=site04%2Csite01&start=2027-03-01" in page.url,
          "defaults: two sites, example window 2027-03-01")
    check(page.locator(".example-note").is_visible()
          and "not today" in page.inner_text(".example-note"),
          "example window labelled as an example, not today/optimized")
    trade = page.inner_text(".tradeoff")
    check(trade.startswith("Tradeoff:") and "best" not in trade.lower(),
          f"short tradeoff line, no 'best': {trade!r}")
    for text in ("Sun visible ≠ electrical power",
                 "Earth visible ≠ guaranteed radio link"):
        check(page.locator(".caveat-line", has_text=text).is_visible(),
              f"visible beside headline metrics: {text}")
    check(page.locator(".kpi", has_text="(sensitivity)").first.is_visible(),
          "nearby-terrain sensitivity beside headline sunlight")
    check(page.locator(".group-row", has_text="not electrical power").is_visible()
          and page.locator(".group-row", has_text="radio link").is_visible(),
          "caveats beside the table's Sunlight and Earth groups")

    print("Winners and direction (Mar 2027, from API)")
    a4 = api("/api/analysis?site=site04&start=2027-03-01&days=30&height=2")
    a1 = api("/api/analysis?site=site01&start=2027-03-01&days=30&height=2")
    sun = cells(page, "Mean solar disk")
    dark = cells(page, "Longest darkness")
    out = cells(page, "Longest Earth outage")
    both = cells(page, "Sun + Earth together")
    m4, m1 = a4["metrics"]["terrain"], a1["metrics"]["terrain"]
    check(sun[1]["best"] == (m1["mean_sun_disk_pct"] > m4["mean_sun_disk_pct"])
          and not sun[0]["best"], "more sunlight wins (higher is better)")
    check(dark[1]["best"] and not dark[0]["best"]
          and m1["longest_darkness_hours"] < m4["longest_darkness_hours"],
          "shorter darkness wins (lower is better)")
    check(out[1]["best"] and m1["longest_comms_blackout_hours"]
          < m4["longest_comms_blackout_hours"], "shorter Earth outage wins")
    check(both[0]["best"] and m4["both_pct"] > m1["both_pct"],
          "Shackleton Rim leads Sun+Earth together (tradeoff)")
    both_card = page.locator(".kpi", has_text="Sun + Earth together").inner_text()
    check("Shackleton Rim" in both_card and "Connecting Ridge" not in both_card,
          "overlap card names the overlap leader")

    print("Ties (Nov 2026: both 100% sunlight)")
    page.goto(WEB + "/?sites=site04,site01&start=2026-11-14&days=30"
          "&height=2&model=terrain")
    settle(page)
    sun = cells(page, "Mean solar disk")
    check(all(c["tie"] and not c["best"] for c in sun),
          "equal sunlight shows 'tie', no winner highlighted")
    kpi = page.locator(".kpi").first.inner_text()
    check("Tie" in kpi and "Same at both sites" in kpi
          and "Shackleton Rim" not in kpi and "Connecting Ridge" not in kpi,
          "summary states the sunlight tie without naming a winner")
    out = cells(page, "Longest Earth outage")
    check(out[1]["best"] and not out[0]["best"],
          "a clear winner still shown where values differ")

    print("Date-window comparison")
    page.goto(WEB + "/?sites=site04,site01&start=2027-03-01&days=30"
          "&height=2&model=terrain")
    settle(page)
    page.click("text=Compare 4 windows")
    page.wait_for_function(
        "()=>![...document.querySelectorAll('.window-table td')]"
        ".some(td=>td.innerText.trim()==='…')", timeout=180000)
    intro = page.locator("#windows-heading + p").inner_text()
    check("30-day windows" in intro and "2 m" in intro
          and "LOLA terrain" in intro and "UTC" in intro
          and "not a search for an optimal date" in intro,
          "windows share duration, height, model; UTC labelled; no 'optimal'")
    first = page.evaluate("()=>[...document.querySelectorAll('.window-table tbody tr')][0]"
                          ".querySelectorAll('td')[0].innerText")
    check(first == f"{m4['mean_sun_disk_pct']:.1f}%",
          "window row 1 equals the main view for the same window")
    second = api("/api/analysis?site=site01&start=2027-03-31&days=30&height=2")
    page.locator(".open-window").first.click()
    settle(page)
    check("start=2027-03-31" in page.url, "Open in main view updates the URL")
    s1 = cells(page, "Mean solar disk")[1]["text"]
    check(s1 == f"{second['metrics']['terrain']['mean_sun_disk_pct']:.1f}%",
          "main view shows the opened window's API values")

    print("Visibility explanations at known numerical cases")
    page.goto(WEB + "/?sites=site04,site01&start=2027-03-01&days=30"
          "&height=2&model=terrain")
    settle(page)
    s = a4["sun"]
    below_vis = next(i for i, (e, h) in enumerate(
        zip(s["elevation_deg"], s["terrain_horizon_deg"])) if e < 0 and e > h)
    set_cursor(page, below_vis)
    st, why = readout(page, 0, "Sun")
    check(st == "Visible below 0°" and "but still visible" in why,
          f"Sun at {s['elevation_deg'][below_vis]}° vs horizon "
          f"{s['terrain_horizon_deg'][below_vis]}° -> {st}")
    e = a4["earth"]
    blocked_above = next(i for i, (x, h) in enumerate(
        zip(e["elevation_deg"], e["terrain_horizon_deg"])) if 0 < x < h)
    set_cursor(page, blocked_above)
    st, why = readout(page, 0, "Earth")
    check(st == "Hidden by terrain" and "even though" in why,
          f"Earth at {e['elevation_deg'][blocked_above]}° vs horizon "
          f"{e['terrain_horizon_deg'][blocked_above]}° -> {st}")
    hidden_below = next(i for i, (x, h) in enumerate(
        zip(e["elevation_deg"], e["terrain_horizon_deg"])) if x < 0 and x <= h)
    set_cursor(page, hidden_below)
    st, why = readout(page, 0, "Earth")
    check(st == "Hidden by terrain" and "even though" not in why,
          "hidden below 0° is still attributed to the terrain horizon")
    page.click("button.seg__btn:has-text('Smooth sphere')")
    set_cursor(page, below_vis)
    st, _ = readout(page, 0, "Sun")
    check(st == "Below reference horizon",
          "smooth-sphere mode: same instant is below the reference horizon")
    label = page.locator(".panorama__scale").first.inner_text()
    check("stretched" in label and "×" in label,
          f"vertical exaggeration labelled: {label[:48]}…")
    check(page.locator("text=Exact window times (UTC)").is_visible(),
          "exact window times visible without opening anything")

    print("Integrated upstream features (map, durations)")
    page.goto(WEB + "/?sites=site04,site01&start=2027-03-01&days=30"
              "&height=2&model=terrain")
    settle(page)
    check(page.locator("text=Multi-Day Mission Analysis").count() == 0,
          "superseded MissionWindow section is gone (no duplicate analysis)")
    markers = page.locator(".lunar-map__marker")
    check(markers.count() == 4 and page.locator(".lunar-map__ref").count() == 4,
          "map: 4 selectable validated sites, 4 reference-only markers")
    check(page.locator(".lunar-map__ref").first.get_attribute("aria-hidden")
          == "true", "reference markers are not interactive")
    page.click(".lunar-map__marker[aria-label^='Peak near Shackleton']")
    settle(page)
    heads = page.evaluate("()=>[...document.querySelectorAll('.metrics-table thead th')].map(t=>t.innerText.trim())")
    check("site07" in page.url and "Peak near Shackleton" in heads
          and page.locator("#site-site07").is_checked()
          and page.locator(".panorama").count() == 3,
          "map selection updates URL, settings list, table and panoramas")
    page.click(".lunar-map__marker[aria-label^='Peak near Shackleton']")
    settle(page)
    check("site07" not in page.url and not page.locator("#site-site07").is_checked(),
          "map deselection is synchronised")
    for d in (1, 3):
        page.click(f"button:has-text('{d} d')")
        settle(page)
        sub = page.locator("#results .block p.muted").first.inner_text()
        api_d = api(f"/api/analysis?site=site04&start=2027-03-01&days={d}&height=2")
        sun = cells(page, "Sun visible (centre)")[0]["text"]
        check(f"days={d}" in page.url
              and sun == f"{api_d['metrics']['terrain']['sun_up_pct']:.1f}%"
              and (f"{d} day from" if d == 1 else f"{d} days from") in sub,
              f"{d}-day window (from upstream durations) matches API")

    print("Accessibility (desktop)")
    page.add_script_tag(url=AXE)
    v = page.evaluate("async()=>(await axe.run()).violations.map(x=>x.id+':'+x.nodes.length)")
    check(v == [], f"axe violations desktop: {v}")
    page.keyboard.press("Tab")
    page.locator("#cursor").focus()
    outline = page.evaluate("()=>getComputedStyle(document.activeElement).outlineStyle")
    check(outline not in ("none", ""), f"visible focus on slider ({outline})")

    print("Mobile and tablet widths")
    for width in (360, 390, 768, 1024, 1440):
        m = b.new_page(viewport={"width": width, "height": 844},
                       is_mobile=width < 700, device_scale_factor=2)
        m.goto(WEB + "/")
        settle(m)
        over = m.evaluate("()=>document.documentElement.scrollWidth-innerWidth")
        clipped = m.evaluate("""()=>[...document.querySelectorAll(
            '.readout,.readout__reason,.panorama figcaption,.kpi,.tradeoff,.cursor-bar,.seg__btn,.usa-button,.site-head,.caveat-line')]
            .filter(el=>{const r=el.getBoundingClientRect();
              // Content inside a declared, labelled scroll region may extend
              // past the viewport by design; that is not clipping.
              const inScroller=el.closest('.table-scroll,.panorama__scroll');
              return (!inScroller && (r.left<0||r.right>innerWidth+0.5))
                     ||el.scrollWidth>el.clientWidth+1})
            .map(el=>el.className).slice(0,5)""")
        check(over <= 0 and not clipped,
              f"{width}px: page overflow {over}px, clipped {clipped}")
        if width < 700:
            y = m.evaluate("()=>document.querySelector('.tradeoff').getBoundingClientRect().top")
            check(y < 844 * 1.2, f"{width}px: first result at y={y:.0f}px")
            m.click(".settings__summary")
            check(m.locator("#start").is_visible(), f"{width}px: settings open and usable")
            m.add_script_tag(url=AXE)
            v = m.evaluate("async()=>(await axe.run()).violations.map(x=>x.id+':'+x.nodes.length)")
            check(v == [], f"{width}px axe violations: {v}")
        m.close()
    b.close()

print("FAILURES:", len(failures))
sys.exit(1 if failures else 0)
