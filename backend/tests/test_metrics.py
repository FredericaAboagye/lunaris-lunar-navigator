import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import metrics  # noqa: E402
from horizons import HorizonsError, parse_row  # noqa: E402


def test_intervals_interpolate_crossings():
    # Crosses zero halfway between samples 0->1 and 2->3.
    assert metrics.visible_intervals([-1, 1, 1, -1], 1.0) == [(0.5, 2.5)]


def test_always_up_and_never_up():
    assert metrics.visible_intervals([2, 3, 4], 2.0) == [(0.0, 4.0)]
    assert metrics.visible_intervals([-2, -3, -4], 2.0) == []


def test_intersect_and_complement():
    a = [(0, 4), (6, 10)]
    b = [(2, 7)]
    assert metrics.intersect(a, b) == [(2, 4), (6, 7)]
    assert metrics.complement(a, 12) == [(4, 6), (10, 12)]


def test_compute_sine_wave():
    n = 24 * 4 + 1
    step = 1.0
    sun = [10 * math.sin(2 * math.pi * i / 24) for i in range(n)]
    earth = [5] * n
    summary, windows = metrics.compute(sun, earth, step)
    assert abs(summary["sun_up_pct"] - 50) < 3
    assert summary["earth_visible_pct"] == 100.0
    assert summary["both_pct"] == summary["sun_up_pct"]
    assert abs(summary["longest_darkness_hours"] - 12) < 1.5
    assert summary["sun_windows"] == 4


def test_parse_row_ok_and_bad():
    row = ["2026-Nov-14 00:00", "*", " ", " 356.837314", " 1.656453", " "]
    stamp, az, el = parse_row(row)
    assert stamp.year == 2026 and az == 356.837314 and el == 1.656453
    for bad in (["x"], ["2026-Nov-14 00:00", "", "", "400", "1"],
                ["2026-Nov-14 00:00", "", "", "10", "95"]):
        try:
            parse_row(bad)
        except HorizonsError:
            continue
        raise AssertionError("expected HorizonsError")
