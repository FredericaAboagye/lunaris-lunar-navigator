# Evidence audit — `feature/validated-terrain`

Scope: correctness and demo readiness. Every number below was produced by
a script in this repository (commands at the end). "Pass" means a
tolerance fixed before the result was seen; "Qualitative" means a visual
comparison with a published figure that was not digitised.

## 1. Published benchmarks

Source: Barker, M.K. et al. (2021), *Improved LOLA elevation maps for south
pole landing sites: Error estimates and their impact on illumination
conditions*, PSS 203:105119. Page numbers refer to the accepted manuscript
on NASA NTRS (ID 20205009660).

What the paper publishes for these points:

- **Definition** (p. 4, Sec. 2; Fig. 3 caption p. 3): "average illumination
  (visible fraction of the Sun's disk)". Frame MOON_ME DE421.
- **RoI criterion** (p. 13, Sec. 5): connected 5 m pixels with average
  illumination **> 70 % at Δz = 1 m**, 2024-01-01 to 2026-01-01, area
  > 2500 m². The PGDA RoI archive name (`..._regionProps_avgillGT070.gmt`)
  encodes the same threshold.
- **Points**: the PGDA shapefile records are the RoI centroids. For Site 1,
  record 1 = Table 2 (p. 8) RoI 1, X = −11.5825 km, Y = −12.4625 km. This is
  an exact match.
- **Table 2** (Site 1 only) lists the *1st percentile over 100 DEM clones of
  the RoI-averaged* illumination (RoI 1: 68.03 %). This is a different
  quantity from a nominal value at a single point, so we do not compare
  against it.

| Site (PGDA) | Point (lat, lon E) | Dates | Height | Definition | Published | Ours | Difference |
|---|---|---|---|---|---|---|---|
| Connecting Ridge (Site01, RoI 1) | −89.43893, 222.90402 | 2024-01-01 → 2026-01-01 | 1 m | mean visible solar-disk fraction | RoI pixels > 70 % (threshold) | 80.7 % | +10.7 pp above threshold |
| Shackleton Rim (Site04, RoI 1) | −89.76197, 202.93280 | same | 1 m | same | > 70 % (threshold) | 70.3 % | +0.3 pp — **marginal** |
| Peak near Shackleton (Site07, RoI 1) | −88.80636, 123.54629 | same | 1 m | same | > 70 % (threshold) | 74.2 % | +4.2 pp |
| de Gerlache Rim (Site11, RoI 1) | −88.66826, 291.62424 | same | 1 m | same | > 70 % (threshold) | 81.1 % | +11.1 pp |

**Claim we can make:** at all four documented points, our value is
consistent with the published threshold.

**Claim we cannot make:** that our percentages are independently validated
values. The paper gives no point values. Site04's margin (0.3 pp) is
smaller than our own nearby-terrain sensitivity at 1 m (10.1 pp, §4). The
build's acceptance level (≥ 0.65) is looser than the published threshold.
It is a tolerance for method differences, not a claim of agreement.

The two-year means are step-converged: they are identical to 4 decimals
at 120, 60 and 30 min.

**Horizon shape, qualitative** (`img/horizon_vs_barker_fig15.png`; Fig. 15,
p. 10, Site 1 RoIs 1, 4, 7 at 1 m):

- The figure's azimuth convention is not stated. We infer
  θ = 90° − γ − A (γ = grid bearing of true north ≈ 222°).
- The inference is fixed by the Sun, not by terrain. Our Horizons-derived
  18.6-year solar band peaks at θ = 227.5°, as the published orange band
  does, because the Sun is highest due north on a sphere.
- Under that same convention, the distinctive terrain features line up
  within about 5–10°:

  | RoI | Feature | Published | Ours |
  |---|---|---|---|
  | 7 | +1.8° peak | ≈205° | ≈200° |
  | 1 | +0.6° narrow peak | ≈310° | 315° |
  | 1 | −0.3° bump | ≈40° | 45° |
  | 4 | broad ~0° hump | 200–240° | 200–240° |

- A mirrored or rotated terrain azimuth would place these features on the
  other side of the solar band.

**Maps** (`img/site_points_overlay.png`):

- Our 2×2 km close-ups reproduce the RoI contour shapes of Fig. 3 (p. 3).
- Every point lies inside the published axis ranges of that figure.
- The USGS gazetteer rim of Shackleton (89.67°S 129.78°E, D 20.92 km,
  Feature 5450) sits on the crater rim in the LOLA hillshade.

## 2. Conventions

| Item | Rasters (PGDA GeoTIFF, PDS LDEM_80S_80M) | Ephemeris (Horizons) | Evidence | Type |
|---|---|---|---|---|
| Body frame | MOON_ME DE421 (PGDA README; PDS label `COORDINATE_SYSTEM_NAME`) | MOON_ME DE421 for lunar sites (Horizons manual) | Documents | External |
| Longitude | East-positive, central meridian 0 (GeoKeys; label) | East-positive | Documents; Shackleton found at gazetteer position | External |
| Projection | South polar stereographic, sphere R = 1 737 400 m, k0 = 1 | — | Our formula vs PROJ: ≤ 1×10⁻¹¹ m; round trip exact | Numerical |
| Pixel registration | GeoTIFF PixelIsArea corner tiepoint; PDS 1-based offsets | — | 5 m vs 80 m agreement: median 0.19–0.24 m, p95 2.0–3.9 m (1-pixel shift → 48 m; flip → 3 km) | Numerical cross-product |
| Elevation reference | Height above the 1 737 400 m sphere | Elevation from the plane ⟂ local zenith (spherical Moon) | Same radial zenith in both | Documents |
| Observer height | Ground + 1/2/10 m in the horizon ray tracing | Site altitude 0 | Horizons at altitude 0 vs 1.739 km: ≤ 0.01″ Sun, 0.88″ Earth | External (Horizons) |
| Time scale | — | `TIME_TYPE=UT` (UTC) | Horizons vs Skyfield fed UTC: ≤ 1.8″ at all 4 sites. A 69 s TT/UT mix-up would show as about 35″ | External |
| Azimuth | Great-circle bearing, clockwise from true north, so grid convergence is handled | Clockwise from north (manual) | Synthetic tests (pole due south from any longitude); Sun-phase + Fig. 15 alignment | Numerical + qualitative external |
| Nodata | None in PGDA tiles (checked); none in the PDS file (no −32768) | — | Reader rejects non-finite tiles; coverage enforced (below) | Numerical |

**Independence caveats:**

- Horizons (DE440/441) and Skyfield (DE421 + NAIF lunar PCK) are separate
  code bases, but both rest on JPL DE ephemerides.
- The RoI polygons and the 5 m DEM come from the same team.

## 3. Why sunlight changes from 52 % to 70 % (Shackleton Rim)

Settings, identical for every model:

- Point: Site04 RoI 1 centroid
- Dates: 2024-01-01 to 2026-01-01
- Step: 2 h (8 772 samples)
- Observer: 1 m
- Metrics: mean visible disk fraction and centre-visible fraction

Command: `python -m terrain.explain_sunlight SITE 1`

| Model | Site04 | Site01 | Site07 | Site11 |
|---|---|---|---|---|
| A. Smooth sphere, horizon 0° | 52.1 % | 51.4 % | 51.7 % | 51.6 % |
| B. Smooth sphere seen from the site's true radius (geometric dip) | 100.0 % (dip −2.56°) | 100.0 % (−2.72°) | 97.1 % (−2.50°) | 97.1 % (−2.62°) |
| C. LOLA terrain | **70.3 %** | 80.7 % | 74.2 % | 81.1 % |
| A→B: seeing below the reference horizon | +47.9 pp | +48.6 pp | +45.4 pp | +45.5 pp |
| B→C: terrain obstruction | −29.7 pp | −19.3 pp | −22.9 pp | −15.9 pp |
| B→C: terrain lower than the dip | 0.0 pp | 0.0 pp | 0.0 pp | 0.0 pp |

The A→C change (+18.2 pp at Site04) is the net of a large gain and a large
loss. Rims sit 1.6–2.0 km above the reference sphere, so the Sun is above
the smooth-sphere dip almost all the time, and real terrain then blocks a
third to a fifth of that.

**Missing terrain is never treated as clear sky.** The audit found the
coverage flag was recorded but not enforced, and it read *incomplete* for
every site because of a floating-point end sample (249 998.75 m). Fixed:

- ray sampling now always ends exactly at 250 km
- full coverage is now a required validation condition
- a test confirms truncated terrain is reported

All four sites now verify complete coverage to 250 km.

## 4. Visibility and uncertainty

- **Disk fraction uses area.** The circular-segment formula is checked
  against a 200 000-point Monte Carlo disk (±0.005), and the test also
  confirms it differs from a diameter-based fraction.
- **Time step** (`python -m terrain.check_timestep`; tolerance ≤ 0.5 pp,
  ≤ 2 h vs a 10-min reference; 4 sites × 3 heights; two 30-day windows):

  | Step | Worst % difference | Worst longest-stretch difference | Result |
  |---|---|---|---|
  | 30 min | 0.10 pp | 0.10 h | Pass |
  | 60 min (app default) | 0.20 pp | 0.30 h | Pass |
  | 120 min | — | 80.4 h | **Fail** |

  At 120 min short events are missed and stretches merge, so 120 min is
  removed from the API.
- **Nearby-ground sensitivity.** We recompute with terrain within 200 m
  ignored, using the same dates and settings as §1 (mean disk, 2024–25):

  | Site | 1 m | 2 m | 10 m |
  |---|---|---|---|
  | Site04 | 70.3 → 80.4 % (**+10.1 pp**) | +0.7 pp | 0.0 pp |
  | Site01 | +4.3 pp | +2.5 pp | 0.0 pp |
  | Site07 | +4.6 pp | +2.8 pp | 0.0 pp |
  | Site11 | +1.0 pp | +0.1 pp | 0.0 pp |

  This is a deterministic what-if sensitivity, **not** a statistical
  uncertainty interval. A real interval would need the PGDA 100-clone
  ensemble, as Barker et al. Table 2 does, which we have not run. The
  sensitivity now appears beside the headline sunlight KPI and as a
  table row.
- **Search distance.** Agreement between 250 km and 300 km shows the result
  no longer depends on search distance. It does not establish overall
  physical accuracy. This is stated in the UI and the API definitions.

## 5. End to end

`scripts/e2e_check.py` (real Horizons, local servers) checks:

- **API vs data** for 12 site×height pairs: terrain horizon at each sample
  matches the asset; Sun-up matches a sample count within 1 pp; mean disk
  is recomputed exactly.
- **UI vs API** for 24 table checks: 2 models × 3 heights × 2 page loads,
  6 metrics per site.
- **Time zones:** the page renders identically with `TZ=UTC`, `Asia/Tokyo`
  and `America/Los_Angeles`. Chrome honours TZ (offsets 0, −540, 480).
- **Banners:** the smooth-sphere warning and the sensitivity caveat appear.

Result: 0 failures.

Also verified:

| Check | Result |
|---|---|
| Invalid inputs (days 0/61, malformed or out-of-range start, height 7, step 120, oversize site id) | Rejected with 4xx (tests) |
| Date boundaries 2000-01-01 and 2049-12-01 + 30 d | Accepted |
| Unsupported site | 404 with the reason |
| Loading state | Shown |
| Backend down | "Cannot reach the Lunaris data service" |
| **New frontend + old v1 backend** | Clear "needs API v2 — deploy the backend first" message (tested against the deployed commit `d8b411e`) |
| **Old deployed frontend + new backend** | Works through the deprecated `/api/timeline` v1 shim (13 rows, same shape) |

## Not verified

- Numerical agreement with any published point value (none exists for
  these points).
- Statistical uncertainty from DEM error (clones not run).
- Horizon accuracy beyond the qualitative Fig. 15 comparison (no
  digitised published horizon).
- Real-browser interaction (clicks and drags). Checks used URL state and
  headless rendering.
