 
from datetime import date, timedelta
from math import isfinite
import csv
import requests
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Lunaris NASA Data API")

import os

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ] + [
        origin.strip()
        for origin in os.getenv("FRONTEND_ORIGIN", "").split(",")
        if origin.strip()
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"


def get_position(body: str, lat: float, lon: float, day: date):
    start = f"{day.isoformat()} 12:00"
    stop = f"{day.isoformat()} 13:00"

    params = {
        "format": "json",
        "COMMAND": f"'{body}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": "'1 h'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
    }

    try:
        response = requests.get(
            HORIZONS_URL, params=params, timeout=25
        )
        response.raise_for_status()
        result = response.json()["result"]

        if "$$SOE" not in result or "$$EOE" not in result:
            raise ValueError(
                "Horizons did not return an ephemeris table: "
                + result[-500:]
            )

        table = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
        rows = [row for row in csv.reader(table.splitlines())
                if row and any(cell.strip() for cell in row)]

        if not rows:
            raise ValueError("NASA returned no observations")

        # QUANTITIES=4 requests apparent azimuth and elevation.
        # With CSV_FORMAT=YES, these are the final two data fields.
        fields = [value.strip() for value in rows[0] if value.strip()]
        azimuth = float(fields[-2])
        elevation = float(fields[-1])

        return {
            "azimuth_deg": round(azimuth, 3),
            "elevation_deg": round(elevation, 3),
            "above_geometric_horizon": elevation > 0,
        }

    except (requests.RequestException, ValueError, KeyError,
            IndexError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NASA Horizons request failed: {exc}",
        )


@app.get("/")
def home():
    return {"message": "Lunaris NASA backend is running"}


@app.get("/api/conditions")
def conditions(lat: float, lon: float, day: date):
    if not (-90 <= lat <= 90 and -180 <= lon <= 360):
        raise HTTPException(
            status_code=400, detail="Invalid lunar coordinates"
        )

    if not isfinite(lat) or not isfinite(lon):
        raise HTTPException(
            status_code=400, detail="Coordinates must be finite"
        )

    sun = get_position("10", lat, lon, day)
    earth = get_position("399", lat, lon, day)

    return {
        "latitude": lat,
        "longitude": lon,
        "date": day.isoformat(),
        "observation_time_utc": f"{day.isoformat()}T12:00:00Z",
        "sun": sun,
        "earth": earth,
        "source": "NASA JPL Horizons",
        "limitations": (
            "Geometric horizon only; terrain obstructions, "
            "solar panel orientation and full-day visibility "
            "windows are not yet modeled."
        ),
    }


from functools import lru_cache


@lru_cache(maxsize=128)
def get_position_series(body: str, lat: float, lon: float,
                        day_text: str):
    day = date.fromisoformat(day_text)
    next_day = day + timedelta(days=1)

    params = {
        "format": "json",
        "COMMAND": f"'{body}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",
        "START_TIME": f"'{day.isoformat()} 00:00'",
        "STOP_TIME": f"'{next_day.isoformat()} 00:00'",
        "STEP_SIZE": "'2 h'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'UT'",
    }

    try:
        response = requests.get(
            HORIZONS_URL, params=params, timeout=35
        )
        response.raise_for_status()

        result = response.json()["result"]

        if "$$SOE" not in result or "$$EOE" not in result:
            raise ValueError(
                "Horizons did not return an ephemeris table"
            )

        table = result.split("$$SOE", 1)[1].split(
            "$$EOE", 1
        )[0]

        rows = [
            row for row in csv.reader(table.splitlines())
            if row and any(field.strip() for field in row)
        ]

        if len(rows) != 13:
            raise ValueError(
                f"Expected 13 observations, received {len(rows)}"
            )

        points = []

        for index, row in enumerate(rows):
            # Remove empty CSV fields, including trailing blanks.
            values = [
                field.strip()
                for field in row
                if field.strip()
            ]

            if len(values) < 3:
                raise ValueError(
                    f"Incomplete Horizons observation: {row!r}"
            )

            try:
                azimuth = float(values[-2])
                elevation = float(values[-1])
            except ValueError as exc:
                raise ValueError(
                    f"Could not parse azimuth/elevation: {row!r}"
                ) from exc


            if not (isfinite(azimuth) and isfinite(elevation)):
                raise ValueError("Non-finite position received")

            if not (0 <= azimuth <= 360 and
                    -90 <= elevation <= 90):
                raise ValueError("Invalid position angles")

            hour = index * 2

            points.append({
                "hour": hour,
                "time_utc": (
                    f"{day.isoformat()}T{hour:02d}:00:00Z"
                    if hour < 24
                    else f"{next_day.isoformat()}T00:00:00Z"
                ),
                "azimuth_deg": round(azimuth, 3),
                "elevation_deg": round(elevation, 3),
                "above_geometric_horizon": elevation > 0,
            })

        return points

    except (requests.RequestException, ValueError,
            KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Horizons timeline request failed: {exc}"
        )


@app.get("/api/timeline")
def timeline(lat: float, lon: float, day: date):
    if not (
        isfinite(lat) and isfinite(lon)
        and -90 <= lat <= 90
        and -180 <= lon <= 360
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid lunar coordinates"
        )

    sun = get_position_series(
        "10", lat, lon, day.isoformat()
    )

    earth = get_position_series(
        "399", lat, lon, day.isoformat()
    )

    return {
        "latitude": lat,
        "longitude": lon,
        "date": day.isoformat(),
        "step_hours": 2,
        "sun": sun,
        "earth": earth,
        "source": "NASA JPL Horizons",
        "limitations": (
            "Geometric horizon only. Local terrain and "
            "full illumination/communication windows "
            "are not yet modeled."
        ),
    }
