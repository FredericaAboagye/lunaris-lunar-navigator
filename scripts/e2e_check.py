"""End-to-end check: API consistency and UI-vs-API agreement.

Needs the backend on :8000 and `vite preview` on :4173, plus Google Chrome.
Run from the repo root:  python3 scripts/e2e_check.py
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from html.parser import HTMLParser

sys.path.insert(0, "backend")
from visibility import SUN_RADIUS_DEG, disk_fraction, horizon_at  # noqa: E402

API = "http://127.0.0.1:8000"
WEB = "http://localhost:4173"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
START, DAYS = "2027-03-01", 30
failures = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        failures.append(msg)


def get(path):
    with urllib.request.urlopen(API + path, timeout=120) as r:
        return json.load(r)


def dom(url, tz="UTC", budget=25000):
    env = {**os.environ, "TZ": tz}
    out = subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu",
         f"--virtual-time-budget={budget}", "--dump-dom", url],
        capture_output=True, text=True, env=env, timeout=180)
    return out.stdout


class Table(HTMLParser):
    """Collect rows of the metrics table: {label: [cell texts]}."""

    def __init__(self):
        super().__init__()
        self.rows, self.in_table, self.cell, self.row = {}, False, None, None
        self.head = None

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class", "") or ""
        if tag == "table" and "metrics-table" in cls:
            self.in_table = True
        if not self.in_table:
            return
        if tag == "tr":
            self.row = []
        if tag in ("th", "td") and self.row is not None:
            self.cell = ""
        if tag == "span" and "row-hint" in cls:
            self.cell_hint = True

    def handle_endtag(self, tag):
        if not self.in_table:
            return
        if tag in ("th", "td") and self.cell is not None:
            self.row.append(self.cell.strip())
            self.cell = None
        if tag == "tr" and self.row:
            self.rows[self.row[0]] = self.row[1:]
            self.row = None
        if tag == "table":
            self.in_table = False

    def handle_data(self, data):
        if self.cell is not None:
            self.cell += data


def first_label(text):
    # Row header = label followed by its hint; keep up to the hint.
    for label in LABELS:
        if text.startswith(label):
            return label
    return text


LABELS = ["Sun visible", "Mean solar disk visible", "Longest darkness",
          "Earth visible", "Longest Earth outage", "Sun and Earth together"]
KEYS = ["sun_up_pct", "mean_sun_disk_pct", "longest_darkness_hours",
        "earth_visible_pct", "longest_comms_blackout_hours", "both_pct"]


def fmt(key, v):
    if key.endswith("_pct"):
        return f"{v:.1f}%"
    return f"{v/24:.1f} d" if v >= 48 else f"{v:.1f} h"


def ui_rows(html):
    t = Table()
    t.feed(html)
    return {first_label(k): v for k, v in t.rows.items()}


print("API consistency (4 sites x 3 heights)")
sites = get("/api/sites")
check(sites.get("api_version") == 2, "api_version == 2")
assets = {s["id"]: json.load(open(f"backend/data/terrain/{s['id']}.json"))
          for s in sites["sites"]}
results = {}
for sid, a in assets.items():
    for h in a["heights_m"]:
        d = get(f"/api/analysis?site={sid}&start={START}&days={DAYS}"
                f"&height={h}")
        results[(sid, h)] = d
        prof = a["horizon"][str(h)]["full_deg"]
        hz = [horizon_at(x, prof, a["azimuth_step_deg"])
              for x in d["sun"]["azimuth_deg"]]
        same_h = max(abs(p - q) for p, q in
                     zip(hz, d["sun"]["terrain_horizon_deg"])) <= 0.0006
        clear = [e - x for e, x in zip(d["sun"]["elevation_deg"], hz)]
        count = 100 * sum(c > 0 for c in clear) / len(clear)
        disk = 100 * sum(disk_fraction(c, SUN_RADIUS_DEG)
                         for c in clear[:-1]) / (len(clear) - 1)
        m = d["metrics"]["terrain"]
        check(same_h and abs(count - m["sun_up_pct"]) <= 1.0
              and abs(disk - m["mean_sun_disk_pct"]) <= 0.05
              and d["height_m"] == h,
              f"{sid} h={h}: horizon, sun-up {m['sun_up_pct']} vs sample "
              f"count {count:.1f}, disk {m['mean_sun_disk_pct']}")

print("UI vs API (both models, all heights)")
groups = [["site04", "site01", "site11"], ["site07"]]
for model in ("terrain", "geometric"):
    for h in (1, 2, 10):
        for group in groups:
            url = (f"{WEB}/?sites={','.join(group)}&start={START}"
                   f"&days={DAYS}&height={h}&model={model}")
            rows = ui_rows(dom(url))
            ok = bool(rows)
            for col, sid in enumerate(group):
                m = results[(sid, h)]["metrics"][model]
                for label, key in zip(LABELS, KEYS):
                    want = fmt(key, m[key])
                    got = rows.get(label, [None] * 3)[col]
                    if got != want:
                        ok = False
                        print(f"     {model} h={h} {sid} {label}: UI {got!r}"
                              f" API {want!r}")
            check(ok, f"{model} h={h} {','.join(group)}: table matches API")

print("Time zones, model warning")
url = f"{WEB}/?sites=site04&start={START}&days={DAYS}&height=2&model=terrain"
strip = re.compile(r"Generated [^<]*UTC")
a = strip.sub("", dom(url, "UTC"))
b = strip.sub("", dom(url, "Asia/Tokyo"))
c = strip.sub("", dom(url, "America/Los_Angeles"))
check(a == b == c and "UTC" in a, "rendered page identical in UTC, Tokyo, LA")
g = dom(url.replace("model=terrain", "model=geometric"))
check("Smooth-sphere mode ignores terrain" in g, "smooth-sphere warning shown")
check("not an error bar" in a, "sensitivity caveat beside headline sunlight")
print("FAILURES:", len(failures))
sys.exit(1 if failures else 0)
