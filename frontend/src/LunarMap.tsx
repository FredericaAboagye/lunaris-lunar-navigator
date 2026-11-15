
import { useState } from 'react'

type LunarSite = {
  id: string
  name: string
  latitude: number
  longitude: number
}

type Props = {
  sites: LunarSite[]
  siteA: string
  siteB: string
  setSiteA: (id: string) => void
  setSiteB: (id: string) => void
}

// South-polar stereographic projection.
// Map extent: 80°S to 90°S.
// Coordinates use east-positive longitude.
function project(lat: number, lon: number) {
  const radians = Math.PI / 180
  const angle = lon * radians

  const distance =
    Math.tan(((90 + lat) / 2) * radians) /
    Math.tan(5 * radians)

  const radius = distance * 240

  return {
    x: 300 + radius * Math.sin(angle),
    y: 300 - radius * Math.cos(angle),
  }
}

export default function LunarMap({
  sites,
  siteA,
  siteB,
  setSiteA,
  setSiteB,
}: Props) {
  const [target, setTarget] = useState<'A' | 'B'>('A')
  const [active, setActive] = useState<string | null>(null)

  const selected = sites.find(site => site.id === active)

  function selectSite(id: string) {
    if (target === 'A') {
      setSiteA(id)
    } else {
      setSiteB(id)
    }
    setActive(id)
  }

  return (
    <section className="lunar-map-section">
      <div className="section-heading">
        <h2>Explore the Lunar South Pole</h2>
        <p className="muted">
          Explore representative research candidate sites
          using a south-polar coordinate map.
        </p>
      </div>

      <div className="panel lunar-map-panel">
        <div className="map-toolbar">
          <span>Click a marker to assign:</span>

          <button
            type="button"
            className={target === 'A' ? 'active' : ''}
            onClick={() => setTarget('A')}
          >
            Site A
          </button>

          <button
            type="button"
            className={target === 'B' ? 'active' : ''}
            onClick={() => setTarget('B')}
          >
            Site B
          </button>
        </div>

        <div className="lunar-map-layout">
          <div className="lunar-map-canvas">
            <svg
              viewBox="0 0 600 600"
              role="img"
              aria-label="Lunar south-pole coordinate map, 80 to 90 degrees south"
            >
              <defs>
                <radialGradient id="moon-map-bg">
                  <stop offset="0%" stopColor="#202f4c" />
                  <stop offset="100%" stopColor="#0b1427" />
                </radialGradient>
              </defs>

              <circle
                cx="300"
                cy="300"
                r="240"
                fill="url(#moon-map-bg)"
                stroke="#516488"
                strokeWidth="2"
              />


              {/* NASA LRO south-pole imagery, 80°S–90°S */}
              <image
              href="/lunaris_south_pole_80S.png"
              x="60"
              y="60"
              width="480"
              height="480"
              preserveAspectRatio="none"
              />


              {[120, 240].map(radius => (
                <circle
                  key={radius}
                  cx="300"
                  cy="300"
                  r={radius}
                  fill="none"
                  stroke="#607395"
                  strokeDasharray="5 7"
                  opacity="0.7"
                />
              ))}

              {[0, 45, 90, 135].map(deg => {
                const angle = deg * Math.PI / 180
                const dx = 240 * Math.sin(angle)
                const dy = 240 * Math.cos(angle)

                return (
                  <line
                    key={deg}
                    x1={300 - dx}
                    y1={300 + dy}
                    x2={300 + dx}
                    y2={300 - dy}
                    stroke="#607395"
                    strokeDasharray="4 8"
                    opacity="0.55"
                  />
                )
              })}

              <circle
                cx="300"
                cy="300"
                r="5"
                fill="#f8fafc"
              />
              <text x="311" y="289" fill="#fff" fontSize="13">
                South Pole
              </text>

              <text x="311" y="178" fill="#9aabc9" fontSize="13">
                85°S
              </text>
              <text x="311" y="70" fill="#9aabc9" fontSize="13">
                80°S
              </text>

              <text x="300" y="44" textAnchor="middle"
                fill="#9aabc9" fontSize="13">
                0°E
              </text>
              <text x="557" y="305" textAnchor="middle"
                fill="#9aabc9" fontSize="13">
                90°E
              </text>
              <text x="300" y="568" textAnchor="middle"
                fill="#9aabc9" fontSize="13">
                180°
              </text>
              <text x="39" y="305" textAnchor="middle"
                fill="#9aabc9" fontSize="13">
                90°W
              </text>
            </svg>

            {sites
              .filter(site =>
                site.latitude >= -90 &&
                site.latitude <= -80
              )
              .map(site => {
                const point = project(
                  site.latitude,
                  site.longitude
                )

                const isA = site.id === siteA
                const isB = site.id === siteB

                return (
                  <button
                    key={site.id}
                    type="button"
                    aria-label={`Select ${site.name} as Site ${target}`}
                    title={site.name}
                    className={[
                      'lunar-map-marker',
                      isA ? 'marker-a' : '',
                      isB ? 'marker-b' : '',
                    ].join(' ')}
                    style={{
                      left: `${point.x / 6}%`,
                      top: `${point.y / 6}%`,
                    }}
                    onClick={() => selectSite(site.id)}
                  >
                    <span className="marker-dot" />
                  </button>
                )
              })}
          </div>

          <div className="lunar-map-sidebar">
            <h3>Candidate Locations</h3>

            {sites.map(site => (
              <button
                key={site.id}
                type="button"
                className="map-site-button"
                onClick={() => selectSite(site.id)}
              >
                <strong>{site.name}</strong>
                <small>
                  {site.latitude.toFixed(3)}° latitude ·{' '}
                  {site.longitude.toFixed(3)}° longitude
                </small>
                <small>
                  {site.id === siteA ? 'Selected A ' : ''}
                  {site.id === siteB ? 'Selected B' : ''}
                </small>
              </button>
            ))}

            {selected && (
              <div className="notice">
                <strong>{selected.name}</strong>
                <p>
                  Assigned to Site {target}.
                  The dashboard selection has been updated.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="muted">
          Lunar imagery: NASA Lunar Reconnaissance Orbiter Camera
          (LROC), WAC South Pole Mosaic.
          South-polar stereographic projection (80°S–90°S).
          Candidate markers represent research reference coordinates,
          not approved touchdown locations.
          Imagery does not constitute a landing-hazard assessment.
        </p>
      </div>
    </section>
  )
}
