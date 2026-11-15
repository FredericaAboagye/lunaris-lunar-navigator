import { useEffect, useRef, useState } from 'react'
import type { Metrics } from '../api'
import { fmtDeg, fmtHours } from '../lib'
import { rank } from '../logic/compare'
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
    caveat: 'Visibility, not electrical power',
    rows: [
      {
        label: 'Sun visible (centre)',
        hint: 'Share of time the Sun’s centre is up',
        better: 'high',
        value: metric('sun_up_pct'),
        format: pct,
      },
      {
        label: 'Mean solar disk',
        hint: 'Average visible fraction of the disk',
        better: 'high',
        value: metric('mean_sun_disk_pct'),
        format: pct,
      },
      {
        label: 'Disk, ignoring ground < 200 m',
        hint: 'Sensitivity what-if, not an error bar',
        better: null,
        value: e => e.data.metrics.terrain_far_field.mean_sun_disk_pct,
        format: pct,
        terrainOnly: true,
      },
      {
        label: 'Longest darkness',
        hint: 'Longest stretch with the Sun down',
        better: 'low',
        value: metric('longest_darkness_hours'),
        format: fmtHours,
      },
      {
        label: 'Peak Sun elevation',
        hint: 'Relative to 0°, not terrain clearance',
        better: null,
        value: e => e.data.metrics.geometric.max_sun_elevation_deg ?? null,
        format: v => fmtDeg(v),
      },
    ],
  },
  {
    title: 'Earth contact',
    caveat: 'Line of sight, not a guaranteed radio link',
    rows: [
      {
        label: 'Earth visible',
        hint: 'Share of time Earth’s centre is up',
        better: 'high',
        value: metric('earth_visible_pct'),
        format: pct,
      },
      {
        label: 'Longest Earth outage',
        hint: 'Longest stretch with Earth down',
        better: 'low',
        value: metric('longest_comms_blackout_hours'),
        format: fmtHours,
      },
    ],
  },
  {
    title: 'Sun and Earth together',
    caveat: 'Both centres up at once',
    rows: [
      {
        label: 'Sun + Earth together',
        hint: 'Share of time both are up',
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
  // Show the swipe hint only when the table really overflows its region.
  const scroller = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [entries.length])
  return (
    <>
    <div
      ref={scroller}
      className="table-scroll table-scroll--compare"
      role="region"
      aria-label="Site comparison table; scroll sideways on small screens"
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
              <th scope="col" key={e.site.id} className="site-col">
                <span className="site-head">
                  <span
                    className="swatch"
                    style={{ background: e.color }}
                    aria-hidden="true"
                  />
                  <span>{e.site.name}</span>
                </span>
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
                          className={`num${best ? ' is-best' : ''}`}
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
    {overflows && (
      <p className="scroll-hint" aria-hidden="true">
        Swipe sideways to compare all sites →
      </p>
    )}
    </>
  )
}
