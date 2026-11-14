
import { useState } from 'react'
import './App.css'

type Site = {
  name: string
  latitude: number
  longitude: number
}

const sites: Site[] = [
  { name: 'Lunar South Pole', latitude: -90, longitude: 0 },
  { name: 'Shackleton Crater', latitude: -89.9, longitude: 0 },
  { name: 'Malapert Massif', latitude: -85.9, longitude: 0 },
]

function App() {
  const [site, setSite] = useState(sites[0].name)
  const [date, setDate] = useState('2026-11-14')

  const selectedSite = sites.find(s => s.name === site)!

  return (
    <div className="app">
      <header className="header">
        <div className="brand">☾ LUNARIS LABS</div>
        <span className="tag">NASA Space Apps Challenge 2026</span>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow">LUNAR MISSION PLANNING</div>
          <h1>Explore the Moon.<br />Plan the Mission.</h1>
          <p>
            Compare lunar landing locations, explore mission dates,
            and evaluate sunlight and Earth communication visibility.
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
            </div>
          </div>

          <div className="panel">
            <h2>Mission Conditions</h2>
            <p className="muted">
              Selected date: {date}
            </p>

            <div className="metric">
              <span>☀ Sun Position</span>
              <strong>Awaiting NASA Data</strong>
            </div>

            <div className="metric">
              <span>🌍 Earth Visibility</span>
              <strong>Awaiting NASA Data</strong>
            </div>

            <div className="metric">
              <span>⚡ Solar Power Potential</span>
              <strong>Not Yet Calculated</strong>
            </div>

            <div className="notice">
              Scientific calculations will be integrated using
              NASA JPL Horizons data. This dashboard currently
              displays location and date selections only.
            </div>
          </div>
        </section>
      </main>

      <footer>
        Lunaris Labs · Project Team Pitzer Connect · NASA Space Apps 2026
      </footer>
    </div>
  )
}

export default App
