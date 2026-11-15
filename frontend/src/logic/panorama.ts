/**
 * Azimuth windowing for the horizon panorama.
 *
 * The focused view shows `span` degrees of azimuth centred on `center`.
 * Positions are linear in true azimuth (clockwise from north), so a body
 * at azimuth A is drawn at relAz(A, start) / span of the plot width —
 * windowing never shifts or rescales directions non-linearly.
 */

export const CARDINALS = [
  { label: 'N', name: 'north', az: 0 },
  { label: 'E', name: 'east', az: 90 },
  { label: 'S', name: 'south', az: 180 },
  { label: 'W', name: 'west', az: 270 },
] as const

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export const norm = (az: number) => ((az % 360) + 360) % 360

/** Degrees of azimuth that stay readable (≥ ~1.8 px per degree). */
export function viewSpan(plotWidthPx: number): number {
  if (plotWidthPx >= 640) return 360
  const span = Math.round(plotWidthPx / 1.8 / 30) * 30
  return Math.min(360, Math.max(90, span))
}

export function windowStart(center: number, span: number): number {
  return norm(center - span / 2)
}

/** Position of `az` inside a window beginning at `start` (0..360). */
export function relAz(az: number, start: number): number {
  return norm(az - start)
}

export function inView(az: number, center: number, span: number): boolean {
  if (span >= 360) return true
  return relAz(az, windowStart(center, span)) <= span
}

/** Signed shortest rotation from `center` to `az` (−180..180]. */
export function delta(center: number, az: number): number {
  const d = norm(az - center)
  return d > 180 ? d - 360 : d
}

export function compassName(az: number): string {
  return COMPASS[Math.round(norm(az) / 45) % 8]
}

export function rangeLabel(center: number, span: number): string {
  if (span >= 360) return 'Showing all 360°'
  const a = Math.round(windowStart(center, span))
  const b = Math.round(norm(a + span))
  return `Showing ${a}°–${b}°, centred on ${Math.round(norm(center))}° (${compassName(center)})`
}
