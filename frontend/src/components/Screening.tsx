import type { HazardDisc } from '../api'
import type { Entry } from './types'

function cells(d: HazardDisc) {
  return [`${d.pct_below_10.toFixed(1)}%`, `${d.pct_below_15.toFixed(1)}%`,
    `${d.p95_deg.toFixed(1)}°`]
}

export default function Screening({ entries }: { entries: Entry[] }) {
  return (
    <section className="block" aria-labelledby="screening-heading">
      <h2 id="screening-heading">Terrain slope screening (secondary)</h2>
      <p className="muted">
        Regional slope around each point from the 5 m LOLA slope map. This is
        screening context, not lander-scale hazard certification; median
        slope error is 1.5–2.5° (Barker et al. 2021). It does not affect any
        sunlight or Earth metric above.
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Slope screening table"
        tabIndex={0}
      >
        <table className="usa-table usa-table--borderless">
          <thead>
            <tr>
              <th scope="col">Site</th>
              <th scope="col">Within 100 m: under 10°</th>
              <th scope="col">under 15°</th>
              <th scope="col">95th-pct slope</th>
              <th scope="col">Within 500 m: under 10°</th>
              <th scope="col">under 15°</th>
              <th scope="col">95th-pct slope</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.site.id}>
                <th scope="row">
                  <span className="swatch" style={{ background: e.color }}
                    aria-hidden="true" />
                  {e.site.name}
                </th>
                {[...cells(e.site.hazard.within_100m),
                  ...cells(e.site.hazard.within_500m)].map((c, k) => (
                  <td key={k}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
