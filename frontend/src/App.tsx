
import { useEffect, useState } from 'react'
import './App.css'

type Site = {
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
    name: 'South Polar Test Site',
    latitude: -89.5,
    longitude: 0,
  },
  {
    name: 'Lunar South Pole',
    latitude: -90,
    longitude: 0,
  },
  {
    name: 'Second Test Site',
    latitude: -89,
    longitude: 45,
  },
]

function App() {
  const [site, setSite] = useState(sites[0].name)
  const [date, setDate] = useState('2026-11-14')
  const [conditions, setConditions] =
    useState<Conditions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedSite = sites.find(s => s.name === site)!

  useEffect(() => {
    const controller = new AbortController()

    async function fetchConditions() {
      setLoading(true)
      setError('')
      setConditions(null)

      try {
        const params = new URLSearchParams({
          lat: String(selectedSite.latitude),
          lon: String(selectedSite.longitude),
          day: date,
        })

        const response = await fetch(
          `http://127.0.0.1:8000/api/conditions?${params}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(
            body?.detail || `API error: ${response.status}`
          )
        }

        const data: Conditions = await response.json()

        if (!controller.signal.aborted) {
          setConditions(data)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'Unknown error'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchConditions()

    return () => controller.abort()
  }, [selectedSite.latitude, selectedSite.longitude, date])

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
          <div className="eyebrow">LUNAR MISSION PLANNING</div>
          <h1>
            Explore the Moon.
            <br />
            Plan the Mission.
          </h1>
          <p>
            Explore lunar coordinates and mission dates using
            NASA-derived Sun and Earth position data.
          </p>
        </section>

        <section className="dashboard">
          <div className="panel">
            <h2>Mission Configuration</h2>

            <label htmlFor="site">Landing Site</label>
            <select
              id="site"
              value={site}
              onChange={e => setSite(e.target.value)}
            >
              {sites.map(s => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            <label htmlFor="date">Mission Date</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />

            <div className="site-info">
              <h3>Selected Location</h3>
              <p>{selectedSite.name}</p>
              <p>Latitude: {selectedSite.latitude}°</p>
              <p>Longitude: {selectedSite.longitude}°</p>
              <p className="muted">
                Demonstration coordinates — not verified landing sites.
              </p>
            </div>
          </div>

          <div className="panel">
            <h2>Mission Conditions</h2>
            <p className="muted">
              Observation: {date} at 12:00 UTC
            </p>

            {loading && (
              <p>Retrieving NASA astronomical data...</p>
            )}

            {error && (
              <div className="notice">
                Unable to retrieve data: {error}
              </div>
            )}

            {conditions && !loading && (
              <>
                <div className="metric">
                  <span>☀ Sun Elevation</span>
                  <strong>
                    {conditions.sun.elevation_deg.toFixed(3)}°
                  </strong>
                </div>

                <div className="metric">
                  <span>☀ Sun Azimuth</span>
                  <strong>
                    {conditions.sun.azimuth_deg.toFixed(3)}°
                  </strong>
                </div>

                <div className="metric">
                  <span>🌍 Earth Elevation</span>
                  <strong>
                    {conditions.earth.elevation_deg.toFixed(3)}°
                  </strong>
                </div>

                <div className="metric">
                  <span>🌍 Earth Azimuth</span>
                  <strong>
                    {conditions.earth.azimuth_deg.toFixed(3)}°
                  </strong>
                </div>

                <div className="metric">
                  <span>☀ Geometric Sun Visibility</span>
                  <strong>
                    {conditions.sun.above_geometric_horizon
                      ? 'Above Horizon'
                      : 'Below Horizon'}
                  </strong>
                </div>

                <div className="metric">
                  <span>📡 Direct Earth Line of Sight</span>
                  <strong>
                    {conditions.earth.above_geometric_horizon
                      ? 'Geometrically Possible'
                      : 'Earth Below Horizon'}
                  </strong>
                </div>

                <div className="notice">
                  Source: {conditions.source}
                  <br />
                  <br />
                  {conditions.limitations}
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer>
        Lunaris Labs · Team Pitzer Connect · NASA Space Apps 2026
      </footer>
    </div>
  )
}

export default App
