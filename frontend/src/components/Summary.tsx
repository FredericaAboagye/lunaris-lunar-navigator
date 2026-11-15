import type { Analysis, Site } from '../api'
import { fmtHours } from '../lib'

type Entry = { site: Site; data: Analysis; color: string }

export default function Summary({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return null
  const best = [...entries].sort(
    (a, b) => b.data.metrics.both_pct - a.data.metrics.both_pct
  )[0]
  const m = best.data.metrics
  const longestDark = [...entries].sort(
    (a, b) =>
      a.data.metrics.longest_darkness_hours -
      b.data.metrics.longest_darkness_hours
  )[0]

  return (
    <div className="kpis" role="list">
      <div className="kpi" role="listitem">
        <span className="kpi__label">Best joint availability</span>
        <strong className="kpi__value">{m.both_pct.toFixed(1)}%</strong>
        <span className="kpi__sub">
          <i
            className="swatch"
            style={{ background: best.color }}
            aria-hidden="true"
          />
          {best.site.name} · Sun and Earth both above the horizon
        </span>
      </div>
      <div className="kpi" role="listitem">
        <span className="kpi__label">Shortest power outage</span>
        <strong className="kpi__value">
          {fmtHours(longestDark.data.metrics.longest_darkness_hours)}
        </strong>
        <span className="kpi__sub">
          <i
            className="swatch"
            style={{ background: longestDark.color }}
            aria-hidden="true"
          />
          {longestDark.site.name} · longest continuous darkness
        </span>
      </div>
      <div className="kpi" role="listitem">
        <span className="kpi__label">Sites compared</span>
        <strong className="kpi__value">{entries.length}</strong>
        <span className="kpi__sub">
          {entries[0].data.days}-day window from{' '}
          {entries[0].data.start.slice(0, 10)}
        </span>
      </div>
    </div>
  )
}
