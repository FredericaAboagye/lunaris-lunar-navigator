"""Terrain horizon (max elevation angle by true azimuth) from LOLA DEMs.

For an observer at (lat0, lon0) standing `height_m` above the local
surface, each azimuth is traced along a great circle. At ground distance
s (central angle d = s / R) a terrain point of height z above the
reference sphere has, relative to the observer's local horizontal plane
(the plane perpendicular to the radial zenith, the same plane NASA
Horizons uses for elevation on the spherical Moon):

    elevation = atan2((R + z) cos d - r0, (R + z) sin d),  r0 = R + z0 + h

This includes lunar curvature exactly. The horizon is the maximum over s.
Heights come from the finest grid covering each sample; the distance at
which the last grid runs out is recorded so truncated rays are flagged.
"""

import numpy as np

from .projection import R_MOON, destination, latlon_to_xy


NEAR_FIELD_PIXELS = 50  # elevation angles change fastest close in
REFINE_POINTS = 129  # local resampling around each ray's best sample


def distance_samples(fine_res, fine_reach, coarse_res, max_distance,
                     step_fraction=0.5, near_step_fraction=0.03125):
    """Ground distances stepping a fraction of a pixel in each domain.

    Within NEAR_FIELD_PIXELS of the observer a finer step is used because
    a given height error subtends a larger angle there.
    """
    near_end = min(NEAR_FIELD_PIXELS * fine_res, fine_reach)
    closest = np.arange(fine_res, near_end, fine_res * near_step_fraction)
    near = np.arange(near_end, fine_reach, fine_res * step_fraction)
    far = np.arange(fine_reach, max_distance, coarse_res * step_fraction)
    # Always end exactly at max_distance so coverage can be checked
    # against it without floating-point slack.
    return np.concatenate([closest, near, far, [max_distance]])


def horizon_profile(lat0, lon0, height_m, grids, azimuth_step=0.5,
                    max_distance=250_000.0, fine_reach=None,
                    step_fraction=0.5, near_step_fraction=0.03125,
                    far_field_m=200.0):
    """Return dict with azimuths, horizon elevations and diagnostics.

    grids: list of Grid ordered finest first. The observer must lie on
    the finest grid.
    """
    fine, coarse = grids[0], grids[-1]
    x0, y0 = latlon_to_xy(lat0, lon0)
    z0 = float(fine.sample(x0, y0))
    if not np.isfinite(z0):
        raise ValueError("observer is outside the finest grid")
    r0 = R_MOON + z0 + height_m

    if fine_reach is None:
        xmin, xmax, ymin, ymax = fine.extent
        fine_reach = max(
            abs(x0 - xmin), abs(xmax - x0), abs(y0 - ymin), abs(ymax - y0)
        ) * 1.5
    s = distance_samples(fine.res, fine_reach, coarse.res, max_distance,
                         step_fraction, near_step_fraction)
    az = np.arange(0.0, 360.0, azimuth_step)

    def heights(dist):
        """Terrain height along every azimuth at distances `dist`
        (shape: n_az x n_dist), finest grid first."""
        lat, lon = destination(lat0, lon0, az[:, None], dist)
        x, y = latlon_to_xy(lat, lon)
        z = np.full(x.shape, np.nan)
        src = np.full(x.shape, -1, dtype=np.int8)
        for k, grid in enumerate(grids):
            need = np.isnan(z)
            if not need.any():
                break
            v = grid.sample(x[need], y[need])
            z[need] = v
            src[need] = np.where(np.isfinite(v), k, -1)
        return z, src

    def elevation(z, dist):
        d = dist / R_MOON
        r = R_MOON + z
        e = np.degrees(np.arctan2(r * np.cos(d) - r0, r * np.sin(d)))
        return np.where(np.isfinite(e), e, -90.0)

    z, source = heights(s[None, :])
    elev_filled = elevation(z, s[None, :])
    rows = np.arange(len(az))

    def refined_max(mask):
        """Max elevation over samples in `mask`, refined between the
        neighbours of the best sample. The bilinear surface has kinks at
        cell edges where the true maximum often lies, so fixed steps
        converge slowly; local resampling removes that dependence."""
        e = np.where(mask[None, :], elev_filled, -90.0)
        k = np.argmax(e, axis=1)
        lo = s[np.maximum(k - 1, 0)]
        hi = s[np.minimum(k + 1, len(s) - 1)]
        t = np.linspace(0.0, 1.0, REFINE_POINTS)[None, :]
        dist = lo[:, None] + (hi - lo)[:, None] * t
        zr, srcr = heights(dist)
        er = elevation(zr, dist)
        j = np.argmax(er, axis=1)
        better = er[rows, j] > e[rows, k]
        value = np.where(better, er[rows, j], e[rows, k])
        where = np.where(better, dist[rows, j], s[k])
        grid = np.where(better, srcr[rows, j], source[rows, k])
        return value, where, grid

    horizon, obstacle_m, obstacle_grid = refined_max(np.ones_like(s, bool))
    far_horizon, _, _ = refined_max(s >= far_field_m)

    covered = np.isfinite(z)
    # Distance up to which terrain is known without gaps.
    first_gap = np.where(
        (~covered).any(axis=1), np.argmax(~covered, axis=1), len(s)
    )
    reach = np.where(first_gap > 0, s[np.maximum(first_gap - 1, 0)], 0.0)
    complete = bool((reach >= max_distance).all())

    return {
        "azimuth_deg": az,
        "horizon_deg": horizon,
        "far_horizon_deg": far_horizon,
        "far_field_m": far_field_m,
        "obstacle_distance_m": obstacle_m,
        "obstacle_grid": obstacle_grid,
        "coverage_m": reach,
        "coverage_complete": complete,
        "observer_surface_m": z0,
        "observer_xy": (float(x0), float(y0)),
        "max_distance_m": max_distance,
        "fine_reach_m": float(fine_reach),
    }


def horizon_at(azimuths_deg, profile_az, profile_el):
    """Linear interpolation of a periodic horizon profile."""
    az = np.asarray(azimuths_deg) % 360.0
    xp = np.concatenate([profile_az, [profile_az[0] + 360.0]])
    fp = np.concatenate([profile_el, [profile_el[0]]])
    return np.interp(az, xp, fp)
