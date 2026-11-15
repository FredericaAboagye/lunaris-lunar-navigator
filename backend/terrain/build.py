"""Build validated terrain-horizon assets for Lunaris.

Downloads LOLA source rasters once into terrain/.cache, computes terrain
horizons at documented points, runs the validation checks with fixed
tolerances, and writes compact JSON assets to data/terrain/.

Run from backend/:
    pip install -r requirements-pipeline.txt
    python -m terrain.build            # all configured sites
    python -m terrain.build site04     # one site
"""

import json
import sys
import tarfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from horizons import fetch_series
from visibility import SUN_RADIUS_DEG, disk_fraction
from visibility import horizon_at as horizon_at_py

from .horizon import horizon_profile
from .projection import latlon_to_xy, xy_to_latlon
from .rasters import Grid, read_pds_ldem, read_pgda_geotiff

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
OUT = HERE.parent / "data" / "terrain"

PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp"
PDS = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"
       "lrolol_1xxx/data/lola_gdr/polar/img")
REGIONAL = "ldem_80s_80m"

HEIGHTS_M = (1.0, 2.0, 10.0)
AZIMUTH_STEP = 0.5
MAX_DISTANCE_M = 250_000.0
EXTENDED_DISTANCE_M = 300_000.0  # convergence check only
FAR_FIELD_M = 200.0

# Acceptance tolerances, fixed before any results were inspected.
TOL = {
    "registration_median_abs_m": 2.0,
    "registration_p95_abs_m": 10.0,
    "azimuth_interp_median_deg": 0.02,
    "azimuth_interp_p99_deg": 0.1,
    "sampling_max_deg": 0.02,
    "search_distance_max_deg": 0.01,
    "published_min_mean_illumination": 0.65,
}

# Documented points: representative X/Y of ROI #1 in the PGDA shapefile
# "<Site>_ROIs" (regions with average illumination > 70 % at 1 m above
# the surface, 2024-01-01 to 2026-01-01; Barker et al. 2021, PSS 203).
SITES = {
    "site01": {"pgda": "Site01", "name": "Connecting Ridge",
               "region": "Shackleton–de Gerlache connecting ridge"},
    "site04": {"pgda": "Site04", "name": "Shackleton Rim",
               "region": "Rim of Shackleton crater"},
    "site07": {"pgda": "Site07", "name": "Peak near Shackleton",
               "region": "Massif near Shackleton crater"},
    "site11": {"pgda": "Site11", "name": "de Gerlache Rim",
               "region": "Rim of de Gerlache crater"},
}

UNSUPPORTED = {
    "site06": "Nobile Rim 1: PGDA DEM exists but its ROI archive could not "
              "be opened, so no documented point is available.",
    "site23": "Malapert Massif: PGDA DEM exists but no ROI/point is "
              "published.",
    "haworth": "Haworth: PGDA DEM exists but no ROI/point is published.",
}


def fetch(url, name=None):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (name or url.rsplit("/", 1)[1])
    if not path.exists() or path.stat().st_size == 0:
        print(f"  downloading {url}")
        tmp = path.with_suffix(path.suffix + ".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(path)
    return path


def roi_point(pgda):
    import shapefile

    archive = fetch(f"{PGDA}/{pgda}/{pgda}_ROIs.tgz")
    folder = CACHE / f"{pgda}_ROIs"
    if not folder.exists():
        with tarfile.open(archive) as tar:
            tar.extractall(folder, filter="data")
    shp = folder / f"{pgda}_ROIs"
    reader = shapefile.Reader(str(shp))
    x, y = reader.records()[0]
    poly = reader.shapes()[0]
    gmt = next(folder.glob("*regionProps*"), None)
    return float(x), float(y), poly.points, (gmt.name if gmt else "")


def point_in_polygon(x, y, pts):
    inside = False
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        if (y1 > y) != (y2 > y):
            if x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside


def registration(fine, regional):
    f = int(round(regional.res / fine.res))
    h, w = fine.z.shape
    zb = fine.z[: h - h % f, : w - w % f]
    zb = zb.reshape(h // f, f, w // f, f).mean(axis=(1, 3))
    block = Grid("block", zb, fine.x0, fine.y0, regional.res, "")
    rng = np.random.default_rng(0)
    xmin, xmax, ymin, ymax = fine.extent
    x = rng.uniform(xmin + 200, xmax - 200, 20000)
    y = rng.uniform(ymin + 200, ymax - 200, 20000)
    d = block.sample(x, y) - regional.sample(x, y)
    d = d[np.isfinite(d)]
    return {
        "median_m": round(float(np.median(d)), 3),
        "p95_abs_m": round(float(np.percentile(np.abs(d), 95)), 3),
    }


def hazard_stats(slope, x0, y0):
    """Slope statistics in discs around the point, from full 5 m data."""
    h, w = slope.z.shape
    jj = (np.arange(w) + 0.5) * slope.res + slope.x0
    ii = slope.y0 - (np.arange(h) + 0.5) * slope.res
    out = {}
    for radius in (25, 50, 100, 250, 500):
        j0 = max(int((x0 - radius - slope.x0) / slope.res), 0)
        j1 = min(int((x0 + radius - slope.x0) / slope.res) + 1, w)
        i0 = max(int((slope.y0 - y0 - radius) / slope.res), 0)
        i1 = min(int((slope.y0 - y0 + radius) / slope.res) + 1, h)
        X, Y = np.meshgrid(jj[j0:j1], ii[i0:i1])
        v = slope.z[i0:i1, j0:j1][np.hypot(X - x0, Y - y0) <= radius]
        out[str(radius)] = {
            "pixels": int(v.size),
            "median_deg": round(float(np.median(v)), 2),
            "p95_deg": round(float(np.percentile(v, 95)), 2),
            "max_deg": round(float(v.max()), 2),
            "pct_below_5": round(float((v < 5).mean() * 100), 1),
            "pct_below_10": round(float((v < 10).mean() * 100), 1),
            "pct_below_15": round(float((v < 15).mean() * 100), 1),
        }
    return out


def published_check(lat, lon, profile):
    times, az, el = fetch_series("sun", round(float(lat), 6),
                                 round(float(lon), 6), "2024-01-01",
                                 731, 120)
    pe = [float(v) for v in profile["horizon_deg"]]
    # Exclude the 2026-01-01 00:00 endpoint: exactly two years.
    frac = [disk_fraction(e - horizon_at_py(a, pe, AZIMUTH_STEP),
                               SUN_RADIUS_DEG)
            for a, e in zip(az[:-1], el[:-1])]
    return float(np.mean(frac)), len(frac)


def build_site(site_id, regional):
    cfg = SITES[site_id]
    pgda = cfg["pgda"]
    print(f"[{site_id}] {cfg['name']}")
    fine = read_pgda_geotiff(
        fetch(f"{PGDA}/{pgda}/{pgda}_final_adj_5mpp_surf.tif"), pgda)
    slope = read_pgda_geotiff(
        fetch(f"{PGDA}/{pgda}/{pgda}_final_adj_5mpp_slp.tif"), pgda)

    x, y, polygon, roi_file = roi_point(pgda)
    lat, lon = (float(v) for v in xy_to_latlon(x, y))
    rx, ry = latlon_to_xy(lat, lon)
    checks = {}
    checks["roi_point_inside_polygon"] = point_in_polygon(x, y, polygon)
    checks["coordinate_round_trip_m"] = float(np.hypot(rx - x, ry - y))

    reg = registration(fine, regional)
    checks["registration"] = {
        **reg,
        "pass": abs(reg["median_m"]) <= TOL["registration_median_abs_m"]
        and reg["p95_abs_m"] <= TOL["registration_p95_abs_m"],
    }

    grids = [fine, regional]
    profiles = {}
    convergence = {}
    for h in HEIGHTS_M:
        p = horizon_profile(lat, lon, h, grids, AZIMUTH_STEP,
                            MAX_DISTANCE_M, far_field_m=FAR_FIELD_M)
        profiles[h] = p

        q = horizon_profile(lat, lon, h, grids, AZIMUTH_STEP / 2,
                            MAX_DISTANCE_M, far_field_m=FAR_FIELD_M)
        mid = q["azimuth_deg"][1::2]
        err = np.abs(np.interp(mid, np.append(p["azimuth_deg"], 360),
                               np.append(p["horizon_deg"],
                                         p["horizon_deg"][0]))
                     - q["horizon_deg"][1::2])
        s2 = horizon_profile(lat, lon, h, grids, AZIMUTH_STEP,
                             MAX_DISTANCE_M, step_fraction=0.25,
                             near_step_fraction=0.03125 / 2,
                             far_field_m=FAR_FIELD_M)
        d_samp = float(np.abs(s2["horizon_deg"] - p["horizon_deg"]).max())
        s3 = horizon_profile(lat, lon, h, grids, AZIMUTH_STEP,
                             EXTENDED_DISTANCE_M, far_field_m=FAR_FIELD_M)
        d_dist = float(np.abs(s3["horizon_deg"] - p["horizon_deg"]).max())
        convergence[str(int(h))] = {
            "azimuth_interp_median_deg": round(float(np.median(err)), 4),
            "azimuth_interp_p99_deg": round(float(np.percentile(err, 99)),
                                            4),
            "sampling_max_deg": round(d_samp, 4),
            "search_250_vs_300km_max_deg": round(d_dist, 4),
            "extended_search_min_coverage_km":
                round(float(s3["coverage_m"].min()) / 1000, 1),
            "pass": bool(
                np.median(err) <= TOL["azimuth_interp_median_deg"]
                and np.percentile(err, 99) <= TOL["azimuth_interp_p99_deg"]
                and d_samp <= TOL["sampling_max_deg"]
                and d_dist <= TOL["search_distance_max_deg"]
            ),
        }
        print(f"  h={h:g} m convergence {convergence[str(int(h))]}")
    checks["convergence"] = convergence

    mean_illum, n = published_check(lat, lon, profiles[1.0])
    checks["published_illumination"] = {
        "reference": "Barker et al. (2021) PSS 203:105119 — PGDA ROI "
                     f"'{roi_file}' (average illumination > 70 % at 1 m, "
                     "2024-01-01 to 2026-01-01)",
        "our_mean_solar_disk_fraction_1m": round(mean_illum, 3),
        "samples": n,
        "pass": mean_illum >= TOL["published_min_mean_illumination"],
    }
    print(f"  published check: mean illumination {mean_illum:.3f}")

    coverage = min(float(p["coverage_m"].min()) for p in profiles.values())
    ok = (checks["roi_point_inside_polygon"]
          and checks["coordinate_round_trip_m"] < 1e-3
          and checks["registration"]["pass"]
          and all(c["pass"] for c in convergence.values())
          and checks["published_illumination"]["pass"])

    asset = {
        "id": site_id,
        "name": cfg["name"],
        "region": cfg["region"],
        "pgda_site": pgda,
        "point": {
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "x_m": x,
            "y_m": y,
            "source": f"PGDA {pgda}_ROIs.shp record 1 representative "
                      "point (Barker et al. 2021)",
        },
        "surface_height_m": round(profiles[1.0]["observer_surface_m"], 2),
        "azimuth_step_deg": AZIMUTH_STEP,
        "heights_m": [int(h) for h in HEIGHTS_M],
        "horizon": {
            str(int(h)): {
                "full_deg": [round(float(v), 3) for v in p["horizon_deg"]],
                "far_field_deg": [round(float(v), 3)
                                  for v in p["far_horizon_deg"]],
            }
            for h, p in profiles.items()
        },
        "coverage": {
            "terrain_search_km": MAX_DISTANCE_M / 1000,
            "min_terrain_coverage_km": round(coverage / 1000, 1),
            "complete": coverage >= MAX_DISTANCE_M - 1,
            "local_dem": f"PGDA {pgda} LOLA LDEM 5 m/pix (16 x 16 km)",
            "regional_dem": "PDS LOLA LDEM_80S_80M (80 m/pix, to 80°S)",
            "far_field_m": FAR_FIELD_M,
        },
        "hazard": {
            "source": f"PGDA {pgda} 5 m/pix slope map",
            "slope_rms_error_deg": "1.5–2.5 (median, Barker et al. 2021)",
            "discs": hazard_stats(slope, x, y),
        },
        "validation": {"passed": bool(ok), "tolerances": TOL,
                       "checks": checks},
        "sources": [
            f"{PGDA}/{pgda}/{pgda}_final_adj_5mpp_surf.tif",
            f"{PGDA}/{pgda}/{pgda}_final_adj_5mpp_slp.tif",
            f"{PGDA}/{pgda}/{pgda}_ROIs.tgz",
            f"{PDS}/{REGIONAL}.img",
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{site_id}.json").write_text(json.dumps(asset))
    print(f"  validation {'PASSED' if ok else 'FAILED'}")
    return asset


def main(argv):
    wanted = argv or list(SITES)
    start = time.time()
    regional = read_pds_ldem(fetch(f"{PDS}/{REGIONAL}.img"),
                             fetch(f"{PDS}/{REGIONAL}.lbl"), REGIONAL)
    results = [build_site(s, regional) for s in wanted]

    index_path = OUT / "index.json"
    index = (json.loads(index_path.read_text())
             if index_path.exists() else {"sites": {}})
    for a in results:
        index["sites"][a["id"]] = {
            "name": a["name"],
            "region": a["region"],
            "latitude": a["point"]["latitude"],
            "longitude": a["point"]["longitude"],
            "validated": a["validation"]["passed"],
        }
    index["unsupported"] = UNSUPPORTED
    index["generated_at"] = datetime.now(timezone.utc).isoformat()
    index_path.write_text(json.dumps(index, indent=2))
    print(f"done in {time.time() - start:.0f} s")


if __name__ == "__main__":
    main(sys.argv[1:])
