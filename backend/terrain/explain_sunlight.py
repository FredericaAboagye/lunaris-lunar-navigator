"""Decompose smooth-sphere vs terrain sunlight at one site.

Same point, dates, time step, observer height and visibility definitions
for every model:
  A  smooth sphere, horizon 0 deg (the original app model)
  B  smooth sphere seen from the site's true radius (R + ground + h):
     horizon = geometric dip -acos(R / (R + ground + h))
  C  LOLA terrain horizon (the validated profile)
Run: python -m terrain.explain_sunlight SITE_ID [HEIGHT_M]
"""

import json
import math
import sys
from pathlib import Path

import numpy as np

from horizons import fetch_series
from visibility import SUN_RADIUS_DEG, disk_fraction, horizon_at

from .projection import R_MOON

DATA = Path(__file__).resolve().parent.parent / "data" / "terrain"


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else "site04"
    height = sys.argv[2] if len(sys.argv) > 2 else "1"
    a = json.loads((DATA / f"{site}.json").read_text())
    lat, lon = a["point"]["latitude"], a["point"]["longitude"]
    prof = a["horizon"][height]["full_deg"]
    step = a["azimuth_step_deg"]
    r0 = R_MOON + a["surface_height_m"] + float(height)
    dip = -math.degrees(math.acos(R_MOON / r0))

    _, az, el = fetch_series("sun", lat, lon, "2024-01-01", 731, 120)
    az, el = az[:-1], el[:-1]  # exactly 2024-01-01 .. 2025-12-31 22:00
    hz = np.array([horizon_at(x, prof, step) for x in az])
    el = np.array(el)

    models = {"A smooth sphere (0 deg)": np.zeros_like(el),
              f"B geometric dip ({dip:.2f} deg)": np.full_like(el, dip),
              "C LOLA terrain": hz}
    frac = {k: np.array([disk_fraction(e - h, SUN_RADIUS_DEG)
                         for e, h in zip(el, v)])
            for k, v in models.items()}
    print(f"{a['name']} ({site}) h={height} m, ground {a['surface_height_m']} m,"
          f" {len(el)} samples (2 h), 2024-01-01..2026-01-01")
    for k, v in models.items():
        print(f"  {k:28s} mean disk {frac[k].mean()*100:5.1f} %"
              f"   centre visible {np.mean(el > v)*100:5.1f} %")
    fa, fb, fc = frac.values()
    d_bc = fc - fb
    print(f"  A->B gain from seeing below the reference horizon: "
          f"{(fb - fa).mean()*100:+.1f} pp")
    print(f"  B->C terrain obstruction (loss): {d_bc[d_bc < 0].sum()/len(el)*100:+.1f} pp;"
          f" terrain lower than dip (gain): {d_bc[d_bc > 0].sum()/len(el)*100:+.1f} pp")
    print(f"  net A->C: {(fc - fa).mean()*100:+.1f} pp;"
          f" terrain horizon below 0 deg on {np.mean(np.array(prof) < 0)*100:.0f} % of azimuths")
    print(f"  terrain coverage complete to {a['coverage']['terrain_search_km']} km:"
          f" {a['coverage']['complete']}")


if __name__ == "__main__":
    main()
