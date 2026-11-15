"""Coordinate, frame and horizon tests on synthetic terrain."""

import math
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from terrain.horizon import horizon_at, horizon_profile  # noqa: E402
from terrain.projection import (  # noqa: E402
    R_MOON, destination, initial_bearing, latlon_to_xy, xy_to_latlon,
)
from terrain.rasters import Grid  # noqa: E402


def test_projection_round_trip():
    for lat, lon in [(-89.67, 129.78), (-85.9, 2.9), (-89.999, 300.0)]:
        x, y = latlon_to_xy(lat, lon)
        lat2, lon2 = xy_to_latlon(x, y)
        assert abs(lat2 - lat) < 1e-9 and abs(lon2 - lon) < 1e-9


def test_projection_matches_proj():
    pyproj = pytest.importorskip("pyproj")
    crs = pyproj.CRS.from_proj4(
        "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 "
        "+R=1737400 +units=m +no_defs"
    )
    t = pyproj.Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    for lat, lon in [(-89.67, 129.78), (-85.9, -60.0), (-88.0, 222.7)]:
        ex, ey = t.transform(((lon + 180) % 360) - 180, lat)
        x, y = latlon_to_xy(lat, lon)
        assert math.hypot(x - ex, y - ey) < 1e-6


def test_bearing_toward_pole_is_south_regardless_of_grid_direction():
    # Raster "up" is +y; at lon 90E grid-up is not north. Bearing must
    # still say the pole is due south (180 deg).
    for lon in (0, 90, 200, 315):
        assert abs(initial_bearing(-89.5, lon, -90.0, 0.0) - 180) < 1e-6


def test_destination_inverse_of_bearing():
    lat, lon = destination(-89.7, 203.0, 37.0, 5000.0)
    assert abs(initial_bearing(-89.7, 203.0, lat, lon) - 37.0) < 1e-6


def flat_grid(z_fn=None, half=40_000.0, res=40.0):
    n = int(2 * half / res)
    xs = -half + (np.arange(n) + 0.5) * res
    ys = half - (np.arange(n) + 0.5) * res
    X, Y = np.meshgrid(xs, ys)
    z = np.zeros_like(X) if z_fn is None else z_fn(X, Y)
    return Grid("synthetic", z.astype(np.float64), -half, half, res, "t")


def test_smooth_sphere_horizon_is_geometric_dip():
    g = flat_grid()
    prof = horizon_profile(-89.8, 45.0, 10.0, [g], azimuth_step=10,
                           max_distance=20_000, fine_reach=20_000)
    dip = -math.degrees(math.sqrt(2 * 10.0 / R_MOON))
    assert np.allclose(prof["horizon_deg"], dip, atol=0.003)


def test_wall_appears_at_true_azimuth_with_curvature():
    obs_lat, obs_lon = -89.6, 120.0
    # A 2 km tall block centred 10 km from the observer due east (90 deg).
    tlat, tlon = destination(obs_lat, obs_lon, 90.0, 10_000.0)
    tx, ty = latlon_to_xy(tlat, tlon)

    def z(X, Y):
        return np.where(np.hypot(X - tx, Y - ty) < 300, 2000.0, 0.0)

    g = flat_grid(z, res=20.0)
    prof = horizon_profile(obs_lat, obs_lon, 2.0, [g], azimuth_step=1,
                           max_distance=20_000, fine_reach=20_000)
    peak = prof["azimuth_deg"][np.argmax(prof["horizon_deg"])]
    assert abs(peak - 90.0) <= 1.0
    d = (10_000.0 - 300) / R_MOON
    r, r0 = R_MOON + 2000.0, R_MOON + 2.0
    expected = math.degrees(math.atan2(r * math.cos(d) - r0,
                                       r * math.sin(d)))
    assert abs(prof["horizon_deg"].max() - expected) < 0.2
    # Opposite direction is unobstructed (geometric dip only).
    assert prof["horizon_deg"][270] < 0.0


def test_missing_terrain_is_reported_not_assumed_flat():
    g = flat_grid(half=5_000.0, res=50.0)
    prof = horizon_profile(-89.95, 0.0, 2.0, [g], azimuth_step=45,
                           max_distance=50_000, fine_reach=6_000)
    assert (prof["coverage_m"] < 50_000).all()


def test_horizon_interpolation_wraps():
    az = np.array([0.0, 90.0, 180.0, 270.0])
    el = np.array([1.0, 2.0, 3.0, 4.0])
    assert horizon_at(315.0, az, el) == pytest.approx(2.5)
    assert horizon_at(-45.0, az, el) == pytest.approx(2.5)
