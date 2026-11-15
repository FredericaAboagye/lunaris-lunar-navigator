import type { Metrics } from '../api'
import { fmtDeg, fmtHours } from '../lib'
import { rank } from '../logic/compare'
import { EARTH_CAVEAT, SUN_CAVEAT } from '../logic/copy'
import type { Entry, Mode } from './types'

type Row = {
  label: string
  hint: string
  better: 'high' | 'low' | null
  value: (e: Entry, mode: Mode) => number | null
  format: (v: number) => string
  terrainOnly?: boolean
}

type Group = { title: string; caveat: string; rows: Row[] }

const pct = (v: number) => `${v.toFixed(1)}%`
const metric =
  (key: keyof Metrics) => (e: Entry, mode: Mode) =>
    e.data.metrics[mode][key] ?? null

const GROUPS: Group[] = [
  {
    title: 'Sunlight',
    caveat: SUN_CAVEAT,
    rows: [
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
        label: 'Mean solar disk, ignoring ground within 200 m',
        hint: 'Nearby-terrain sensitivity — a what-if, not an uncertainty interval',
        better: null,
        value: e => e.data.metrics.terrain_far_field.mean_sun_disk_pct,
        format: pct,
        terrainOnly: true,
      },
      {
        label: 'Longest darkness',
        hint: 'Longest continuous time with the Sun below the horizon',
        better: 'low',
        value: metric('longest_darkness_hours'),
        format: fmtHours,
      },
      {
        label: 'Highest Sun elevation above the reference horizontal (0°)',
        hint: 'Geometry only, identical in both horizon models — not clearance above terrain',
        better: null,
        value: e => e.data.metrics.geometric.max_sun_elevation_deg ?? null,
        format: v => fmtDeg(v),
      },
    ],
  },
  {
    title: 'Earth contact',
    caveat: EARTH_CAVEAT,
    rows: [
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
    ],
  },
  {
    title: 'Sun and Earth together',
    caveat: 'Both centres above the horizon at the same time.',
    rows: [
      {
        label: 'Sun and Earth together',
        hint: 'Share of time both are visible',
        better: 'high',
        value: metric('both_pct'),
        format: pct,
      },
    ],
  },
]

export default function MetricsTable({
  entries,
  mode,
}: {
  entries: Entry[]
  mode: Mode
}) {
  const cols = entries.length + 1
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Site comparison table"
      tabIndex={0}
    >
      <table className="usa-table usa-table--borderless metrics-table">
        <caption className="usa-sr-only">
          Sunlight and Earth visibility by site. Values marked best share
          the best displayed value; equal values are ties.
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
        {GROUPS.map(group => (
          <tbody key={group.title}>
            <tr className="group-row">
              <th scope="colgroup" colSpan={cols}>
                <span className="group-row__title">{group.title}</span>
                <span className="group-row__caveat">{group.caveat}</span>
              </th>
            </tr>
            {group.rows
              .filter(r => mode === 'terrain' || !r.terrainOnly)
              .map(row => {
                const r =
                  row.better && entries.length > 1
                    ? rank(
                        entries,
                        e => row.value(e, mode) ?? NaN,
                        row.format,
                        row.better
                      )
                    : null
                return (
                  <tr key={row.label}>
                    <th scope="row">
                      {row.label}
                      <span className="row-hint">{row.hint}</span>
                    </th>
                    {entries.map(e => {
                      const v = row.value(e, mode)
                      const best = r && !r.allTied && r.winners.includes(e)
                      return (
                        <td
                          key={e.site.id}
                          className={best ? 'is-best' : undefined}
                        >
                          {v === null ? '—' : row.format(v)}
                          {best && (
                            <span className="usa-sr-only">
                              {r.tie ? ' (joint best)' : ' (best)'}
                            </span>
                          )}
                          {r?.allTied && (
                            <span className="tie-tag"> tie</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
          </tbody>
        ))}
      </table>
    </div>
  )
}
