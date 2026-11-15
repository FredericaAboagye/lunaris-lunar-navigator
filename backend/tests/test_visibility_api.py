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

    def fake_series(body, lat, lon, start, days, step_minutes):
        assert (lat, lon) == (asset["point"]["latitude"],
                              asset["point"]["longitude"])
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
    return TestClient(main.app)


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
