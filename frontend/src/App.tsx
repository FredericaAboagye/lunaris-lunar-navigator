import { useEffect, useMemo, useState } from 'react'
import {
  fetchAnalysis,
  fetchSites,
  type Analysis,
  type Mode,
  type Site,
} from './api'
import Availability from './components/Availability'
import Controls from './components/Controls'
import ElevationChart from './components/ElevationChart'
import MetricsTable from './components/MetricsTable'
import Panorama from './components/Panorama'
import Summary from './components/Summary'
import Screening from './components/Screening'
import WindowCompare from './components/WindowCompare'
import Windows from './components/Windows'
import {
  DEFAULT_HEIGHT,
  DEFAULT_START,
  DURATIONS,
  HEIGHTS,
  MAX_SITES,
  SITE_COLORS,
  downloadText,
  fmtLat,
  fmtUtc,
  toCsv,
} from './lib'

const DEFAULT_SITES = ['site04', 'site01']

function readUrl() {
  const q = new URLSearchParams(window.location.search)
  const days = Number(q.get('days'))
  const height = Number(q.get('height'))
  const start = q.get('start') || ''
  return {
    sites: q.get('sites')?.split(',').filter(Boolean) ?? DEFAULT_SITES,
    start: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : DEFAULT_START,
    days: DURATIONS.some(d => d.days === days) ? days : 30,
    height: HEIGHTS.includes(height) ? height : DEFAULT_HEIGHT,
    mode: (q.get('model') === 'geometric' ? 'geometric' : 'terrain') as Mode,
  }
}

function Accordion({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
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
  const [unsupported, setUnsupported] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string[]>(initial.sites)
  const [start, setStart] = useState(initial.start)
  const [days, setDays] = useState(initial.days)
  const [height, setHeight] = useState(initial.height)
  const [mode, setMode] = useState<Mode>(initial.mode)

  const [results, setResults] = useState<Record<string, Analysis>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(0)
  const [retry, setRetry] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(
    () => window.matchMedia('(min-width: 62em)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 62em)')
    const sync = () => mq.matches && setSettingsOpen(true)
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  function openWindow(next: string) {
    setStart(next)
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchSites(controller.signal)
      .then(r => {
        setCatalog(r.sites)
        setUnsupported(r.unsupported)
        setSelected(prev => {
          const valid = prev.filter(id => r.sites.some(s => s.id === id))
          const fallback = DEFAULT_SITES.filter(id =>
            r.sites.some(s => s.id === id)
          )
          return (valid.length ? valid : fallback).slice(0, MAX_SITES)
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
    Promise.all(
      selected.map(
        async id => [id, await fetchAnalysis(id, start, days, height)] as const
      )
    )
      .then(pairs => {
        if (cancelled) return
        setResults(Object.fromEntries(pairs))
        setCursor(c => Math.min(c, (pairs[0]?.[1].times.length ?? 1) - 1))
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
  }, [catalog, key, start, days, height, retry])

  useEffect(() => {
    const q = new URLSearchParams({
      sites: key,
      start,
      days: String(days),
      height: String(height),
      model: mode,
    })
    window.history.replaceState(null, '', `?${q}`)
  }, [key, start, days, height, mode])

  const entries = selected
    .map((id, i) => {
      const site = catalog.find(s => s.id === id)
      const data = results[id]
      return site && data && data.height_m === height
        ? { site, data, color: SITE_COLORS[i] }
        : null
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)

  const ready = !loading && !error && entries.length === selected.length
  const times = entries[0]?.data.times ?? []
  const terrain = mode === 'terrain'

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

      <main id="main">
      <section className="hero" aria-labelledby="page-title">
        <div className="container">
          <p className="eyebrow">Lunar south pole · mission planning</p>
          <h1 id="page-title">
            See when each site has sunlight and a view of Earth.
          </h1>
          <p className="lead">
            Compare documented candidate sites near the lunar south pole:
            Sun and Earth positions from NASA JPL Horizons, checked against
            the terrain horizon from LRO laser altimetry.
          </p>
        </div>
      </section>

      <div className="container layout">
        <aside className="sidebar" aria-label="Settings">
          <details
            className="settings"
            open={settingsOpen}
            onToggle={e => setSettingsOpen(e.currentTarget.open)}
          >
            <summary className="settings__summary">
              <span className="settings__title">Settings</span>
              <span className="settings__state">
                {selected.length} site{selected.length === 1 ? '' : 's'} ·{' '}
                {start} · {days} d · {height} m ·{' '}
                {mode === 'terrain' ? 'terrain' : 'smooth sphere'}
              </span>
              <span className="settings__toggle" aria-hidden="true">
                {settingsOpen ? 'Hide ▴' : 'Change ▾'}
              </span>
            </summary>
            <h2 className="settings__heading">Configure</h2>
            <Controls
              sites={catalog}
              unsupported={unsupported}
              selected={selected}
              onToggle={toggleSite}
              start={start}
              onStart={setStart}
              days={days}
              onDays={setDays}
              height={height}
              onHeight={setHeight}
              mode={mode}
              onMode={setMode}
            />
            {start === DEFAULT_START && (
              <p className="usa-hint example-note">
                Opens with an example window (1 Mar 2027 UTC) that shows a
                tradeoff. It is not today’s date or an optimized landing
                window.
              </p>
            )}
            <button
              type="button"
              className="usa-button usa-button--outline usa-button--full"
              disabled={!ready}
              onClick={() =>
                downloadText(
                  `lunaris-${start}-${days}d-${height}m.csv`,
                  toCsv(entries)
                )
              }
            >
              Download data (CSV)
            </button>
          </details>
        </aside>

        <div className="content" id="results">
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
              <Summary entries={entries} mode={mode} />

              <section className="block">
                <h2>Site comparison</h2>
                <p className="muted">
                  {start === DEFAULT_START ? 'Example window: ' : ''}
                  {entries[0].data.days} days from{' '}
                  {entries[0].data.start.slice(0, 10)} 00:00 UTC · observer{' '}
                  {height} m above the ground ·{' '}
                  {terrain
                    ? 'LOLA terrain horizon'
                    : 'smooth-sphere horizon (0°)'}{' '}
                  · best value per row highlighted; equal values are ties
                </p>
                {!terrain && (
                  <div className="usa-alert usa-alert--warning usa-alert--slim">
                    <div className="usa-alert__body">
                      <p className="usa-alert__text">
                        Smooth-sphere mode ignores terrain and the site’s
                        own elevation. It is shown for comparison only;
                        switch to LOLA terrain for planning.
                      </p>
                    </div>
                  </div>
                )}
                <MetricsTable entries={entries} mode={mode} />
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
                        {fmtLat(e.site)} — {e.site.region}. Point:{' '}
                        {e.site.point_source}.
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
                <h2>Horizon view</h2>
                <p className="muted">
                  Looking all the way around from each site. The dark
                  shape is the {terrain ? 'terrain horizon' : 'flat horizon'};
                  lines trace the Sun and Earth over the whole window; discs
                  show them at the cursor time, drawn to scale.
                  {terrain &&
                    ' The dashed white line ignores ground within 200 m.'}
                </p>
                <div className="panorama-grid">
                  {entries.map(e => (
                    <Panorama
                      key={e.site.id}
                      entry={e}
                      cursorIndex={cursor}
                      mode={mode}
                    />
                  ))}
                </div>
              </section>

              <section className="block">
                <h2>Elevation over time</h2>
                <p className="muted">
                  Solid lines are the body’s elevation.{' '}
                  {terrain
                    ? 'Dashed lines in the same colour are the terrain horizon in that direction — the body is visible while the solid line is above its dashed line.'
                    : 'The body is visible while its line is above 0°.'}
                </p>
                <h3>Sun</h3>
                <ElevationChart entries={entries} body="sun"
                  cursorIndex={cursor} mode={mode} />
                <h3>Earth</h3>
                <ElevationChart entries={entries} body="earth"
                  cursorIndex={cursor} mode={mode} />
              </section>

              <section className="block">
                <h2>Visibility timeline</h2>
                <Availability entries={entries} cursorIndex={cursor}
                  mode={mode} />
              </section>

              <section className="block" aria-labelledby="times-heading">
                <h2 id="times-heading">Exact window times (UTC)</h2>
                <p className="muted">
                  Every Earth-visible period, Earth outage and period of
                  darkness in this window, by site
                  ({terrain ? 'LOLA terrain horizon' : 'smooth-sphere horizon'}).
                </p>
                <Windows entries={entries} mode={mode} />
              </section>

              <WindowCompare
                sites={entries.map(e => ({ site: e.site, color: e.color }))}
                start={start}
                days={days}
                height={height}
                mode={mode}
                onOpen={openWindow}
              />

              <Screening entries={entries} />

              <section className="block" aria-label="Definitions and limitations">
                <Accordion title="Definitions, data and limitations">
                  <h4>What the numbers mean</h4>
                  <ul>
                    <li>
                      <strong>Visible</strong> means the body’s centre is
                      above the horizon. <em>Mean solar disk visible</em>{' '}
                      also counts a partly hidden Sun.
                    </li>
                    <li>
                      <strong>Terrain horizon</strong> is the highest
                      ground in each direction from LOLA laser altimetry,
                      including lunar curvature, out to 250 km. Extending the
                      search to 300 km changes nothing — that tests search
                      distance only, not overall accuracy.{' '}
                      <strong>Smooth sphere</strong> uses 0° and ignores
                      terrain.
                    </li>
                    <li>
                      <strong>Nearby-ground sensitivity</strong> repeats the
                      calculation ignoring terrain within 200 m, where the
                      5 m map is mostly interpolated. It shows how much that
                      part matters; it is not a statistical confidence
                      interval.
                    </li>
                    <li>
                      <strong>Sun visible is not power generated</strong>:
                      panel orientation, efficiency and dust are not
                      modelled.
                    </li>
                    <li>
                      <strong>Earth visible is not a guaranteed radio
                      link</strong>: antennas, link margins and ground
                      station schedules are not modelled.
                    </li>
                    <li>
                      <strong>Visibility explanations</strong> in the horizon
                      view describe the body’s centre against the modelled
                      terrain horizon (or 0° in smooth-sphere mode). The
                      partial-disk note uses the same area formula as the
                      mean-solar-disk metric.
                    </li>
                    <li>
                      <strong>Slope statistics are regional
                      screening</strong>, not lander-scale hazard
                      certification.
                    </li>
                  </ul>
                  <h4>Data and validation</h4>
                  <ul>
                    {entries.map(e => (
                      <li key={e.site.id}>
                        <strong>{e.site.name}</strong>:{' '}
                        {e.site.coverage.local_dem}, plus{' '}
                        {e.site.coverage.regional_dem}; terrain searched
                        to {e.site.coverage.terrain_search_km} km
                        {e.site.coverage.complete
                          ? ' with full coverage'
                          : ' — coverage incomplete'}
                        . Checks{' '}
                        {e.site.validation.passed ? 'passed' : 'failed'}.
                        Our mean illumination at 1 m, 2024–2025 is{' '}
                        {(
                          e.site.validation.published_check
                            .our_mean_solar_disk_fraction_1m * 100
                        ).toFixed(1)}
                        %, consistent with this point lying in a region
                        Barker et al. (2021) report as above 70 % — a
                        threshold, not a published value to match.
                      </li>
                    ))}
                  </ul>
                  <p>{entries[0].data.limitations}</p>
                  <p className="muted">
                    Source: {entries[0].data.source}. Generated{' '}
                    {fmtUtc(entries[0].data.generated_at)} UTC.
                  </p>
                </Accordion>
              </section>
            </div>
          )}
        </div>
      </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>
            Lunaris · Team Pitzer Connect · NASA Space Apps Challenge
            2026. Built with the NASA Web Design System using NASA JPL
            Horizons and LRO LOLA data. This is a hackathon project and not
            an official NASA product.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
