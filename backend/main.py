 
from datetime import date, timedelta
from math import isfinite
import csv
import requests

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Lunaris NASA Data API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
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
