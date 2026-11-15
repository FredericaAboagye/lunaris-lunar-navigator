import { useEffect, useState } from 'react'
import VisibilityCharts from './VisibilityCharts'
import './App.css'

type Site = {
  id: string
  name: string
  latitude: number
  longitude: number
}

type Position = {
  azimuth_deg: number
  elevation_deg: number
  above_geometric_horizon: boolean
}

type Conditions = {
  latitude: number
  longitude: number
  date: string
  observation_time_utc: string
  sun: Position
  earth: Position
  source: string
  limitations: string
}


const sites: Site[] = [
  {
    id: 'alpha',
    name: 'Mons Mouton — MMO01',
    latitude: -85.416,
    longitude: 31.851,
  },
  {
    id: 'beta',
    name: 'Malapert Massif — MMA01',
    latitude: -85.942,
    longitude: -0.944,
  },
  {
    id: 'gamma',
    name: 'de Gerlache Rim 2 — dGR201',
    latitude: -88.389,
    longitude: -68.865,
  },
  {
    id: 'delta',
    name: 'Nobile Rim 1 — NR101',
    latitude: -85.295,
    longitude: 36.917,
  },
]


const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

function formatAngle(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}°`
}


async function getConditions(
  site: Site,
  date: string,
  signal: AbortSignal
): Promise<Conditions> {
  const params = new URLSearchParams({
    lat: String(site.latitude),
    lon: String(site.longitude),
    day: date,
  })

  const response = await fetch(
    `${API_URL}/api/timeline?${params}`,
    { signal }
  )

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      body?.detail || `NASA API error: ${response.status}`
    )
  }

  const timeline = await response.json()

  const sun = timeline.sun?.find(
    (point: { hour: number }) => point.hour === 12
  )

  const earth = timeline.earth?.find(
    (point: { hour: number }) => point.hour === 12
  )

  if (!sun || !earth) {
    throw new Error(
      'Missing 12:00 UTC observations in NASA timeline'
    )
  }

  return {
    latitude: site.latitude,
    longitude: site.longitude,
    date,
    observation_time_utc: sun.time_utc,
    sun,
    earth,
    source: timeline.source,
    limitations: timeline.limitations,
  }
}


function SiteResults({
  title,
  site,
  data,
  loading,
}: {
  title: string
  site: Site
  data: Conditions | null
  loading: boolean
}) {
  return (
    <div className="comparison-card">
      <div className="site-heading">
        <span className="site-label">{title}</span>
        <h3>{site.name}</h3>
        <p>
          {site.latitude}° latitude · {site.longitude}° longitude
        </p>
      </div>

      {loading ? (
        <p className="muted">Loading NASA data...</p>
      ) : !data ? (
        <p className="muted">Measurements unavailable.</p>
      ) : (
        <>
          <div className="metric">
            <span>☀ Sun Elevation</span>
            <strong>{formatAngle(data.sun.elevation_deg)}</strong>
          </div>

          <div className="metric">
            <span>☀ Sun Azimuth</span>
            <strong>{formatAngle(data.sun.azimuth_deg)}</strong>
          </div>

          <div className="metric">
            <span>🌍 Earth Elevation</span>
            <strong>{formatAngle(data.earth.elevation_deg)}</strong>
          </div>

          <div className="metric">
            <span>🌍 Earth Azimuth</span>
            <strong>{formatAngle(data.earth.azimuth_deg)}</strong>
          </div>

          <div className="visibility-row">
            <span>Sun above horizon</span>
            <span
              className={
                data.sun.above_geometric_horizon
                  ? 'status-positive'
                  : 'status-negative'
              }
            >
              {data.sun.above_geometric_horizon ? 'YES' : 'NO'}
            </span>
          </div>

          <div className="visibility-row">
            <span>Earth above horizon</span>
            <span
              className={
                data.earth.above_geometric_horizon
                  ? 'status-positive'
                  : 'status-negative'
              }
            >
              {data.earth.above_geometric_horizon ? 'YES' : 'NO'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function App() {
  const [siteA, setSiteA] = useState('alpha')
  const [siteB, setSiteB] = useState('beta')
  const [date, setDate] = useState('2026-11-14')

  const [dataA, setDataA] = useState<Conditions | null>(null)
  const [dataB, setDataB] = useState<Conditions | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedA = sites.find(s => s.id === siteA)!
  const selectedB = sites.find(s => s.id === siteB)!

  useEffect(() => {
    const controller = new AbortController()

    async function loadComparison() {
      setLoading(true)
      setError('')
      setDataA(null)
      setDataB(null)

      try {
        const resultA = await getConditions(
         selectedA,
         date,
         controller.signal
        )

        if (!controller.signal.aborted) {
          setDataA(resultA)
        }

        const resultB = await getConditions(
         selectedB,
         date,
         controller.signal
        )

        if (!controller.signal.aborted) {
         setDataB(resultB)
        }

      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to retrieve NASA data'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadComparison()

    return () => controller.abort()
  }, [
    selectedA.latitude,
    selectedA.longitude,
    selectedB.latitude,
    selectedB.longitude,
    date,
  ])

  const sameSite = siteA === siteB

  return (
    <div className="app">
      <header className="header">
        <div className="brand">☾ LUNARIS LABS</div>
        <span className="tag">
          NASA Space Apps Challenge 2026
        </span>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow">
            LUNAR MISSION ANALYSIS
          </div>

          <h1>
            Explore the Moon.
            <br />
            Compare the Possibilities.
          </h1>

          <p>
            Compare lunar locations and mission dates
            using NASA JPL Horizons astronomical data.
          </p>
        </section>

        <section className="panel configuration-panel">
          <h2>Mission Configuration</h2>

          <div className="configuration-grid">
            <div>
              <label htmlFor="siteA">Landing Site A</label>
              <select
                id="siteA"
                value={siteA}
                onChange={e => setSiteA(e.target.value)}
              >
                {sites.map(site => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="siteB">Landing Site B</label>
              <select
                id="siteB"
                value={siteB}
                onChange={e => setSiteB(e.target.value)}
              >
                {sites.map(site => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="date">Mission Date</label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {sameSite && (
            <div className="notice">
              You selected the same site twice.
              Choose different sites for a meaningful comparison.
            </div>
          )}

          <p className="muted">
            Observation time: 12:00 UTC.
            Representative research candidate sites from Wueller et al.
            (2026). These coordinates are not approved touchdown
            locations. Terrain obstruction and landing safety
            are not yet evaluated.
          </p>
        </section>

        {error && (
          <div className="notice error-notice">
            Unable to load comparison: {error}
          </div>
        )}

        <section className="comparison-section">
          <div className="section-heading">
            <h2>Landing Site Comparison</h2>
            <p className="muted">
              Sun and Earth positions relative to the
              geometric lunar horizon
            </p>
          </div>

          <div className="comparison-grid">
            <SiteResults
              title="SITE A"
              site={selectedA}
              data={dataA}
              loading={loading}
            />

            <SiteResults
              title="SITE B"
              site={selectedB}
              data={dataB}
              loading={loading}
            />
          </div>
        </section>

        <VisibilityCharts
            siteA={selectedA}
            siteB={selectedB}
            date={date}
        />

        {dataA && dataB && !loading && (
          <section className="panel analysis-panel">
            <h2>Comparison Analysis</h2>

            <div className="metric">
              <span>Difference in Sun Elevation (A − B)</span>
              <strong>
                {formatAngle(
                  dataA.sun.elevation_deg -
                  dataB.sun.elevation_deg
                )}
              </strong>
            </div>

            <div className="metric">
              <span>Difference in Earth Elevation (A − B)</span>
              <strong>
                {formatAngle(
                  dataA.earth.elevation_deg -
                  dataB.earth.elevation_deg
                )}
              </strong>
            </div>

            <div className="notice">
              Measurements represent a single observation
              at 12:00 UTC on {date}.
              <br /><br />
              Higher elevation angles do not automatically
              mean a location is safer or more suitable
              for landing.
              <br /><br />
              Local terrain, prolonged illumination,
              communication windows, and other engineering
              constraints have not yet been evaluated.
              <br /><br />
              Source: NASA JPL Horizons.
              Scientific validation is ongoing.
            </div>
          </section>
        )}
      </main>

      <footer>
        Lunaris Labs · Team Pitzer Connect ·
        NASA Space Apps Challenge 2026
      </footer>
    </div>
  )
}

export default App
