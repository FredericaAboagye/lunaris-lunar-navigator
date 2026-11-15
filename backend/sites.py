"""Candidate sites backed by validated terrain assets (data/terrain/).

Only sites whose terrain build passed every validation check are served.
Sites with source data but no documented point are listed as unsupported
so the UI can show them without silently using a different method.
"""

import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "terrain"


@lru_cache(maxsize=1)
def _index():
    return json.loads((DATA / "index.json").read_text())


@lru_cache(maxsize=32)
def load_site(site_id):
    index = _index()["sites"]
    if site_id not in index or not index[site_id]["validated"]:
        return None
    return json.loads((DATA / f"{site_id}.json").read_text())


def summary(asset):
    hazard = asset["hazard"]["discs"]
    return {
        "id": asset["id"],
        "name": asset["name"],
        "region": asset["region"],
        "latitude": asset["point"]["latitude"],
        "longitude": asset["point"]["longitude"],
        "point_source": asset["point"]["source"],
        "surface_height_m": asset["surface_height_m"],
        "heights_m": asset["heights_m"],
        "coverage": asset["coverage"],
        "hazard": {
            "source": asset["hazard"]["source"],
            "slope_rms_error_deg": asset["hazard"]["slope_rms_error_deg"],
            "within_100m": hazard["100"],
            "within_500m": hazard["500"],
        },
        "validation": {
            "passed": asset["validation"]["passed"],
            "published_check":
                asset["validation"]["checks"]["published_illumination"],
        },
    }


# Research candidate coordinates contributed upstream (origin/main,
# commit cdc6524): Wueller et al. (2026), JGR Planets, Table A1,
# https://doi.org/10.1029/2025JE009434 (east-positive longitude as given).
# They have no validated terrain horizon yet (no PGDA RoI point, and the
# 250 km terrain search would leave the 80 deg S regional DEM), so they are
# listed for context only and never analysed with a different method.
REFERENCE_SITES = [
    {"id": "MMO01", "name": "Mons Mouton — MMO01",
     "latitude": -85.416, "longitude": 31.851},
    {"id": "MMA01", "name": "Malapert Massif — MMA01",
     "latitude": -85.942, "longitude": -0.944},
    {"id": "dGR201", "name": "de Gerlache Rim 2 — dGR201",
     "latitude": -88.389, "longitude": -68.865},
    {"id": "NR101", "name": "Nobile Rim 1 — NR101",
     "latitude": -85.295, "longitude": 36.917},
]
REFERENCE_SOURCE = ("Wueller et al. (2026), JGR Planets, Table A1, "
                    "doi:10.1029/2025JE009434")
REFERENCE_STATUS = ("Terrain-horizon analysis not available yet for this "
                    "point; shown for context only.")


def list_sites():
    index = _index()
    sites = [summary(a) for a in
             (load_site(i) for i in sorted(index["sites"])) if a]
    return {
        "sites": sites,
        "unsupported": index.get("unsupported", {}),
        "reference_sites": [
            {**r, "source": REFERENCE_SOURCE, "status": REFERENCE_STATUS}
            for r in REFERENCE_SITES
        ],
    }
