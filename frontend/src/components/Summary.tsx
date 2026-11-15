import { fmtHours } from '../lib'
import {
  marginOverNext,
  rank,
  tradeoffHeadline,
  type Direction,
} from '../logic/compare'
import { EARTH_CAVEAT, SUN_CAVEAT } from '../logic/copy'
import type { Entry, Mode } from './types'

const pct = (v: number) => `${v.toFixed(1)}%`

type Card = {
  key: string
  label: string
  value: (e: Entry) => number
  format: (v: number) => string
  direction: Direction
  unit: 'pts' | 'time'
  note?: (leaders: Entry[]) => string | null
}

function Leader({ entries }: { entries: Entry[] }) {
  return (
    <span className="kpi__who">
      {entries.map(e => (
        <span key={e.site.id} className="kpi__site">
          <i className="swatch" style={{ background: e.color }} aria-hidden="true" />
          {e.site.name}
        </span>
      ))}
    </span>
  )
}

export default function Summary({
  entries,
  mode,
}: {
  entries: Entry[]
  mode: Mode
}) {
  if (entries.length === 0) return null
  const m = (e: Entry) => e.data.metrics[mode]
  const terrain = mode === 'terrain'

  const cards: Card[] = [
    {
      key: 'disk',
      label: 'Sunlight · mean solar disk',
      value: e => m(e).mean_sun_disk_pct,
      format: pct,
      direction: 'high',
      unit: 'pts',
      note: lead =>
        terrain
          ? `${pct(lead[0].data.metrics.terrain_far_field.mean_sun_disk_pct)} if ground < 200 m is ignored (sensitivity)`
          : null,
    },
    {
      key: 'dark',
      label: 'Longest darkness',
      value: e => m(e).longest_darkness_hours,
      format: fmtHours,
      direction: 'low',
      unit: 'time',
    },
    {
      key: 'earth',
      label: 'Earth visible',
      value: e => m(e).earth_visible_pct,
      format: pct,
      direction: 'high',
      unit: 'pts',
    },
    {
      key: 'outage',
      label: 'Longest Earth outage',
      value: e => m(e).longest_comms_blackout_hours,
      format: fmtHours,
      direction: 'low',
      unit: 'time',
    },
    {
      key: 'both',
      label: 'Sun + Earth together',
      value: e => m(e).both_pct,
      format: pct,
      direction: 'high',
      unit: 'pts',
    },
  ]

  const ranked = cards.map(c => ({
    card: c,
    r: rank(entries, c.value, c.format, c.direction),
  }))
  const headline =
    entries.length > 1
      ? tradeoffHeadline(
          ranked
            .filter(x => ['disk', 'outage', 'both'].includes(x.card.key))
            .map(x => ({
              names: x.r.winners.map(e => e.site.name),
              allTied: x.r.allTied,
            }))
        )
      : null

  return (
    <section className="summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="usa-sr-only">
        Summary
      </h2>
      {headline && <p className="tradeoff">{headline}</p>}
      <div className="kpis">
        {ranked.map(({ card, r }) => {
          const single = entries.length < 2
          const leaders = single ? entries : r.winners
          const best = card.value(leaders[0])
          const margin = marginOverNext(entries, card.value, card.format, card.direction)
          const sub = single
            ? null
            : r.allTied
              ? entries.length === 2
                ? 'Same at both sites'
                : `Same at all ${entries.length} sites`
              : margin === null
                ? null
                : card.unit === 'pts'
                  ? `+${margin.toFixed(1)} pts over next site`
                  : `${fmtHours(margin)} ${card.direction === 'low' ? 'shorter' : 'longer'} than next site`
          const note = card.note?.(leaders) ?? null
          return (
            <article className="kpi" key={card.key}>
              <h3 className="kpi__label">{card.label}</h3>
              <p className="kpi__value">{card.format(best)}</p>
              {r.allTied ? (
                <p className="kpi__tie">Tie</p>
              ) : (
                <Leader entries={leaders} />
              )}
              {r.tie && !r.allTied && <p className="kpi__tie">Joint leaders</p>}
              {sub && <p className="kpi__sub">{sub}</p>}
              {note && <p className="kpi__sub">{note}</p>}
            </article>
          )
        })}
      </div>
      <p className="caveat-line">
        <span>Sun visible ≠ electrical power</span>
        <span>Earth visible ≠ guaranteed radio link</span>
        <span>Visible = body centre above the {terrain ? 'terrain' : 'reference'} horizon</span>
      </p>
      <details className="disclosure">
        <summary>What these numbers mean</summary>
        <ul>
          <li>
            <strong>Mean solar disk</strong> averages the visible fraction of
            the Sun’s disk, so a partly hidden Sun counts partly.{' '}
            <strong>Sun visible</strong> (in the table) counts only time with
            the Sun’s centre above the horizon.
          </li>
          <li>
            <strong>Sun + Earth together</strong> is the share of time both
            centres are above the horizon at once.
          </li>
          <li>
            <strong>Longest darkness / Earth outage</strong> is the longest
            continuous stretch inside this window.
          </li>
          {terrain && (
            <li>
              <strong>Sensitivity</strong>: the same sunlight figure with
              terrain within 200 m ignored, where the 5 m elevation map is
              mostly interpolated. A what-if, not an error bar.
            </li>
          )}
          <li>{SUN_CAVEAT}</li>
          <li>{EARTH_CAVEAT}</li>
        </ul>
      </details>
    </section>
  )
}
