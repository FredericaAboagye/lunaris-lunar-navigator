"""Terrain-aware visibility of the Sun and Earth (pure Python, runtime).

Conventions (match NASA Horizons QUANTITIES=4 and the terrain profiles):
azimuth in degrees clockwise from local true north; elevation in degrees
above the plane perpendicular to the local (radial) zenith; positions
refer to the body centre.
"""

from math import acos, pi, sqrt

# Mean apparent angular radii seen from the Moon. The Sun's varies by
# about +/-1.7 % over a year; Earth's by about +/-5 % over a month.
SUN_RADIUS_DEG = 0.2666
EARTH_RADIUS_DEG = 0.95


def horizon_at(azimuth, profile_el, step):
    """Linear interpolation in a periodic profile sampled every `step`
    degrees starting at azimuth 0."""
    n = len(profile_el)
    pos = (azimuth % 360.0) / step
    i = int(pos) % n
    frac = pos - int(pos)
    return profile_el[i] * (1 - frac) + profile_el[(i + 1) % n] * frac


def disk_fraction(clearance_deg, radius_deg):
    """Visible fraction of a disk whose centre is `clearance` above a
    locally straight horizon."""
    c = clearance_deg / radius_deg
    if c >= 1:
        return 1.0
    if c <= -1:
        return 0.0
    return 1 - (acos(c) - c * sqrt(1 - c * c)) / pi
