import { useEffect, useMemo, useState } from 'react'
import {
  fetchAnalysis,
  fetchSites,
  type Analysis,
  type Site,
} from './api'
import Availability from './components/Availability'
import Controls from './components/Controls'
import ElevationChart from './components/ElevationChart'
import MetricsTable from './components/MetricsTable'
import SkyPlot from './components/SkyPlot'
import Summary from './components/Summary'
import Windows from './components/Windows'
import {
  DEFAULT_START,
  DURATIONS,
  MAX_SITES,
  SITE_COLORS,
  downloadText,
  fmtLat,
  fmtUtc,
  toCsv,
} from './lib'

const DEFAULT_SITES = ['malapert', 'shackleton', 'haworth']

function readUrl() {
  const q = new URLSearchParams(window.location.search)
  const days = Number(q.get('days'))
  const start = q.get('start') || ''
  return {
    sites: q.get('sites')?.split(',').filter(Boolean) ?? DEFAULT_SITES,
    start: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : DEFAULT_START,
    days: DURATIONS.some(d => d.days === days) ? days : 30,
  }
}

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="usa-accordion usa-accordion--bordered">
      <h3 className="usa-accordion__heading">
        <button
          type="button"
          className="usa-accordion__button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {title}
        </button>
      </h3>
      <div className="usa-accordion__content usa-prose" hidden={!open}>
        {children}
      </div>
    </div>
  )
}

function App() {
  const initial = useMemo(readUrl, [])
  const [catalog, setCatalog] = useState<Site[]>([])
  const [selected, setSelected] = useState<string[]>(initial.sites)
  const [start, setStart] = useState(initial.start)
  const [days, setDays] = useState(initial.days)

  const [results, setResults] = useState<Record<string, Analysis>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(0)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchSites(controller.signal)
      .then(r => {
        setCatalog(r.sites)
        setSelected(prev => {
          const valid = prev.filter(id =>
            r.sites.some(s => s.id === id)
          )
          return (valid.length ? valid : DEFAULT_SITES).slice(
            0,
            MAX_SITES
          )
        })
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [retry])

  const key = selected.join(',')

  useEffect(() => {
    if (catalog.length === 0) return
    let cancelled = false
    setLoading(true)
    setError('')

    const chosen = selected
      .map(id => catalog.find(s => s.id === id))
      .filter((s): s is Site => Boolean(s))

    Promise.all(
      chosen.map(async site => [
        site.id,
        await fetchAnalysis(site, start, days),
      ] as const)
    )
      .then(pairs => {
        if (cancelled) return
        setResults(Object.fromEntries(pairs))
        setCursor(c => Math.min(c, pairs[0]?.[1].times.length - 1 || 0))
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, key, start, days, retry])

  useEffect(() => {
    const q = new URLSearchParams({
      sites: key,
      start,
      days: String(days),
    })
    window.history.replaceState(null, '', `?${q}`)
  }, [key, start, days])

  const entries = selected
    .map((id, i) => {
      const site = catalog.find(s => s.id === id)
      const data = results[id]
      return site && data
        ? { site, data, color: SITE_COLORS[i] }
        : null
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)

  const ready = !loading && !error && entries.length === selected.length
  const times = entries[0]?.data.times ?? []

  function toggleSite(id: string) {
    setSelected(prev =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter(s => s !== id)
          : prev
        : prev.length < MAX_SITES
          ? [...prev, id]
          : prev
    )
  }

  return (
    <div className="app">
      <header className="usa-header usa-header--basic usa-header--dark topbar">
        <div className="container topbar__inner">
          <div className="usa-logo">
            <a href="/" className="brand" aria-label="Lunaris home">
              <svg viewBox="0 0 24 24" width="26" height="26"
                aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="none"
                  stroke="currentColor" strokeWidth="1.6" />
                <path d="M15.5 4.6A8 8 0 1 0 19.4 15 6.5 6.5 0 0 1 15.5 4.6Z"
                  fill="currentColor" />
              </svg>
              <span>Lunaris</span>
              <small>Lunar Landing Site Navigator</small>
            </a>
          </div>
          <span className="topbar__tag">
            NASA Space Apps Challenge 2026
          </span>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <p className="eyebrow">Lunar south pole · mission planning</p>
          <h1>Compare landing sites by sunlight and Earth contact.</h1>
          <p className="lead">
            Pick candidate sites and a start date. Lunaris pulls Sun and
            Earth positions from NASA JPL Horizons and shows when each
            site has power, when it can talk to Earth, and when it has
            both.
          </p>
        </div>
      </section>

      <main className="container layout">
        <aside className="sidebar" aria-label="Configuration">
          <h2>Configure</h2>
          <Controls
            sites={catalog}
            selected={selected}
            onToggle={toggleSite}
            start={start}
            onStart={setStart}
            days={days}
            onDays={setDays}
          />
          <button
            type="button"
            className="usa-button usa-button--outline usa-button--full"
            disabled={!ready}
            onClick={() =>
              downloadText(
                `lunaris-${start}-${days}d.csv`,
                toCsv(entries)
              )
            }
          >
            Download data (CSV)
          </button>
        </aside>

        <div className="content">
          {error && (
            <div className="usa-alert usa-alert--error" role="alert">
              <div className="usa-alert__body">
                <h3 className="usa-alert__heading">
                  Unable to load NASA data
                </h3>
                <p className="usa-alert__text">{error}</p>
                <button
                  type="button"
                  className="usa-button margin-top"
                  onClick={() => setRetry(r => r + 1)}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {loading && !error && (
            <div className="usa-alert usa-alert--info" role="status">
              <div className="usa-alert__body">
                <p className="usa-alert__text">
                  Querying NASA JPL Horizons…
                </p>
              </div>
            </div>
          )}

          {entries.length > 0 && !error && (
            <div className={loading ? 'is-stale' : undefined}>
              <Summary entries={entries} />

              <section className="block">
                <h2>Site comparison</h2>
                <p className="muted">
                  {entries[0].data.days} days from{' '}
                  {entries[0].data.start.slice(0, 10)} UTC · highlighted
                  values are best in row · geometric horizon
                </p>
                <div className="usa-alert usa-alert--warning usa-alert--slim">
                  <div className="usa-alert__body">
                    <p className="usa-alert__text">
                      Smooth-sphere model: terrain is not included, so
                      crater rims and ridges look sunnier than they are
                      in reality. Use for shortlisting only.
                    </p>
                  </div>
                </div>
                <MetricsTable entries={entries} />
                <ul className="site-notes">
                  {entries.map(e => (
                    <li key={e.site.id}>
                      <span
                        className="swatch"
                        style={{ background: e.color }}
                        aria-hidden="true"
                      />
                      <strong>{e.site.name}</strong>{' '}
                      <span className="muted">
                        {fmtLat(e.site)} — {e.site.note}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="cursor-bar">
                <label htmlFor="cursor">
                  Time cursor:{' '}
                  <strong>{fmtUtc(times[cursor] ?? times[0])} UTC</strong>
                </label>
                <input
                  id="cursor"
                  className="usa-range"
                  type="range"
                  min={0}
                  max={times.length - 1}
                  value={cursor}
                  onChange={e => setCursor(Number(e.target.value))}
                />
              </div>

              <section className="block">
                <h2>Elevation above the horizon</h2>
                <p className="muted">
                  Above 0° the body is visible. Shaded band is below the
                  horizon. The red line is the time cursor.
                </p>
                <h3>Sun (power)</h3>
                <ElevationChart
                  entries={entries}
                  body="sun"
                  cursorIndex={cursor}
                />
                <h3>Earth (direct-to-Earth link)</h3>
                <ElevationChart
                  entries={entries}
                  body="earth"
                  cursorIndex={cursor}
                />
              </section>

              <section className="block">
                <h2>Availability timeline</h2>
                <Availability entries={entries} cursorIndex={cursor} />
              </section>

              <section className="block">
                <h2>Sky view at cursor time</h2>
                <p className="muted">
                  Looking up from each site: north at top, horizon at the
                  bold ring, rings every 10° of elevation. Faint lines
                  trace the paths over the whole window.
                </p>
                <div className="sky-grid">
                  {entries.map(e => (
                    <SkyPlot
                      key={e.site.id}
                      site={e.site}
                      data={e.data}
                      color={e.color}
                      cursorIndex={cursor}
                    />
                  ))}
                </div>
              </section>

              <section className="block">
                <Accordion title="Event windows (Earth contact, blackouts, darkness)">
                  <Windows entries={entries} />
                </Accordion>
                <Accordion title="Method, data source and limitations">
                  <p>
                    Positions come from the NASA JPL Horizons observer
                    ephemeris, computed for a point on the lunar surface
                    (<code>CENTER=coord@301</code>) at one-hour steps in
                    UTC. Window edges are interpolated between samples.
                  </p>
                  <p>{entries[0].data.limitations}</p>
                  <p>
                    Site coordinates are approximate feature locations
                    for comparison and are not surveyed landing-site
                    coordinates. Real illumination at the poles depends
                    strongly on terrain, so use these results to
                    shortlist, not to certify.
                  </p>
                  <p className="muted">
                    Source: {entries[0].data.source}. Data generated{' '}
                    {fmtUtc(entries[0].data.generated_at)} UTC.
                  </p>
                </Accordion>
              </section>
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>
            Lunaris · Team Pitzer Connect · NASA Space Apps Challenge
            2026. Built with the NASA Web Design System. This is a
            hackathon project and not an official NASA product.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
