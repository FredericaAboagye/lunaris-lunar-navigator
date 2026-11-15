import { useEffect, useState } from 'react'
import { fetchAnalysis, type Analysis, type Mode, type Site } from '../api'
import { fmtHours } from '../lib'
import { WINDOWS, windowStarts } from '../logic/windows'

const MAX_IN_FLIGHT = 2

type Props = {
  sites: { site: Site; color: string }[]
  start: string
  days: number
  height: number
  mode: Mode
  onOpen: (start: string) => void
}

const fmtDate = (iso: string, plusDays = 0) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + plusDays * 864e5)
    .toLocaleDateString('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

async function pool<T>(jobs: (() => Promise<T>)[], limit: number) {
  const results: T[] = new Array(jobs.length)
  let next = 0
  async function worker() {
    while (next < jobs.length) {
      const k = next++
      results[k] = await jobs[k]()
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results
}

export default function WindowCompare({
  sites,
  start,
  days,
  height,
  mode,
  onOpen,
}: Props) {
  const starts = windowStarts(start, days)
  const key = `${sites.map(s => s.site.id).join(',')}|${start}|${days}|${height}`
  const [requested, setRequested] = useState<string | null>(null)
  const [data, setData] = useState<Record<string, Analysis>>({})
  const [error, setError] = useState('')
  const loading =
    requested === key &&
    !error &&
    starts.some(s => sites.some(x => !data[`${x.site.id}|${s}|${height}|${days}`]))

  useEffect(() => {
    if (requested !== key) return
    let cancelled = false
    setError('')
    const jobs = starts.flatMap(s =>
      sites.map(({ site }) => async () => {
        const a = await fetchAnalysis(site.id, s, days, height)
        if (!cancelled) {
          setData(d => ({ ...d, [`${site.id}|${s}|${height}|${days}`]: a }))
        }
        return a
      })
    )
    pool(jobs, MAX_IN_FLIGHT).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, key])

  const modelLabel = mode === 'terrain' ? 'LOLA terrain horizon' : 'smooth-sphere horizon (0°)'

  return (
    <section className="block" aria-labelledby="windows-heading">
      <h2 id="windows-heading">Compare date windows</h2>
      <p className="muted">
        {WINDOWS} consecutive {days}-day windows starting {fmtDate(start)}{' '}
        00:00 UTC, for the selected sites. Same observer height ({height} m),{' '}
        {modelLabel} and definitions as above. This compares the windows
        listed; it is not a search for an optimal date.
      </p>
      {requested !== key ? (
        <button
          type="button"
          className="usa-button usa-button--outline"
          onClick={() => setRequested(key)}
        >
          Compare {starts.length} windows ({starts.length * sites.length}{' '}
          analyses)
        </button>
      ) : (
        <>
          {loading && (
            <p className="muted" role="status">
              Loading window comparison…
            </p>
          )}
          {error && (
            <div className="usa-alert usa-alert--error usa-alert--slim" role="alert">
              <div className="usa-alert__body">
                <p className="usa-alert__text">
                  Window comparison failed: {error}{' '}
                  <button
                    type="button"
                    className="usa-button usa-button--unstyled"
                    onClick={() => {
                      setRequested(null)
                      setTimeout(() => setRequested(key), 0)
                    }}
                  >
                    Retry
                  </button>
                </p>
              </div>
            </div>
          )}
          <div
            className="table-scroll"
            role="region"
            aria-label="Date window comparison table"
            tabIndex={0}
          >
            <table className="usa-table usa-table--borderless window-table">
              <caption className="usa-sr-only">
                Mean solar disk visible, longest darkness and longest Earth
                outage for each window and site
              </caption>
              <thead>
                <tr>
                  <th scope="col" rowSpan={2}>
                    Window (UTC)
                  </th>
                  {sites.map(({ site, color }) => (
                    <th scope="colgroup" colSpan={3} key={site.id}>
                      <span className="swatch" style={{ background: color }}
                        aria-hidden="true" />
                      {site.name}
                    </th>
                  ))}
                </tr>
                <tr>
                  {sites.flatMap(({ site }) => [
                    <th scope="col" key={`${site.id}s`}>Sunlight</th>,
                    <th scope="col" key={`${site.id}d`}>Longest darkness</th>,
                    <th scope="col" key={`${site.id}o`}>Longest Earth outage</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {starts.map(s => (
                  <tr key={s} className={s === start ? 'is-current' : undefined}>
                    <th scope="row">
                      {fmtDate(s)} – {fmtDate(s, days)}
                      {s === start ? (
                        <span className="row-hint">Shown above</span>
                      ) : (
                        <button
                          type="button"
                          className="usa-button usa-button--unstyled open-window"
                          onClick={() => onOpen(s)}
                          aria-label={`Open the window starting ${fmtDate(s)} in the main view`}
                        >
                          Open in main view
                        </button>
                      )}
                    </th>
                    {sites.flatMap(({ site }) => {
                      const a = data[`${site.id}|${s}|${height}|${days}`]
                      const m = a?.metrics[mode]
                      return [
                        <td key={`${site.id}s`}>
                          {m ? `${m.mean_sun_disk_pct.toFixed(1)}%` : '…'}
                        </td>,
                        <td key={`${site.id}d`}>
                          {m ? fmtHours(m.longest_darkness_hours) : '…'}
                        </td>,
                        <td key={`${site.id}o`}>
                          {m ? fmtHours(m.longest_comms_blackout_hours) : '…'}
                        </td>,
                      ]
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Sunlight = mean solar disk visible. Longest darkness and longest
            Earth outage are the longest continuous stretches within each
            window, so a stretch crossing a window boundary is split.
          </p>
        </>
      )}
    </section>
  )
}
