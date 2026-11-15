"""Readers for the two LOLA elevation products, with georeference checks."""

import re
from dataclasses import dataclass

import numpy as np

from .projection import R_MOON


@dataclass
class Grid:
    """Regular polar-stereographic grid of heights above R_MOON (metres).

    Pixel (i, j) centre is at x = x0 + (j + 0.5) * res,
    y = y0 - (i + 0.5) * res, where (x0, y0) is the upper-left corner.
    """

    name: str
    z: np.ndarray
    x0: float
    y0: float
    res: float
    source: str

    @property
    def extent(self):
        h, w = self.z.shape
        return (self.x0, self.x0 + w * self.res,
                self.y0 - h * self.res, self.y0)

    def sample(self, x, y):
        """Bilinear height at (x, y); NaN outside the grid."""
        h, w = self.z.shape
        fj = (np.asarray(x) - self.x0) / self.res - 0.5
        fi = (self.y0 - np.asarray(y)) / self.res - 0.5
        inside = (fi >= 0) & (fi <= h - 1) & (fj >= 0) & (fj <= w - 1)
        i0 = np.clip(np.floor(fi).astype(np.int64), 0, h - 2)
        j0 = np.clip(np.floor(fj).astype(np.int64), 0, w - 2)
        di = np.clip(fi - i0, 0, 1)
        dj = np.clip(fj - j0, 0, 1)
        z = self.z
        v = (
            z[i0, j0] * (1 - di) * (1 - dj)
            + z[i0, j0 + 1] * (1 - di) * dj
            + z[i0 + 1, j0] * di * (1 - dj)
            + z[i0 + 1, j0 + 1] * di * dj
        )
        return np.where(inside, v, np.nan)


def read_pgda_geotiff(path, name):
    """PGDA 5 m/pix GeoTIFF; refuses files whose georeference differs."""
    import tifffile

    with tifffile.TiffFile(path) as tif:
        page = tif.pages[0]
        tags = page.tags
        keys = tags["GeoKeyDirectoryTag"].value
        geokeys = {
            keys[4 + 4 * k]: keys[4 + 4 * k + 1: 4 + 4 * k + 4]
            for k in range(keys[3])
        }
        doubles = tags["GeoDoubleParamsTag"].value
        scale = tags["ModelPixelScaleTag"].value
        tie = tags["ModelTiepointTag"].value
        z = page.asarray().astype(np.float32)

    def double(key):
        loc, _, idx = geokeys[key]
        assert loc == 34736
        return doubles[idx]

    checks = {
        "raster type PixelIsArea": geokeys[1025][2] == 1,
        "polar stereographic (CT 15)": geokeys[3075][2] == 15,
        "linear unit metre": geokeys[3076][2] == 9001,
        "origin latitude -90": double(3081) == -90.0,
        "straight vertical pole lon 0": double(3095) == 0.0,
        "scale factor 1": double(3092) == 1.0,
        "false easting/northing 0":
            double(3082) == 0.0 and double(3083) == 0.0,
        "sphere radius 1737400 m":
            double(2057) == R_MOON and double(2058) == R_MOON,
        "square pixels": scale[0] == scale[1],
        "tiepoint at raster origin": tie[0] == 0 and tie[1] == 0,
    }
    failed = [k for k, ok in checks.items() if not ok]
    if failed:
        raise ValueError(f"{path}: unexpected georeference: {failed}")
    if not np.isfinite(z).all():
        raise ValueError(f"{path}: contains nodata pixels")
    return Grid(name, z, float(tie[3]), float(tie[4]), float(scale[0]),
                str(path))


def _label(text, key):
    m = re.search(rf"^\s*{key}\s*=\s*\"?([^\"\n<]+)", text, re.M)
    if not m:
        raise ValueError(f"label key {key} missing")
    return m.group(1).strip()


def read_pds_ldem(img_path, lbl_path, name):
    """PDS LOLA LDEM_*S_*M 16-bit IMG with its detached PDS3 label."""
    text = open(lbl_path, encoding="latin-1").read()
    lines = int(_label(text, "LINES"))
    samples = int(_label(text, "LINE_SAMPLES"))
    checks = {
        "LSB 16-bit integer": _label(text, "SAMPLE_TYPE") == "LSB_INTEGER"
        and _label(text, "SAMPLE_BITS") == "16",
        "polar stereographic":
            _label(text, "MAP_PROJECTION_TYPE") == "POLAR STEREOGRAPHIC",
        "south pole centre": float(_label(text, "CENTER_LATITUDE")) == -90,
        "central meridian 0": float(_label(text, "CENTER_LONGITUDE")) == 0,
        "east-positive": _label(text, "POSITIVE_LONGITUDE_DIRECTION")
        == "EAST",
        "radius 1737.4 km": float(_label(text, "A_AXIS_RADIUS")) == 1737.4,
        "offset is reference radius": float(_label(text, "OFFSET"))
        == R_MOON,
        "MOON_ME DE421": "MEAN EARTH/POLAR AXIS OF DE421"
        in _label(text, "COORDINATE_SYSTEM_NAME"),
    }
    failed = [k for k, ok in checks.items() if not ok]
    if failed:
        raise ValueError(f"{lbl_path}: unexpected label: {failed}")

    scale = float(_label(text, "SCALING_FACTOR"))
    res = float(_label(text, "MAP_SCALE"))
    loff = float(_label(text, "LINE_PROJECTION_OFFSET"))
    soff = float(_label(text, "SAMPLE_PROJECTION_OFFSET"))
    dn = np.fromfile(img_path, dtype="<i2").reshape(lines, samples)
    z = dn.astype(np.float32) * scale
    # PDS3 map convention with 1-based line/sample:
    #   x = (sample - SAMPLE_PROJECTION_OFFSET - 1) * MAP_SCALE
    #   y = (1 - line + LINE_PROJECTION_OFFSET) * MAP_SCALE
    # For 0-based (i, j) the pixel centre is x = (j - soff) * res,
    # y = (loff - i) * res, so the upper-left corner is:
    x0 = (-soff - 0.5) * res
    y0 = (loff + 0.5) * res
    return Grid(name, z, x0, y0, res, str(img_path))
