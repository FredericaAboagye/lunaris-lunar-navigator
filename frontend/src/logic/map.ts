/** South-polar stereographic placement and screen-space grouping. */

const R_KM = 1737.4

/** Projected position in km, screen orientation: +x east of 0°, +y down
 *  toward 180° (0° longitude at the top). Same projection as the LOLA
 *  products and the integrated LROC mosaic. */
export function polarKm(lat: number, lon: number) {
  const rad = Math.PI / 180
  const rho = 2 * R_KM * Math.tan(Math.PI / 4 + (lat * rad) / 2)
  return { x: rho * Math.sin(lon * rad), y: -rho * Math.cos(lon * rad) }
}

export type Placed<T> = { item: T; x: number; y: number }

/**
 * Group markers whose on-screen centres are closer than `thresholdPx`.
 * `kmPerPx` converts map distance to screen distance. Positions are never
 * modified; groups are only a presentation of true locations.
 */
export function clusterByScreenDistance<T>(
  points: Placed<T>[],
  kmPerPx: number,
  thresholdPx: number
): Placed<T>[][] {
  const groups: Placed<T>[][] = []
  for (const p of points) {
    const hit = groups.find(g =>
      g.some(q => Math.hypot(p.x - q.x, p.y - q.y) / kmPerPx < thresholdPx)
    )
    if (hit) hit.push(p)
    else groups.push([p])
  }
  // Merge groups that became connected through later points.
  let merged = true
  while (merged) {
    merged = false
    outer: for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const near = groups[a].some(p =>
          groups[b].some(q => Math.hypot(p.x - q.x, p.y - q.y) / kmPerPx < thresholdPx)
        )
        if (near) {
          groups[a].push(...groups[b])
          groups.splice(b, 1)
          merged = true
          break outer
        }
      }
    }
  }
  return groups
}
