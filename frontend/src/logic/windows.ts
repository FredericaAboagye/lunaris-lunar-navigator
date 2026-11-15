/** Consecutive comparison windows (UTC dates, YYYY-MM-DD). */

export const WINDOWS = 4
// Last start the API accepts is 2049-12-31 minus the window length.
const LAST_DAY = Date.UTC(2049, 11, 31)

export function windowStarts(start: string, days: number, n = WINDOWS) {
  const t0 = Date.parse(`${start}T00:00:00Z`)
  const out: string[] = []
  for (let k = 0; k < n; k++) {
    const t = t0 + k * days * 864e5
    if (t + days * 864e5 > LAST_DAY) break
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}
