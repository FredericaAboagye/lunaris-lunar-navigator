import type { Analysis, Metrics, Site } from '../api'
import { fmtDeg, fmtHours } from '../lib'

type Entry = { site: Site; data: Analysis; color: string }

type Row = {
  key: keyof Metrics
  label: string
  hint: string
  better: 'high' | 'low' | null
  format: (v: number) => string
}

const pct = (v: number) => `${v.toFixed(1)}%`

const ROWS: Row[] = [
  {
    key: 'sun_up_pct',
    label: 'Sun above horizon',
    hint: 'Share of the window with direct sunlight (power)',
    better: 'high',
    format: pct,
  },
  {
    key: 'earth_visible_pct',
    label: 'Earth above horizon',
    hint: 'Share of the window with direct-to-Earth line of sight',
    better: 'high',
    format: pct,
  },
  {
    key: 'both_pct',
    label: 'Sun and Earth together',
    hint: 'Power and direct link available simultaneously',
    better: 'high',
    format: pct,
  },
  {
    key: 'longest_darkness_hours',
    label: 'Longest darkness',
    hint: 'Longest continuous time without sunlight',
    better: 'low',
    format: fmtHours,
  },
  {
    key: 'longest_sunlit_hours',
    label: 'Longest sunlit period',
    hint: 'Longest continuous time with sunlight',
    better: 'high',
    format: fmtHours,
  },
  {
    key: 'longest_comms_blackout_hours',
    label: 'Longest comms blackout',
    hint: 'Longest continuous time without Earth in view',
    better: 'low',
    format: fmtHours,
  },
  {
    key: 'longest_earth_visible_hours',
    label: 'Longest Earth contact',
    hint: 'Longest continuous time with Earth in view',
    better: 'high',
    format: fmtHours,
  },
  {
    key: 'earth_windows',
    label: 'Earth contact windows',
    hint: 'Number of separate Earth-visible intervals',
    better: null,
    format: v => String(v),
  },
  {
    key: 'max_sun_elevation_deg',
    label: 'Peak Sun elevation',
    hint: 'Highest Sun elevation in the window',
    better: null,
    format: v => fmtDeg(v),
  },
  {
    key: 'max_earth_elevation_deg',
    label: 'Peak Earth elevation',
    hint: 'Highest Earth elevation in the window',
    better: null,
    format: v => fmtDeg(v),
  },
]

export default function MetricsTable({ entries }: { entries: Entry[] }) {
  return (
    <div className="table-scroll">
      <table className="usa-table usa-table--borderless metrics-table">
        <caption className="usa-sr-only">
          Illumination and communication metrics by site
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
          {ROWS.map(row => {
            const values = entries.map(e => e.data.metrics[row.key])
            const best =
              row.better === 'high'
                ? Math.max(...values)
                : row.better === 'low'
                  ? Math.min(...values)
                  : null
            const distinct = new Set(values).size > 1
            return (
              <tr key={row.key}>
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
                    {row.format(v)}
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
