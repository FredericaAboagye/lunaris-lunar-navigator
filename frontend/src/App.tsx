import { useEffect, useMemo, useState } from 'react'
import {
  fetchAnalysis,
  fetchSites,
  type Analysis,
  type Mode,
  type ReferenceSite,
  type Site,
} from './api'
import LunarMap from './LunarMap'
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

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('lunaris-theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('lunaris-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])
  const initial = useMemo(readUrl, [])
  const [catalog, setCatalog] = useState<Site[]>([])
  const [unsupported, setUnsupported] = useState<Record<string, string>>({})
  const [referenceSites, setReferenceSites] = useState<ReferenceSite[]>([])
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
    say(`Opened the window starting ${next} UTC.`)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById('results')
      ?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' })
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchSites(controller.signal)
      .then(r => {
        setCatalog(r.sites)
        setUnsupported(r.unsupported)
        setReferenceSites(r.reference_sites ?? [])
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

  // Polite announcements for deliberate selection changes only (never for
  // slider movement or animation).
  const [announcement, setAnnouncement] = useState('')
  const say = (msg: string) => setAnnouncement(msg)
  const siteName = (id: string) => catalog.find(c => c.id === id)?.name ?? id

  function toggleSite(id: string) {
    const name = siteName(id)
    if (selected.includes(id)) {
      if (selected.length === 1) {
        say(`${name} is the only site selected; add another before removing it.`)
        return
      }
      const n = selected.length - 1
      say(`${name} removed. Comparing ${n} site${n === 1 ? '' : 's'}.`)
      setSelected(prev => prev.filter(s => s !== id))
    } else if (selected.length >= MAX_SITES) {
      say(`Maximum ${MAX_SITES} sites. Remove one before adding ${name}.`)
    } else {
      say(`${name} added. Comparing ${selected.length + 1} sites.`)
      setSelected(prev => (prev.includes(id) ? prev : [...prev, id]))
    }
  }
  const changeStart = (v: string) => {
    setStart(v)
    say(`Window starts ${v} UTC.`)
  }
  const changeDays = (v: number) => {
    setDays(v)
    say(`Window length ${v} day${v === 1 ? '' : 's'}.`)
  }
  const changeHeight = (v: number) => {
    setHeight(v)
    say(`Observer height ${v} metres.`)
  }
  const changeMode = (v: Mode) => {
    setMode(v)
    say(v === 'terrain' ? 'Using the LOLA terrain horizon.' : 'Using the smooth-sphere horizon.')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar__inner">
          <div className="topbar__brand">
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
      </div>
          <div className="topbar__actions">
            <span className="topbar__tag">
              NASA Space Apps Challenge 2026
            </span>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={darkMode}
              >
              {darkMode ? '☀️ Light mode' : '🌙 Dark mode'}
            </button>
          </div>
      </header>

      <main id="main">
      <p className="usa-sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
      <section className="hero" aria-labelledby="page-title">
        <div className="container">
          <p className="eyebrow">Lunar south pole · mission planning</p>
          <h1 id="page-title">
            ☀️ Sunlight and 🌍 Earth view at lunar south-pole sites
          </h1>
          <p className="lead">
            Compare candidate sites and dates using NASA JPL Horizons
            positions and LRO terrain horizons.
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
              onStart={changeStart}
              days={days}
              onDays={changeDays}
              height={height}
              onHeight={changeHeight}
              mode={mode}
              onMode={changeMode}
            />
            {start === DEFAULT_START && (
              <p className="usa-hint example-note">
                Example window (1 Mar 2027 UTC) chosen to show a tradeoff —
                not today’s date or an optimized landing window.
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
                <p className="muted section-sub">
                  {start === DEFAULT_START ? 'Example window: ' : ''}
                  {entries[0].data.days} day
                  {entries[0].data.days === 1 ? '' : 's'} from{' '}
                  {entries[0].data.start.slice(0, 10)} 00:00 UTC · observer{' '}
                  {height} m above the ground ·{' '}
                  {terrain
                    ? 'LOLA terrain horizon'
                    : 'smooth-sphere horizon (0°)'}{' '}
                  · best in row highlighted, equal values tie
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
                <details className="disclosure">
                  <summary>Site details: coordinates and sources</summary>
                  <div
                    className="table-scroll"
                    role="region"
                    aria-label="Site details"
                    tabIndex={0}
                  >
                    <table className="usa-table usa-table--borderless details-table">
                      <thead>
                        <tr>
                          <th scope="col">Site</th>
                          <th scope="col">Coordinates</th>
                          <th scope="col">Region</th>
                          <th scope="col">Point source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map(e => (
                          <tr key={e.site.id}>
                            <th scope="row">
                              <span className="site-head">
                                <span
                                  className="swatch"
                                  style={{ background: e.color }}
                                  aria-hidden="true"
                                />
                                <span>{e.site.name}</span>
                              </span>
                            </th>
                            <td>{fmtLat(e.site)}</td>
                            <td>{e.site.region}</td>
                            <td>{e.site.point_source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>

              <LunarMap
                sites={catalog}
                referenceSites={referenceSites}
                selected={selected}
                colors={SITE_COLORS}
                onToggle={toggleSite}
              />

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
                <div className="cursor-steps" role="group" aria-label="Step the time cursor">
                  {[
                    [-24, '−1 day', 'Back one day'],
                    [-1, '−1 h', 'Back one hour'],
                    [1, '+1 h', 'Forward one hour'],
                    [24, '+1 day', 'Forward one day'],
                  ].map(([d, label, name]) => {
                    const stepN = Math.round((Number(d) * 60) / (entries[0]?.data.step_minutes ?? 60))
                    const next = Math.min(times.length - 1, Math.max(0, cursor + stepN))
                    return (
                      <button key={String(label)} type="button" aria-label={String(name)}
                        disabled={next === cursor}
                        onClick={() => setCursor(next)}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <section className="block">
                <h2>Horizon view</h2>
                <p className="muted section-sub">
                  A 360° view from each site at the cursor time.
                </p>
                <ul className="legend-row legend-row--horizon" aria-label="Horizon view legend">
                  <li><i className="lg lg--terrain" />{terrain ? 'Terrain horizon' : 'Flat horizon (0°)'}</li>
                  {terrain && <li><i className="lg lg--far" />Ignoring ground &lt; 200 m</li>}
                  <li><i className="lg lg--sun" />Sun path</li>
                  <li><i className="lg lg--earth" />Earth path</li>
                  <li><i className="lg lg--hidden" />Hidden (dashed disc)</li>
                </ul>
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
                <p className="muted section-sub">
                  {terrain
                    ? 'Solid: elevation. Dashed, same colour: terrain horizon in that direction. Visible while solid is above dashed.'
                    : 'Visible while the line is above 0°.'}
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
