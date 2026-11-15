import { fmtHours } from '../lib'
import type { Entry, Mode } from './types'

export default function Summary({
  entries,
  mode,
}: {
  entries: Entry[]
  mode: Mode
}) {
  if (entries.length === 0) return null
  const m = (e: Entry) => e.data.metrics[mode]
  const best = [...entries].sort((a, b) => m(b).both_pct - m(a).both_pct)[0]
  const sunniest = [...entries].sort(
    (a, b) => m(b).mean_sun_disk_pct - m(a).mean_sun_disk_pct
  )[0]
  const shortestDark = [...entries].sort(
    (a, b) => m(a).longest_darkness_hours - m(b).longest_darkness_hours
  )[0]

  const card = (
    label: string,
    value: string,
    e: Entry,
    note: string
  ) => (
    <div className="kpi" role="listitem">
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value">{value}</strong>
      <span className="kpi__sub">
        <i
          className="swatch"
          style={{ background: e.color }}
          aria-hidden="true"
        />
        {e.site.name} · {note}
      </span>
    </div>
  )

  return (
    <div className="kpis" role="list">
      {card(
        'Most sunlight',
        `${m(sunniest).mean_sun_disk_pct.toFixed(1)}%`,
        sunniest,
        'mean solar disk visible'
      )}
      {card(
        'Shortest darkness',
        fmtHours(m(shortestDark).longest_darkness_hours),
        shortestDark,
        'longest Sun-below-horizon stretch'
      )}
      {card(
        'Best Sun + Earth overlap',
        `${m(best).both_pct.toFixed(1)}%`,
        best,
        'both above the horizon'
      )}
    </div>
  )
}
