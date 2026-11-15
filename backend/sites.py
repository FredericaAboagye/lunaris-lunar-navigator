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


def list_sites():
    index = _index()
    sites = [summary(a) for a in
             (load_site(i) for i in sorted(index["sites"])) if a]
    return {"sites": sites, "unsupported": index.get("unsupported", {})}
