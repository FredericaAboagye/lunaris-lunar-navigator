import type { Metrics } from '../api'
import { fmtDeg, fmtHours } from '../lib'
import type { Entry, Mode } from './types'

type Row = {
  label: string
  hint: string
  better: 'high' | 'low' | null
  value: (e: Entry, mode: Mode) => number | null
  format: (v: number) => string
  terrainOnly?: boolean
}

const pct = (v: number) => `${v.toFixed(1)}%`
const metric =
  (key: keyof Metrics) => (e: Entry, mode: Mode) =>
    e.data.metrics[mode][key] ?? null

const ROWS: Row[] = [
  {
    label: 'Sun visible',
    hint: 'Share of time the Sun’s centre is above the horizon',
    better: 'high',
    value: metric('sun_up_pct'),
    format: pct,
  },
  {
    label: 'Mean solar disk visible',
    hint: 'Average fraction of the Sun’s disk above the horizon',
    better: 'high',
    value: metric('mean_sun_disk_pct'),
    format: pct,
  },
  {
    label: 'Longest darkness',
    hint: 'Longest continuous time with the Sun below the horizon',
    better: 'low',
    value: metric('longest_darkness_hours'),
    format: fmtHours,
  },
  {
    label: 'Earth visible',
    hint: 'Share of time Earth’s centre is above the horizon',
    better: 'high',
    value: metric('earth_visible_pct'),
    format: pct,
  },
  {
    label: 'Longest Earth outage',
    hint: 'Longest continuous time with Earth below the horizon',
    better: 'low',
    value: metric('longest_comms_blackout_hours'),
    format: fmtHours,
  },
  {
    label: 'Sun and Earth together',
    hint: 'Both above the horizon at the same time',
    better: 'high',
    value: metric('both_pct'),
    format: pct,
  },
  {
    label: 'Mean solar disk, ignoring ground within 200 m',
    hint: 'Sensitivity to the least certain nearby terrain — not an uncertainty interval',
    better: null,
    value: e => e.data.metrics.terrain_far_field.mean_sun_disk_pct,
    format: pct,
    terrainOnly: true,
  },
  {
    label: 'Ground within 100 m under 10° slope',
    hint: 'Regional screening from 5 m LOLA slope, not lander certification',
    better: 'high',
    value: e => e.site.hazard.within_100m.pct_below_10,
    format: pct,
  },
  {
    label: '95th-percentile slope within 100 m',
    hint: 'Steepest 5 % of 5 m pixels',
    better: 'low',
    value: e => e.site.hazard.within_100m.p95_deg,
    format: v => `${v.toFixed(1)}°`,
  },
  {
    label: 'Peak Sun elevation',
    hint: 'Highest Sun elevation (above local horizontal)',
    better: null,
    value: e => e.data.metrics.geometric.max_sun_elevation_deg ?? null,
    format: v => fmtDeg(v),
  },
]

export default function MetricsTable({
  entries,
  mode,
}: {
  entries: Entry[]
  mode: Mode
}) {
  const rows = ROWS.filter(r => mode === 'terrain' || !r.terrainOnly)
  return (
    <div className="table-scroll">
      <table className="usa-table usa-table--borderless metrics-table">
        <caption className="usa-sr-only">
          Sunlight, Earth visibility and slope by site
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {entries.map(e => (
              <th scope="col" key={e.site.id}>
                <span
                  className="swatch"
                  style={{ background: e.color }}
                  aria-hidden="true"
                />
                {e.site.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const values = entries.map(e => row.value(e, mode))
            const nums = values.filter((v): v is number => v !== null)
            const best =
              row.better === 'high'
                ? Math.max(...nums)
                : row.better === 'low'
                  ? Math.min(...nums)
                  : null
            const distinct = new Set(nums).size > 1
            return (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  <span className="row-hint">{row.hint}</span>
                </th>
                {values.map((v, i) => (
                  <td
                    key={entries[i].site.id}
                    className={
                      distinct && best === v ? 'is-best' : undefined
                    }
                  >
                    {v === null ? '—' : row.format(v)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
