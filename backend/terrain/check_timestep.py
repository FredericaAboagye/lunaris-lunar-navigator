"""Time-step convergence of visibility metrics (same code path as the API).

Tolerance (fixed before running): vs a 10-minute reference, a step is
acceptable if every percentage differs by <= 0.5 pp and every longest
duration by <= 2 h.
Run: python -m terrain.check_timestep [START] [DAYS]
"""

import json
import sys
from pathlib import Path

import metrics
from horizons import fetch_series
from visibility import horizon_at

DATA = Path(__file__).resolve().parent.parent / "data" / "terrain"
PCT = ("sun_up_pct", "earth_visible_pct", "both_pct")
DUR = ("longest_darkness_hours", "longest_comms_blackout_hours",
       "longest_sunlit_hours", "longest_earth_visible_hours")


def run(asset, height, start, days, step):
    lat, lon = asset["point"]["latitude"], asset["point"]["longitude"]
    prof = asset["horizon"][str(height)]["full_deg"]
    st = asset["azimuth_step_deg"]
    _, saz, sel = fetch_series("sun", lat, lon, start, days, step)
    _, eaz, eel = fetch_series("earth", lat, lon, start, days, step)
    sc = [e - horizon_at(a, prof, st) for a, e in zip(saz, sel)]
    ec = [e - horizon_at(a, prof, st) for a, e in zip(eaz, eel)]
    return metrics.compute(sc, ec, step / 60)[0]


def main():
    start = sys.argv[1] if len(sys.argv) > 1 else "2027-03-01"
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    worst = {}
    for path in sorted(DATA.glob("site*.json")):
        a = json.loads(path.read_text())
        for h in a["heights_m"]:
            ref = run(a, h, start, days, 10)
            for step in (30, 60, 120):
                m = run(a, h, start, days, step)
                dp = max(abs(m[k] - ref[k]) for k in PCT)
                dd = max(abs(m[k] - ref[k]) for k in DUR)
                ok = dp <= 0.5 and dd <= 2.0
                w = worst.setdefault(step, [0, 0, True])
                w[0], w[1] = max(w[0], dp), max(w[1], dd)
                w[2] &= ok
                if not ok:
                    print(f"  {a['id']} h={h} step={step}: dpct {dp:.2f} pp,"
                          f" ddur {dd:.2f} h  FAIL")
    for step, (dp, dd, ok) in sorted(worst.items()):
        print(f"{start} +{days} d, step {step:3d} min: worst dpct {dp:.2f} pp,"
              f" worst ddur {dd:.2f} h -> {'PASS' if ok else 'FAIL'}")


if __name__ == "__main__":
    main()
