"""South polar stereographic projection on the lunar reference sphere.

Matches both source products used here:
  * PGDA LOLA 5 m/pix GeoTIFFs (GeoKey ProjCoordTrans=15, lat0=-90,
    lon0=0, k0=1, FE=FN=0, sphere 1 737 400 m), and
  * PDS LOLA LDEM_80S_80M (POLAR STEREOGRAPHIC, CENTER_LATITUDE -90,
    CENTER_LONGITUDE 0, A_AXIS_RADIUS 1737.4 km).
Both are in the MOON_ME (DE421) body-fixed frame with east-positive
longitude, the frame NASA Horizons uses for lunar observer sites.

South-polar aspect (Snyder 1987, eq. 21-33/21-34 with k0 = 1):
  rho = 2 R tan(pi/4 + lat/2);  x = rho sin(lon);  y = rho cos(lon)
"""

import numpy as np

R_MOON = 1_737_400.0  # metres, reference sphere of both DEMs


def latlon_to_xy(lat_deg, lon_deg):
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    rho = 2 * R_MOON * np.tan(np.pi / 4 + lat / 2)
    return rho * np.sin(lon), rho * np.cos(lon)


def xy_to_latlon(x, y):
    rho = np.hypot(x, y)
    lat = -90.0 + 2 * np.degrees(np.arctan(rho / (2 * R_MOON)))
    lon = np.degrees(np.arctan2(x, y)) % 360.0
    return lat, lon


def destination(lat_deg, lon_deg, azimuth_deg, distance_m):
    """Great-circle destination on the sphere (azimuth clockwise from N)."""
    lat1 = np.radians(lat_deg)
    lon1 = np.radians(lon_deg)
    az = np.radians(azimuth_deg)
    d = np.asarray(distance_m) / R_MOON
    lat2 = np.arcsin(
        np.sin(lat1) * np.cos(d) + np.cos(lat1) * np.sin(d) * np.cos(az)
    )
    lon2 = lon1 + np.arctan2(
        np.sin(az) * np.sin(d) * np.cos(lat1),
        np.cos(d) - np.sin(lat1) * np.sin(lat2),
    )
    return np.degrees(lat2), np.degrees(lon2) % 360.0


def initial_bearing(lat1_deg, lon1_deg, lat2_deg, lon2_deg):
    """True azimuth (deg, clockwise from north) from point 1 to point 2."""
    lat1, lat2 = np.radians(lat1_deg), np.radians(lat2_deg)
    dlon = np.radians(lon2_deg - lon1_deg)
    y = np.sin(dlon) * np.cos(lat2)
    x = np.cos(lat1) * np.sin(lat2) - np.sin(lat1) * np.cos(lat2) * np.cos(dlon)
    return np.degrees(np.arctan2(y, x)) % 360.0
