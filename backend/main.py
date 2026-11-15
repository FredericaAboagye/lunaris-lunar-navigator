"""Lunaris API: Sun/Earth geometry at lunar sites from NASA JPL Horizons."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from math import isfinite

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import metrics
from horizons import HorizonsError, fetch_series
from sites import SITES

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
    "Geometric horizon on a smooth lunar sphere only. Terrain masking, "
    "lander antenna/panel geometry, and Earth-link margins are not "
    "modeled. Intended for comparative planning, not flight design."
)

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
    return {"sites": SITES}


@app.get("/api/analysis")
def analysis(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=360),
    start: date = Query(...),
    days: int = Query(30, ge=1, le=60),
    step: int = Query(60),
):
    if not (isfinite(lat) and isfinite(lon)):
        raise HTTPException(400, "Coordinates must be finite")
    if step not in ALLOWED_STEPS:
        raise HTTPException(
            400, f"step must be one of {list(ALLOWED_STEPS)} minutes"
        )
    if not (MIN_DATE <= start <= MAX_DATE - timedelta(days=days)):
        raise HTTPException(
            400, f"start must be between {MIN_DATE} and {MAX_DATE}"
        )

    args = (round(lat, 4), round(lon, 4), start.isoformat(), days, step)
    try:
        sun_f = _pool.submit(fetch_series, "sun", *args)
        earth_f = _pool.submit(fetch_series, "earth", *args)
        times, sun_az, sun_el = sun_f.result()
        e_times, earth_az, earth_el = earth_f.result()
    except HorizonsError as exc:
        raise HTTPException(502, str(exc))

    if times != e_times:
        raise HTTPException(502, "Sun and Earth timestamps disagree")

    step_hours = step / 60
    summary, windows = metrics.compute(sun_el, earth_el, step_hours)
    start_dt = times[0]

    return {
        "latitude": lat,
        "longitude": lon,
        "start": iso(start_dt),
        "days": days,
        "step_minutes": step,
        "times": [iso(t) for t in times],
        "sun": {"azimuth_deg": sun_az, "elevation_deg": sun_el},
        "earth": {"azimuth_deg": earth_az, "elevation_deg": earth_el},
        "metrics": summary,
        "windows": {
            name: [
                {
                    "start": hours_to_iso(start_dt, s),
                    "end": hours_to_iso(start_dt, e),
                    "hours": round(e - s, 2),
                }
                for s, e in items
            ]
            for name, items in windows.items()
        },
        "source": "NASA JPL Horizons (observer ephemeris, "
                  "CENTER=coord@301)",
        "generated_at": iso(datetime.now(timezone.utc)),
        "limitations": LIMITATIONS,
    }
