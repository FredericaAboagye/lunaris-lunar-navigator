"""Thin client for the NASA JPL Horizons observer-table API."""

import csv
import threading
import time
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from math import isfinite

import requests

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODIES = {"sun": "10", "earth": "399"}
MOON_CENTER = "coord@301"

# Horizons rejects bursts of concurrent requests with HTTP 503, so keep
# upstream concurrency low and retry transient failures with backoff.
_upstream = threading.BoundedSemaphore(2)
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 4


class HorizonsError(RuntimeError):
    """Raised when Horizons fails or returns unexpected data."""


def parse_row(row):
    """Parse one CSV row of a QUANTITIES=4 (apparent az/el) table.

    Columns: UTC time, solar marker, lunar marker, azimuth, elevation.
    """
    if len(row) < 5:
        raise HorizonsError(f"Incomplete Horizons row: {row!r}")
    try:
        stamp = datetime.strptime(
            row[0].strip(), "%Y-%b-%d %H:%M"
        ).replace(tzinfo=timezone.utc)
        azimuth = float(row[3])
        elevation = float(row[4])
    except ValueError as exc:
        raise HorizonsError(f"Unparseable Horizons row: {row!r}") from exc

    if not (isfinite(azimuth) and isfinite(elevation)):
        raise HorizonsError("Non-finite Horizons angles")
    if not (0 <= azimuth <= 360 and -90 <= elevation <= 90):
        raise HorizonsError("Horizons angle outside expected range")
    return stamp, azimuth, elevation


def parse_table(result_text, expected_rows, start_dt, step_minutes):
    """Extract and validate the ephemeris table from a Horizons result."""
    if "$$SOE" not in result_text or "$$EOE" not in result_text:
        raise HorizonsError(
            "Horizons did not return an ephemeris table: "
            + result_text[-300:].strip()
        )
    body = result_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = [
        r for r in csv.reader(body.splitlines())
        if r and any(c.strip() for c in r)
    ]
    if len(rows) != expected_rows:
        raise HorizonsError(
            f"Expected {expected_rows} observations, got {len(rows)}"
        )

    times, az, el = [], [], []
    for index, row in enumerate(rows):
        stamp, a, e = parse_row(row)
        expected = start_dt + timedelta(minutes=index * step_minutes)
        if stamp != expected:
            raise HorizonsError(
                f"Unexpected timestamp {stamp.isoformat()} "
                f"(wanted {expected.isoformat()})"
            )
        times.append(stamp)
        az.append(round(a, 3))
        el.append(round(e, 3))
    return times, az, el


@lru_cache(maxsize=256)
def fetch_series(body, lat, lon, start_iso, days, step_minutes):
    """Fetch apparent azimuth/elevation of ``body`` seen from a lunar site.

    Returns (times, azimuth_deg, elevation_deg) as parallel lists.
    The result is deterministic, so it is cached.
    """
    start = date.fromisoformat(start_iso)
    start_dt = datetime(
        start.year, start.month, start.day, tzinfo=timezone.utc
    )
    stop_dt = start_dt + timedelta(days=days)
    expected_rows = days * 24 * 60 // step_minutes + 1

    params = {
        "format": "json",
        "COMMAND": f"'{BODIES[body]}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": f"'{MOON_CENTER}'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",
        "START_TIME": f"'{start_dt:%Y-%m-%d %H:%M}'",
        "STOP_TIME": f"'{stop_dt:%Y-%m-%d %H:%M}'",
        "STEP_SIZE": f"'{step_minutes} m'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'UT'",
    }
    result = None
    last_problem = "unknown error"
    for attempt in range(MAX_ATTEMPTS):
        if attempt:
            time.sleep(0.8 * 2 ** (attempt - 1))
        try:
            with _upstream:
                response = requests.get(
                    HORIZONS_URL, params=params, timeout=40
                )
        except requests.RequestException as exc:
            last_problem = type(exc).__name__
            continue
        if response.status_code in RETRY_STATUSES:
            last_problem = f"HTTP {response.status_code}"
            continue
        try:
            response.raise_for_status()
            result = response.json()["result"]
        except (requests.RequestException, KeyError, ValueError) as exc:
            raise HorizonsError(
                f"Horizons returned an unusable response "
                f"({type(exc).__name__})"
            ) from exc
        break

    if result is None:
        raise HorizonsError(
            "NASA Horizons is temporarily unavailable "
            f"({last_problem}). Please retry shortly."
        )

    return parse_table(result, expected_rows, start_dt, step_minutes)
