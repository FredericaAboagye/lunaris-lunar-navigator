"""Illumination / communication metrics from elevation time series.

All functions are pure. Times are expressed in hours from the series
start. Edges of visibility intervals are found by linear interpolation
between samples, so results are not limited to whole-sample resolution.
"""


def visible_intervals(elevations, step_hours):
    """Return [(start_h, end_h)] where elevation > 0 (geometric horizon)."""
    intervals = []
    start = None
    n = len(elevations)
    for i, el in enumerate(elevations):
        up = el > 0
        if up and start is None:
            if i == 0:
                start = 0.0
            else:
                prev = elevations[i - 1]
                frac = (0 - prev) / (el - prev)
                start = (i - 1 + frac) * step_hours
        elif not up and start is not None:
            prev = elevations[i - 1]
            frac = prev / (prev - el)
            intervals.append((start, (i - 1 + frac) * step_hours))
            start = None
    if start is not None:
        intervals.append((start, (n - 1) * step_hours))
    return intervals


def complement(intervals, total_hours):
    gaps, cursor = [], 0.0
    for s, e in intervals:
        if s > cursor:
            gaps.append((cursor, s))
        cursor = e
    if cursor < total_hours:
        gaps.append((cursor, total_hours))
    return gaps


def intersect(a, b):
    out, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        s = max(a[i][0], b[j][0])
        e = min(a[i][1], b[j][1])
        if e > s:
            out.append((s, e))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


def total(intervals):
    return sum(e - s for s, e in intervals)


def longest(intervals):
    return max((e - s for s, e in intervals), default=0.0)


def compute(sun_el, earth_el, step_hours):
    """Summarise power (Sun) and communication (Earth) availability."""
    if len(sun_el) != len(earth_el) or len(sun_el) < 2:
        raise ValueError("Series must be equal length with >= 2 samples")

    span = (len(sun_el) - 1) * step_hours
    sun = visible_intervals(sun_el, step_hours)
    earth = visible_intervals(earth_el, step_hours)
    both = intersect(sun, earth)
    sun_dark = complement(sun, span)
    earth_dark = complement(earth, span)

    def pct(value):
        return round(100 * value / span, 1)

    return {
        "span_hours": round(span, 2),
        "sun_up_pct": pct(total(sun)),
        "earth_visible_pct": pct(total(earth)),
        "both_pct": pct(total(both)),
        "longest_sunlit_hours": round(longest(sun), 1),
        "longest_darkness_hours": round(longest(sun_dark), 1),
        "longest_earth_visible_hours": round(longest(earth), 1),
        "longest_comms_blackout_hours": round(longest(earth_dark), 1),
        "sun_windows": len(sun),
        "earth_windows": len(earth),
        "max_sun_elevation_deg": round(max(sun_el), 2),
        "max_earth_elevation_deg": round(max(earth_el), 2),
    }, {"sun": sun, "earth": earth, "both": both}
