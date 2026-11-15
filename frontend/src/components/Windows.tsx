import { fmtHours, fmtUtc } from '../lib'
import type { Entry, Mode } from './types'

function complementWindows(
  windows: { start: string; end: string }[],
  startIso: string,
  days: number
) {
  const t0 = Date.parse(startIso)
  const t1 = t0 + days * 864e5
  const gaps: { start: number; end: number }[] = []
  let cursor = t0
  for (const w of windows) {
    const s = Date.parse(w.start)
    if (s > cursor) gaps.push({ start: cursor, end: s })
    cursor = Date.parse(w.end)
  }
  if (cursor < t1) gaps.push({ start: cursor, end: t1 })
  return gaps
}

export default function Windows({
  entries,
  mode,
}: {
  entries: Entry[]
  mode: Mode
}) {
  return (
    <div className="windows-grid">
      {entries.map(({ site, data, color }) => {
        const w = data.windows[mode]
        const dark = complementWindows(
          w.sun,
          data.start,
          data.days
        )
        const blackout = complementWindows(
          w.earth,
          data.start,
          data.days
        )
        const rows = [
          ...w.earth.map(x => ({
            kind: 'Earth visible',
            start: Date.parse(x.start),
            end: Date.parse(x.end),
          })),
          ...blackout.map(x => ({ kind: 'Earth outage', ...x })),
          ...dark.map(x => ({ kind: 'Darkness', ...x })),
        ].sort((a, b) => a.start - b.start)

        return (
          <div key={site.id}>
            <h3>
              <span
                className="swatch"
                style={{ background: color }}
                aria-hidden="true"
              />
              {site.name}
            </h3>
            {rows.length === 0 ? (
              <p className="muted">No events in this window.</p>
            ) : (
              <div
                className="table-scroll windows-scroll"
                role="region"
                aria-label={`Exact window times for ${site.name}`}
                tabIndex={0}
              >
                <table className="usa-table usa-table--borderless">
                  <thead>
                    <tr>
                      <th scope="col">Event</th>
                      <th scope="col">Start (UTC)</th>
                      <th scope="col">End (UTC)</th>
                      <th scope="col">Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.kind}</td>
                        <td>{fmtUtc(new Date(r.start).toISOString())}</td>
                        <td>{fmtUtc(new Date(r.end).toISOString())}</td>
                        <td>{fmtHours((r.end - r.start) / 36e5)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
