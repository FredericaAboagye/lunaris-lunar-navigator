"""Lunaris API: Sun/Earth geometry at lunar sites from NASA JPL Horizons."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import metrics
from horizons import HorizonsError, fetch_series
from sites import list_sites, load_site, summary
from visibility import SUN_RADIUS_DEG, disk_fraction, horizon_at

LOCAL_ORIGINS = [
    f"http://{host}:{port}"
    for host in ("localhost", "127.0.0.1")
    for port in (5173, 5174, 4173)
]

app = FastAPI(title="Lunaris NASA Data API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_ORIGINS + [
        o.strip()
        for o in os.getenv("FRONTEND_ORIGIN", "").split(",")
        if o.strip()
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)

ALLOWED_STEPS = (30, 60, 120)
MIN_DATE, MAX_DATE = date(2000, 1, 1), date(2049, 12, 31)
LIMITATIONS = (
    "Terrain horizons use LOLA elevation (5 m/pix within ~8 km, 80 m/pix "
    "to 250 km). Within 200 m the 5 m map is mostly interpolated "
    "(median slope error 1.5-2.5 deg), so low observer heights are the "
    "least certain. Sun visibility is not power output; Earth visibility "
    "is not a guaranteed radio link; slope statistics are regional "
    "screening, not lander-scale hazard certification."
)

DEFINITIONS = {
    "visible": "Body centre above the horizon (Sun and Earth).",
    "mean_sun_disk": "Average fraction of the solar disk above the "
                     "horizon (radius 0.2666 deg, locally straight "
                     "horizon).",
    "terrain_horizon": "Highest terrain elevation angle in each azimuth "
                       "from the observer, including lunar curvature.",
    "geometric_horizon": "0 deg: the plane perpendicular to the local "
                         "vertical on a smooth sphere (ignores terrain "
                         "and the site's own elevation).",
    "azimuth": "Degrees clockwise from local true north.",
}

_pool = ThreadPoolExecutor(max_workers=2)


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


def hours_to_iso(start_dt, hours):
    return iso(start_dt + timedelta(hours=hours))


@app.get("/")
def home():
    return {"message": "Lunaris NASA backend is running", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/sites")
def sites():
    return list_sites()


def clearance(az, el, profile, step):
    return [round(e - horizon_at(a, profile, step), 3)
            for a, e in zip(az, el)]


def horizon_series(az, profile, step):
    return [round(horizon_at(a, profile, step), 3) for a in az]


def windows_iso(start_dt, windows):
    return {
        name: [
            {
                "start": hours_to_iso(start_dt, s),
                "end": hours_to_iso(start_dt, e),
                "hours": round(e - s, 2),
            }
            for s, e in items
        ]
        for name, items in windows.items()
    }


@app.get("/api/analysis")
def analysis(
    site: str = Query(..., max_length=40),
    start: date = Query(...),
    days: int = Query(30, ge=1, le=60),
    height: int = Query(2),
    step: int = Query(60),
):
    asset = load_site(site)
    if asset is None:
        raise HTTPException(404, f"Unknown or unvalidated site '{site}'")
    if height not in asset["heights_m"]:
        raise HTTPException(
            400, f"height must be one of {asset['heights_m']} metres"
        )
    if step not in ALLOWED_STEPS:
        raise HTTPException(
            400, f"step must be one of {list(ALLOWED_STEPS)} minutes"
        )
    if not (MIN_DATE <= start <= MAX_DATE - timedelta(days=days)):
        raise HTTPException(
            400, f"start must be between {MIN_DATE} and {MAX_DATE}"
        )

    lat = asset["point"]["latitude"]
    lon = asset["point"]["longitude"]
    args = (lat, lon, start.isoformat(), days, step)
    try:
        sun_f = _pool.submit(fetch_series, "sun", *args)
        earth_f = _pool.submit(fetch_series, "earth", *args)
        times, sun_az, sun_el = sun_f.result()
        e_times, earth_az, earth_el = earth_f.result()
    except HorizonsError as exc:
        raise HTTPException(502, str(exc))
    if times != e_times:
        raise HTTPException(502, "Sun and Earth timestamps disagree")

    az_step = asset["azimuth_step_deg"]
    prof = asset["horizon"][str(height)]
    full, far = prof["full_deg"], prof["far_field_deg"]

    sun_h = horizon_series(sun_az, full, az_step)
    earth_h = horizon_series(earth_az, full, az_step)
    sun_c = [e - h for e, h in zip(sun_el, sun_h)]
    earth_c = [e - h for e, h in zip(earth_el, earth_h)]
    sun_c_far = clearance(sun_az, sun_el, far, az_step)
    earth_c_far = clearance(earth_az, earth_el, far, az_step)

    step_hours = step / 60
    terrain, terrain_w = metrics.compute(sun_c, earth_c, step_hours)
    geometric, geometric_w = metrics.compute(sun_el, earth_el, step_hours)
    far_m, _ = metrics.compute(sun_c_far, earth_c_far, step_hours)
    # On clearance series these maxima are clearances, not elevations.
    terrain["max_sun_clearance_deg"] = terrain.pop("max_sun_elevation_deg")
    terrain["max_earth_clearance_deg"] = terrain.pop(
        "max_earth_elevation_deg")

    def mean_disk(clear):
        return round(100 * sum(
            disk_fraction(c, SUN_RADIUS_DEG) for c in clear[:-1]
        ) / (len(clear) - 1), 1)

    terrain["mean_sun_disk_pct"] = mean_disk(sun_c)
    geometric["mean_sun_disk_pct"] = mean_disk(sun_el)
    start_dt = times[0]

    # Decimate the 0.5 deg profile to 1 deg for display.
    k = max(1, int(round(1 / az_step)))

    return {
        "site": summary(asset),
        "height_m": height,
        "start": iso(start_dt),
        "days": days,
        "step_minutes": step,
        "times": [iso(t) for t in times],
        "sun": {"azimuth_deg": sun_az, "elevation_deg": sun_el,
                "terrain_horizon_deg": sun_h},
        "earth": {"azimuth_deg": earth_az, "elevation_deg": earth_el,
                  "terrain_horizon_deg": earth_h},
        "metrics": {
            "terrain": terrain,
            "geometric": geometric,
            "terrain_far_field": {
                "sun_up_pct": far_m["sun_up_pct"],
                "earth_visible_pct": far_m["earth_visible_pct"],
                "far_field_m": asset["coverage"]["far_field_m"],
            },
        },
        "windows": {
            "terrain": windows_iso(start_dt, terrain_w),
            "geometric": windows_iso(start_dt, geometric_w),
        },
        "horizon_profile": {
            "azimuth_deg": [i * az_step for i in range(0, len(full), k)],
            "full_deg": full[::k],
            "far_field_deg": far[::k],
        },
        "definitions": DEFINITIONS,
        "source": "NASA JPL Horizons observer ephemeris (CENTER=coord@301, "
                  "MOON_ME DE421); terrain from LRO LOLA (NASA PGDA, PDS)",
        "generated_at": iso(datetime.now(timezone.utc)),
        "limitations": LIMITATIONS,
    }
