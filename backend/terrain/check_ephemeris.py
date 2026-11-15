"""Cross-check NASA Horizons Sun/Earth az/el against Skyfield + NAIF SPICE.

Skyfield is an independent implementation (different code base). It uses
JPL DE421 and the NAIF lunar frame kernels (MOON_ME_DE421), whereas
Horizons uses DE440/441 with the same DE421 mean-Earth site frame, so
the underlying ephemeris lineage (JPL DE series) is shared.

Usage: python -m terrain.check_ephemeris LAT LON [CACHE_DIR]
"""

import sys
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, ".")
from horizons import fetch_series  # noqa: E402

TIMES = ["2026-11-14", "2027-03-01", "2027-07-20"]


def skyfield_altaz(lat, lon, stamps, cache):
    from skyfield.api import Loader, PlanetaryConstants

    load = Loader(cache)
    ts = load.timescale()
    eph = load("de421.bsp")
    pc = PlanetaryConstants()
    pc.read_text(load("moon_080317.tf"))
    pc.read_text(load("pck00008.tpc"))
    pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
    frame = pc.build_frame_named("MOON_ME_DE421")
    place = eph["moon"] + pc.build_latlon_degrees(frame, lat, lon)
    t = ts.from_datetimes(stamps)
    out = {}
    for name, body in (("sun", eph["sun"]), ("earth", eph["earth"])):
        alt, az, _ = place.at(t).observe(body).apparent().altaz()
        out[name] = (az.degrees, alt.degrees)
    return out


def main():
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    cache = sys.argv[3] if len(sys.argv) > 3 else "terrain/.cache"
    rows = []
    for day in TIMES:
        stamps = None
        h = {}
        for body in ("sun", "earth"):
            times, az, el = fetch_series(body, round(lat, 6),
                                         round(lon, 6), day, 1, 360)
            h[body] = (np.array(az), np.array(el))
            stamps = times
        s = skyfield_altaz(lat, lon, stamps, cache)
        for body in ("sun", "earth"):
            daz = (h[body][0] - s[body][0] + 180) % 360 - 180
            del_ = h[body][1] - s[body][1]
            for i, t in enumerate(stamps):
                rows.append((t, body, h[body][0][i], h[body][1][i],
                             daz[i], del_[i]))
    print(f"site lat={lat:.6f} lon={lon:.6f}")
    print("time_utc            body   H_az      H_el     dAz(H-S)  dEl(H-S)")
    for t, b, az, el, daz, de in rows:
        print(f"{t:%Y-%m-%d %H:%M}  {b:5s} {az:9.4f} {el:8.4f}"
              f" {daz*3600:8.1f}\" {de*3600:8.1f}\"")
    daz = np.array([r[4] for r in rows]) * 3600
    de = np.array([r[5] for r in rows]) * 3600
    print(f"max |dAz| = {np.abs(daz).max():.1f} arcsec,"
          f" max |dEl| = {np.abs(de).max():.1f} arcsec over {len(rows)}"
          " samples")


if __name__ == "__main__":
    main()
