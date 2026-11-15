import type { Analysis, Site } from '../api'
import { fmtHours, fmtUtc } from '../lib'

type Entry = { site: Site; data: Analysis; color: string }

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

export default function Windows({ entries }: { entries: Entry[] }) {
  return (
    <div className="windows-grid">
      {entries.map(({ site, data, color }) => {
        const dark = complementWindows(
          data.windows.sun,
          data.start,
          data.days
        )
        const blackout = complementWindows(
          data.windows.earth,
          data.start,
          data.days
        )
        const rows = [
          ...data.windows.earth.map(w => ({
            kind: 'Earth contact',
            start: Date.parse(w.start),
            end: Date.parse(w.end),
          })),
          ...blackout.map(w => ({ kind: 'Comms blackout', ...w })),
          ...dark.map(w => ({ kind: 'Darkness', ...w })),
        ].sort((a, b) => a.start - b.start)

        return (
          <div key={site.id}>
            <h4>
              <span
                className="swatch"
                style={{ background: color }}
                aria-hidden="true"
              />
              {site.name}
            </h4>
            {rows.length === 0 ? (
              <p className="muted">No events in this window.</p>
            ) : (
              <div className="table-scroll windows-scroll">
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
