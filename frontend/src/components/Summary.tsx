import { fmtHours } from '../lib'
import { leaderSentence, rank, tradeoffSentence } from '../logic/compare'
import { EARTH_CAVEAT, SUN_CAVEAT } from '../logic/copy'
import type { Entry, Mode } from './types'

const pct = (v: number) => `${v.toFixed(1)}%`

export default function Summary({
  entries,
  mode,
}: {
  entries: Entry[]
  mode: Mode
}) {
  if (entries.length === 0) return null
  const m = (e: Entry) => e.data.metrics[mode]
  const name = (e: Entry) => e.site.name

  const sun = (e: Entry) => m(e).mean_sun_disk_pct
  const dark = (e: Entry) => m(e).longest_darkness_hours
  const earth = (e: Entry) => m(e).earth_visible_pct
  const outage = (e: Entry) => m(e).longest_comms_blackout_hours
  const both = (e: Entry) => m(e).both_pct

  const sunRank = rank(entries, sun, pct, 'high')
  const outageRank = rank(entries, outage, fmtHours, 'low')
  const bothRank = rank(entries, both, pct, 'high')

  const tradeoff =
    entries.length > 1
      ? tradeoffSentence([
          {
            priority: 'sunlight',
            names: sunRank.winners.map(name),
            allTied: sunRank.allTied,
          },
          {
            priority: 'shortest Earth outage',
            names: outageRank.winners.map(name),
            allTied: outageRank.allTied,
          },
          {
            priority: 'Sun and Earth together',
            names: bothRank.winners.map(name),
            allTied: bothRank.allTied,
          },
        ])
      : null

  const sensitivity =
    mode === 'terrain'
      ? entries
          .map(
            e =>
              `${e.site.name} ${pct(
                e.data.metrics.terrain_far_field.mean_sun_disk_pct
              )}`
          )
          .join(', ')
      : null

  return (
    <section className="summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="usa-sr-only">
        Summary
      </h2>
      {tradeoff && <p className="tradeoff">{tradeoff}</p>}
      <div className="kpis">
        <article className="kpi">
          <h3 className="kpi__label">Sunlight</h3>
          <p>
            {leaderSentence(entries, name, sun, pct, 'high', 'the most sunlight',
              'mean solar disk visible')}
          </p>
          <p>
            {leaderSentence(entries, name, dark, fmtHours, 'low',
              'the shortest continuous darkness',
              'longest stretch without the Sun')}
          </p>
          {sensitivity && (
            <p className="kpi__caveat">
              Nearby-terrain sensitivity — ignoring ground within 200 m
              gives {sensitivity}. A what-if, not an error bar.
            </p>
          )}
          <p className="kpi__caveat">{SUN_CAVEAT}</p>
        </article>
        <article className="kpi">
          <h3 className="kpi__label">Earth contact</h3>
          <p>
            {leaderSentence(entries, name, earth, pct, 'high',
              'the most Earth visibility', 'of the time')}
          </p>
          <p>
            {leaderSentence(entries, name, outage, fmtHours, 'low',
              'the shortest Earth outage',
              'longest stretch without Earth in view')}
          </p>
          <p className="kpi__caveat">{EARTH_CAVEAT}</p>
        </article>
        <article className="kpi">
          <h3 className="kpi__label">Sun and Earth together</h3>
          <p>
            {leaderSentence(entries, name, both, pct, 'high',
              'the most simultaneous visibility', 'of the time')}
          </p>
          <p className="kpi__caveat">
            Both centres above the {mode === 'terrain' ? 'terrain' : 'reference'}{' '}
            horizon at the same time.
          </p>
        </article>
      </div>
    </section>
  )
}
