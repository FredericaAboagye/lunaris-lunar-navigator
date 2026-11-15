"""Runtime visibility helpers and /api/analysis terrain logic."""

import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import main  # noqa: E402
from sites import load_site  # noqa: E402
from visibility import disk_fraction, horizon_at  # noqa: E402


def test_disk_fraction_limits_and_half():
    assert disk_fraction(1.0, 0.25) == 1.0
    assert disk_fraction(-1.0, 0.25) == 0.0
    assert disk_fraction(0.0, 0.25) == pytest.approx(0.5)
    assert disk_fraction(0.1, 0.25) > 0.5 > disk_fraction(-0.1, 0.25)


def test_horizon_at_wraps_and_interpolates():
    profile = [0.0, 1.0, 2.0, 3.0]  # every 90 deg
    assert horizon_at(45.0, profile, 90.0) == pytest.approx(0.5)
    assert horizon_at(315.0, profile, 90.0) == pytest.approx(1.5)
    assert horizon_at(-45.0, profile, 90.0) == pytest.approx(1.5)


@pytest.fixture
def client(monkeypatch):
    from fastapi.testclient import TestClient

    asset = load_site("site04")
    if asset is None:
        pytest.skip("site04 asset not built")
    full = asset["horizon"]["2"]["full_deg"]
    step = asset["azimuth_step_deg"]
    t0 = datetime(2026, 11, 14, tzinfo=timezone.utc)

    calls = []

    def fake_series(body, lat, lon, start, days, step_minutes):
        calls.append((body, lat, lon))
        n = days * 24 * 60 // step_minutes + 1
        times = [t0 + timedelta(minutes=i * step_minutes) for i in range(n)]
        az = [(i * 7.0) % 360 for i in range(n)]
        if body == "sun":
            # Always 0.05 deg above the terrain horizon at its azimuth.
            el = [horizon_at(a, full, step) + 0.05 for a in az]
        else:
            # Always 0.05 deg below the terrain horizon.
            el = [horizon_at(a, full, step) - 0.05 for a in az]
        return times, az, el

    monkeypatch.setattr(main, "fetch_series", fake_series)
    c = TestClient(main.app)
    c.calls, c.asset = calls, asset
    return c


def test_terrain_clearance_drives_visibility(client):
    r = client.get("/api/analysis", params={
        "site": "site04", "start": "2026-11-14", "days": 2, "height": 2})
    assert r.status_code == 200, r.text
    m = r.json()["metrics"]
    assert m["terrain"]["sun_up_pct"] == 100.0
    assert m["terrain"]["earth_visible_pct"] == 0.0
    assert m["terrain"]["longest_comms_blackout_hours"] == 48.0
    # Mean disk ~ fraction for a centre 0.05 deg above the horizon.
    assert 55 < m["terrain"]["mean_sun_disk_pct"] < 75


def test_unknown_site_and_height_rejected(client):
    assert client.get("/api/analysis", params={
        "site": "nowhere", "start": "2026-11-14"}).status_code == 404
    assert client.get("/api/analysis", params={
        "site": "site04", "start": "2026-11-14",
        "height": 7}).status_code == 400


def test_sites_lists_only_validated_and_flags_unsupported(client):
    body = client.get("/api/sites").json()
    assert all(s["validation"]["passed"] for s in body["sites"])
    assert "site23" in body["unsupported"]


def test_disk_fraction_is_area_not_chord():
    # Monte Carlo area of a unit disk above a horizontal chord at height c.
    import random

    rng = random.Random(1)
    pts = []
    while len(pts) < 200_000:
        x, y = rng.uniform(-1, 1), rng.uniform(-1, 1)
        if x * x + y * y <= 1:
            pts.append(y)
    for c in (-0.6, -0.2, 0.3, 0.8):
        # Centre is c radii above the horizon: visible where y > -c.
        area = sum(1 for y in pts if y > -c) / len(pts)
        assert disk_fraction(c, 1.0) == pytest.approx(area, abs=0.005)
        linear = (1 + c) / 2  # diameter-based fraction, the wrong model
        if abs(c) > 0.2:
            assert abs(disk_fraction(c, 1.0) - linear) > 0.02


@pytest.mark.parametrize("params,code", [
    ({"days": 0}, 422), ({"days": 61}, 422), ({"start": "2026-13-01"}, 422),
    ({"start": "1999-12-31"}, 400), ({"start": "2049-12-02"}, 400),
    ({"height": 7}, 400), ({"step": 120}, 400), ({"site": "x" * 41}, 422),
])
def test_invalid_inputs_rejected(client, params, code):
    q = {"site": "site04", "start": "2026-11-14", "days": 30, **params}
    assert client.get("/api/analysis", params=q).status_code == code


def test_date_boundaries_accepted(client):
    for start, days in (("2000-01-01", 1), ("2049-12-01", 30)):
        r = client.get("/api/analysis", params={
            "site": "site04", "start": start, "days": days})
        assert r.status_code == 200, (start, r.text)


def test_unsupported_site_explains_why(client):
    r = client.get("/api/analysis", params={
        "site": "site23", "start": "2026-11-14"})
    assert r.status_code == 404 and "not available" in r.json()["detail"]


def test_version_and_legacy_v1_shape(client):
    assert client.get("/api/health").json()["api_version"] == 2
    r = client.get("/api/timeline", params={
        "lat": -89.5, "lon": 0, "day": "2026-11-14"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["sun"]) == 13 and body["sun"][6]["hour"] == 12
    assert set(body["earth"][0]) >= {"time_utc", "azimuth_deg",
                                     "elevation_deg", "hour"}


def test_analysis_queries_horizons_at_documented_point(client):
    client.get("/api/analysis", params={"site": "site04",
                                        "start": "2026-11-14", "days": 1})
    pt = client.asset["point"]
    assert {(lat, lon) for _, lat, lon in client.calls} == {
        (pt["latitude"], pt["longitude"])}


# --- Integration with origin/main (mission window, reference sites) ---

def test_mission_window_contract_matches_upstream(client):
    r = client.get("/api/mission-window", params={
        "lat": -85.942, "lon": -0.944, "day": "2027-03-01", "duration": 3})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["step_hours"] == 6 and body["duration_days"] == 3
    for b in ("sun", "earth"):
        obs = body[b]["observations"]
        assert len(obs) == 3 * 4 + 1
        assert set(obs[0]) == {"time_utc", "azimuth_deg", "elevation_deg",
                               "above_geometric_horizon"}
        s = body[b]["summary"]
        assert s["sample_count"] == len(obs)
        assert s["samples_above_horizon"] == sum(
            o["above_geometric_horizon"] for o in obs)
    assert client.get("/api/mission-window", params={
        "lat": -85, "lon": 0, "day": "2027-03-01",
        "duration": 5}).status_code == 400


def test_reference_sites_listed_but_never_analysed(client):
    body = client.get("/api/sites").json()
    refs = {r["id"]: r for r in body["reference_sites"]}
    assert set(refs) == {"MMO01", "MMA01", "dGR201", "NR101"}
    assert all("10.1029/2025JE009434" in r["source"] for r in refs.values())
    validated = {s["id"] for s in body["sites"]}
    assert not validated & set(refs)
    for rid in refs:
        assert client.get("/api/analysis", params={
            "site": rid, "start": "2027-03-01"}).status_code == 404
