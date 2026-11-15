from datetime import date, timedelta
from math import isfinite
import csv
import requests
import os


from datetime import datetime, timezone


def parse_horizons_observation(row):
    """Parse a Horizons CSV observer-table row.

    Expected columns for QUANTITIES=4:
      0: UTC timestamp
      1: solar-presence marker
      2: lunar-presence marker
      3: apparent azimuth in degrees
      4: apparent elevation in degrees
    """
    if len(row) < 5:
        raise ValueError(f"Incomplete Horizons row: {row!r}")

    timestamp_text = row[0].strip()
    azimuth_text = row[3].strip()
    elevation_text = row[4].strip()

    timestamp = datetime.strptime(
        timestamp_text, "%Y-%b-%d %H:%M"
    ).replace(tzinfo=timezone.utc)

    azimuth = float(azimuth_text)
    elevation = float(elevation_text)

    if not (isfinite(azimuth) and isfinite(elevation)):
        raise ValueError("Non-finite Horizons angles")

    if not (0 <= azimuth <= 360 and -90 <= elevation <= 90):
        raise ValueError("Horizons angle outside expected range")

    return {
        "time_utc": timestamp.isoformat().replace("+00:00", "Z"),
        "azimuth_deg": round(azimuth, 3),
        "elevation_deg": round(elevation, 3),
        "above_geometric_horizon": elevation > 0,
    }


from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Lunaris NASA Data API")



app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
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
            point = parse_horizons_observation(row)

            expected_time = datetime(
                day.year, day.month, day.day,
                tzinfo=timezone.utc
            ) + timedelta(hours=index * 2)

            expected_iso = expected_time.isoformat().replace(
                "+00:00", "Z"
            )

            if point["time_utc"] != expected_iso:
                raise ValueError(
                    f"Unexpected timestamp: {point['time_utc']}"
                )

            point["hour"] = index * 2
            points.append(point)

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


from datetime import datetime, timezone


@lru_cache(maxsize=128)
def get_mission_series(
    body: str,
    lat: float,
    lon: float,
    start_date: str,
    duration: int,
):
    start = date.fromisoformat(start_date)
    stop = start + timedelta(days=duration)

    params = {
        "format": "json",
        "COMMAND": f"'{body}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",
        "START_TIME": f"'{start.isoformat()} 00:00'",
        "STOP_TIME": f"'{stop.isoformat()} 00:00'",
        "STEP_SIZE": "'6 h'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'UT'",
    }

    try:
        response = requests.get(
            HORIZONS_URL,
            params=params,
            timeout=45,
        )
        response.raise_for_status()

        result = response.json()["result"]

        if "$$SOE" not in result or "$$EOE" not in result:
            raise ValueError("No Horizons observation table")

        table = result.split("$$SOE", 1)[1].split(
            "$$EOE", 1
        )[0]

        rows = [
            row for row in csv.reader(table.splitlines())
            if row and any(cell.strip() for cell in row)
        ]

        expected_count = duration * 4 + 1

        if len(rows) != expected_count:
            raise ValueError(
                f"Expected {expected_count} samples, "
                f"received {len(rows)}"
            )

        start_utc = datetime(
            start.year, start.month, start.day,
            tzinfo=timezone.utc
        )

        observations = []

        for index, row in enumerate(rows):
            if len(row) < 5:
                raise ValueError("Incomplete Horizons row")

            observed_time = datetime.strptime(
                row[0].strip(),
                "%Y-%b-%d %H:%M"
            ).replace(tzinfo=timezone.utc)

            expected_time = start_utc + timedelta(
                hours=index * 6
            )

            if observed_time != expected_time:
                raise ValueError(
                    "Unexpected Horizons timestamp"
                )

            azimuth = float(row[3].strip())
            elevation = float(row[4].strip())

            if not (
                isfinite(azimuth) and isfinite(elevation)
                and 0 <= azimuth <= 360
                and -90 <= elevation <= 90
            ):
                raise ValueError("Invalid Horizons angles")

            observations.append({
                "time_utc": observed_time.isoformat().replace(
                    "+00:00", "Z"
                ),
                "azimuth_deg": round(azimuth, 3),
                "elevation_deg": round(elevation, 3),
                "above_geometric_horizon": elevation > 0,
            })

        return observations

    except (
        requests.RequestException,
        ValueError,
        KeyError,
        IndexError,
        TypeError,
    ) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NASA mission analysis failed: {exc}"
        )


def summarize_visibility(observations):
    visible = sum(
        point["above_geometric_horizon"]
        for point in observations
    )

    total = len(observations)

    return {
        "sample_count": total,
        "samples_above_horizon": visible,
        "percent_samples_above_horizon": round(
            visible / total * 100, 1
        ),
    }


@app.get("/api/mission-window")
def mission_window(
    lat: float,
    lon: float,
    day: date,
    duration: int = 3,
):
    if duration not in (1, 3, 7, 14):
        raise HTTPException(
            status_code=400,
            detail="Duration must be 1, 3, 7, or 14 days"
        )

    if not (
        isfinite(lat) and isfinite(lon)
        and -90 <= lat <= 90
        and -180 <= lon <= 360
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid lunar coordinates"
        )

    sun = get_mission_series(
        "10", lat, lon, day.isoformat(), duration
    )

    earth = get_mission_series(
        "399", lat, lon, day.isoformat(), duration
    )

    return {
        "latitude": lat,
        "longitude": lon,
        "start_date": day.isoformat(),
        "duration_days": duration,
        "step_hours": 6,
        "sun": {
            "observations": sun,
            "summary": summarize_visibility(sun),
        },
        "earth": {
            "observations": earth,
            "summary": summarize_visibility(earth),
        },
        "source": "NASA JPL Horizons",
        "limitations": (
            "Percentages describe sampled geometric "
            "visibility, not continuous visibility duration. "
            "Local terrain, solar-panel orientation, "
            "power generation, and communication link "
            "quality are not modeled."
        ),
    }
