import type { ReferenceSite, Site } from './api'
import { MAX_SITES } from './lib'

// Integrated from origin/main (b111168, 01116c4): south-polar
// stereographic map with the LROC WAC south-pole mosaic, 80°S–90°S,
// east-positive longitude, 0° at top. Registration checked: the USGS
// gazetteer rim of Shackleton (89.67°S 129.78°E, D 20.92 km) projects onto
// the crater in the image. Site selection uses the app's single selection
// model (the same list as the settings panel).

function project(lat: number, lon: number) {
  const rad = Math.PI / 180
  const r =
    (Math.tan(((90 + lat) / 2) * rad) / Math.tan(5 * rad)) * 240
  return {
    x: 300 + r * Math.sin(lon * rad),
    y: 300 - r * Math.cos(lon * rad),
  }
}

type Props = {
  sites: Site[]
  referenceSites: ReferenceSite[]
  selected: string[]
  colors: string[]
  onToggle: (id: string) => void
}

export default function LunarMap({
  sites,
  referenceSites,
  selected,
  colors,
  onToggle,
}: Props) {
  const full = selected.length >= MAX_SITES

  return (
    <section className="block" aria-labelledby="map-heading">
      <h2 id="map-heading">Where the sites are</h2>
      <p className="muted">
        South-polar view from 80°S to the pole, 0° longitude at the top.
        Select a filled marker to add or remove it from the comparison.
        Hollow markers are research reference coordinates without a
        validated terrain horizon yet; they are shown for context only.
      </p>
      <div className="lunar-map">
        <div className="lunar-map__canvas">
          <svg
            viewBox="0 0 600 600"
            role="img"
            aria-label="Lunar south-pole map, 80 to 90 degrees south, with candidate site markers"
          >
            <circle cx="300" cy="300" r="240" fill="#0b1427" />
            <image
              href="/lunaris_south_pole_80S.png"
              x="60"
              y="60"
              width="480"
              height="480"
              preserveAspectRatio="none"
            />
            {[120, 240].map(r => (
              <circle key={r} cx="300" cy="300" r={r} fill="none"
                stroke="#cfd8e6" strokeDasharray="5 7" opacity="0.6" />
            ))}
            <circle cx="300" cy="300" r="4" fill="#fff" />
            <text x="310" y="292" fill="#fff" fontSize="13">Pole</text>
            <text x="310" y="178" fill="#e6ebf2" fontSize="13">85°S</text>
            <text x="310" y="70" fill="#e6ebf2" fontSize="13">80°S</text>
            <text x="300" y="44" textAnchor="middle" fill="#3d4551"
              fontSize="13">0°E</text>
            <text x="560" y="305" textAnchor="middle" fill="#3d4551"
              fontSize="13">90°E</text>
            <text x="300" y="574" textAnchor="middle" fill="#3d4551"
              fontSize="13">180°</text>
            <text x="38" y="305" textAnchor="middle" fill="#3d4551"
              fontSize="13">90°W</text>
          </svg>

          {referenceSites.map(r => {
            const p = project(r.latitude, r.longitude)
            return (
              <span
                key={r.id}
                className="lunar-map__ref"
                style={{ left: `${p.x / 6}%`, top: `${p.y / 6}%` }}
                title={`${r.name} — ${r.status}`}
                aria-hidden="true"
              />
            )
          })}

          {sites.map(site => {
            const p = project(site.latitude, site.longitude)
            const index = selected.indexOf(site.id)
            const on = index >= 0
            return (
              <button
                key={site.id}
                type="button"
                className={`lunar-map__marker${on ? ' is-on' : ''}`}
                style={{
                  left: `${p.x / 6}%`,
                  top: `${p.y / 6}%`,
                  ...(on ? { background: colors[index] } : {}),
                }}
                aria-pressed={on}
                disabled={!on && full}
                aria-label={`${site.name}: ${
                  on ? 'in the comparison, select to remove' : 'select to compare'
                }`}
                title={site.name}
                onClick={() => onToggle(site.id)}
              />
            )
          })}
        </div>

        <div className="lunar-map__legend">
          <h3>Terrain-validated sites</h3>
          <ul>
            {sites.map(s => (
              <li key={s.id}>
                <strong>{s.name}</strong>
                <span>
                  {s.latitude.toFixed(3)}°, {s.longitude.toFixed(3)}°E ·{' '}
                  {selected.includes(s.id) ? 'in comparison' : 'not selected'}
                </span>
              </li>
            ))}
          </ul>
          {referenceSites.length > 0 && (
            <>
              <h3>Reference coordinates (not analysed)</h3>
              <ul>
                {referenceSites.map(r => (
                  <li key={r.id}>
                    <strong>{r.name}</strong>
                    <span>
                      {r.latitude.toFixed(3)}°, {r.longitude.toFixed(3)}°E ·{' '}
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                Source: {referenceSites[0].source}.
              </p>
            </>
          )}
        </div>
      </div>
      <p className="muted small">
        Imagery: NASA Lunar Reconnaissance Orbiter Camera (LROC) WAC south
        pole mosaic, south-polar stereographic projection. Markers are
        research reference points, not approved touchdown locations, and
        imagery is not a landing-hazard assessment.
      </p>
    </section>
  )
}
