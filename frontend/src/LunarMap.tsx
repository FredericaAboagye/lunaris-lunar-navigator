import { useEffect, useRef, useState } from 'react'
import type { ReferenceSite, Site } from './api'
import { MAX_SITES } from './lib'
import { clusterByScreenDistance, polarKm, type Placed } from './logic/map'

// South-polar stereographic map with the LROC WAC south-pole mosaic
// (integrated from origin/main). Drawn in projected kilometres (east-
// positive longitude, 0° at top), so the camera can frame the pole without
// moving any site: markers stay at their true projected positions and
// overlapping ones are grouped on screen, never displaced.

const IMAGE_HALF_KM = 303.97 // 80°S ring of the 80S mosaic: 2R tan(5°)
const VIEWS = {
  pole: { half: 64, label: 'Pole', detail: 'to 88°S', rings: [89, 88] },
  region: { half: IMAGE_HALF_KM, label: 'Region', detail: 'to 80°S', rings: [85] },
} as const
type ViewKey = keyof typeof VIEWS
const GROUP_PX = 40

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
  const [view, setView] = useState<ViewKey>('pole')
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const chooser = useRef<HTMLDivElement>(null)
  const [px, setPx] = useState(480)
  const full = selected.length >= MAX_SITES
  const { half, rings } = VIEWS[view]

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const measure = () => setPx(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Screen position (percent) from projected km in the current frame.
  const pct = (v: number) => ((v + half) / (2 * half)) * 100
  const inFrame = (p: { x: number; y: number }) =>
    Math.abs(p.x) <= half && Math.abs(p.y) <= half

  const placed: Placed<Site>[] = sites.map(site => ({
    item: site,
    ...polarKm(site.latitude, site.longitude),
  }))
  const groups = clusterByScreenDistance(
    placed.filter(inFrame),
    (2 * half) / px,
    GROUP_PX
  )
  const refs = referenceSites
    .map(r => ({ r, ...polarKm(r.latitude, r.longitude) }))
    .filter(inFrame)
  const offFrame = placed.filter(p => !inFrame(p)).map(p => p.item.name)

  const groupKey = (g: Placed<Site>[]) => g.map(p => p.item.id).join('+')
  const open = groups.find(g => groupKey(g) === openGroup) ?? null

  // Focus moves into the chooser when it opens and back to its group
  // button when it closes. Done in an effect (after React has committed
  // the DOM change) rather than on an animation frame, which may not fire
  // in throttled or background tabs.
  const returnFocusTo = useRef<string | null>(null)
  useEffect(() => {
    if (open) {
      chooser.current?.querySelector('button')?.focus()
    } else if (returnFocusTo.current) {
      document
        .querySelector<HTMLButtonElement>(`[data-group="${returnFocusTo.current}"]`)
        ?.focus()
      returnFocusTo.current = null
    }
  }, [openGroup]) // eslint-disable-line react-hooks/exhaustive-deps

  function closeChooser() {
    returnFocusTo.current = openGroup
    setOpenGroup(null)
  }

  const stateLabel = (s: Site) => {
    const on = selected.includes(s.id)
    if (on) return 'in comparison, select to remove'
    return full ? `not selected; maximum ${MAX_SITES} sites reached` : 'select to compare'
  }

  // A render function, not a nested component: a nested component type
  // would remount on every render and drop keyboard focus after a toggle.
  const renderMarker = (p: Placed<Site>) => {
    const index = selected.indexOf(p.item.id)
    const on = index >= 0
    return (
      <button
        key={p.item.id}
        type="button"
        className={`map-marker${on ? ' is-on' : ''}`}
        style={{
          left: `${pct(p.x)}%`,
          top: `${pct(p.y)}%`,
          ...(on ? { background: colors[index] } : {}),
        }}
        aria-pressed={on}
        disabled={!on && full}
        aria-label={`${p.item.name}: ${stateLabel(p.item)}`}
        onClick={() => onToggle(p.item.id)}
      >
        <span aria-hidden="true">{on ? '✓' : ''}</span>
      </button>
    )
  }

  return (
    <section className="block" aria-labelledby="map-heading">
      <h2 id="map-heading">Where the sites are</h2>
      <p className="muted section-sub">
        South-polar view, 0° longitude at the top. Select a marker to add or
        remove a site; grouped markers open a list. Markers sit at true
        coordinates.
      </p>
      <div className="seg map-view-toggle" role="group" aria-label="Map extent"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {(Object.keys(VIEWS) as ViewKey[]).map(k => (
          <button key={k} type="button" className="seg__btn"
            aria-pressed={view === k}
            onClick={() => { setView(k); setOpenGroup(null) }}>
            {VIEWS[k].label} ({VIEWS[k].detail})
          </button>
        ))}
      </div>

      <div className="lunar-map">
        <div className="lunar-map__col">
          <div className="lunar-map__canvas" ref={canvas}>
            <svg
              viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`}
              role="img"
              aria-label={`Lunar south-pole map, ${VIEWS[view].detail}, with ${sites.length} candidate sites`}
            >
              <rect x={-half} y={-half} width={2 * half} height={2 * half} fill="#0b1427" />
              <image
                href="/lunaris_south_pole_80S.png"
                x={-IMAGE_HALF_KM}
                y={-IMAGE_HALF_KM}
                width={2 * IMAGE_HALF_KM}
                height={2 * IMAGE_HALF_KM}
                preserveAspectRatio="none"
              />
              {rings.map(lat => {
                const r = polarKm(lat, 0).y * -1
                return (
                  <g key={lat}>
                    <circle cx="0" cy="0" r={r} fill="none" stroke="#e6ebf2"
                      strokeWidth={half * 0.004} strokeDasharray={`${half * 0.02} ${half * 0.02}`} opacity="0.75" />
                    <text x={half * 0.02} y={-r - half * 0.015} fill="#fff"
                      fontSize={half * 0.045}>{Math.abs(lat)}°S</text>
                  </g>
                )
              })}
              <circle cx="0" cy="0" r={half * 0.008} fill="#fff" />
              {[['0°', 0, -half * 0.93], ['90°E', half * 0.88, half * 0.015],
                ['180°', 0, half * 0.97], ['90°W', -half * 0.88, half * 0.015]].map(([t, x, y]) => (
                <text key={t as string} x={x as number} y={y as number} textAnchor="middle"
                  fill="#fff" stroke="#0b1427" strokeWidth={half * 0.006}
                  paintOrder="stroke" fontSize={half * 0.045}>{t}</text>
              ))}
              {groups.filter(g => g.length > 1).map(g => {
                const cx = g.reduce((a, p) => a + p.x, 0) / g.length
                const cy = g.reduce((a, p) => a + p.y, 0) / g.length
                return g.map(p => (
                  <g key={`${groupKey(g)}-${p.item.id}`}>
                    <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#fff"
                      strokeWidth={half * 0.005} />
                    <circle cx={p.x} cy={p.y} r={half * 0.012} fill="#fff"
                      stroke="#0b1427" strokeWidth={half * 0.004} />
                  </g>
                ))
              })}
            </svg>

            {refs.map(({ r, x, y }) => (
              <span key={r.id} className="map-ref"
                style={{ left: `${pct(x)}%`, top: `${pct(y)}%` }}
                aria-hidden="true" />
            ))}

            {groups.map(g => {
              if (g.length === 1) return renderMarker(g[0])
              const key = groupKey(g)
              const cx = g.reduce((a, p) => a + p.x, 0) / g.length
              const cy = g.reduce((a, p) => a + p.y, 0) / g.length
              const nOn = g.filter(p => selected.includes(p.item.id)).length
              return (
                <button
                  key={key}
                  type="button"
                  data-group={key}
                  className={`map-group${nOn ? ' has-on' : ''}`}
                  style={{ left: `${pct(cx)}%`, top: `${pct(cy)}%` }}
                  aria-expanded={openGroup === key}
                  aria-controls="map-chooser"
                  aria-label={`${g.length} nearby sites: ${g.map(p => p.item.name).join(', ')}; ${nOn} in comparison. Open list.`}
                  onClick={() => setOpenGroup(openGroup === key ? null : key)}
                >
                  {g.length}
                  {nOn > 0 && <span className="map-group__on" aria-hidden="true">✓{nOn}</span>}
                </button>
              )
            })}
          </div>

          {open && (
            <div
              id="map-chooser"
              className="map-chooser"
              ref={chooser}
              role="group"
              aria-label="Nearby sites"
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeChooser()
                }
              }}
            >
              <p className="map-chooser__title">
                {open.length} sites close together at this scale
              </p>
              <ul>
                {open.map(p => {
                  const index = selected.indexOf(p.item.id)
                  const on = index >= 0
                  return (
                    <li key={p.item.id}>
                      <button
                        type="button"
                        className={`map-chooser__opt${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        disabled={!on && full}
                        onClick={() => onToggle(p.item.id)}
                      >
                        <span className="map-chooser__check" aria-hidden="true"
                          style={on ? { background: colors[index], borderColor: colors[index] } : undefined}>
                          {on ? '✓' : ''}
                        </span>
                        <span className="map-chooser__name">{p.item.name}</span>
                        <span className="map-chooser__coord">
                          {Math.abs(p.item.latitude).toFixed(2)}°S, {p.item.longitude.toFixed(1)}°E
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {full && (
                <p className="map-chooser__note">
                  Maximum {MAX_SITES} sites selected — remove one to add another.
                </p>
              )}
              <button type="button" className="usa-button usa-button--outline map-chooser__close"
                onClick={closeChooser}>
                Close list
              </button>
            </div>
          )}
        </div>

        <div className="lunar-map__legend">
          <h3>Terrain-validated sites</h3>
          <ul>
            {sites.map(s => (
              <li key={s.id}>
                <strong>{s.name}</strong>
                <span>
                  {s.latitude.toFixed(3)}°, {s.longitude.toFixed(3)}°E ·{' '}
                  {selected.includes(s.id) ? '✓ in comparison' : 'not selected'}
                </span>
              </li>
            ))}
          </ul>
          {offFrame.length > 0 && (
            <p className="muted small">
              Outside this view: {offFrame.join(', ')}. Choose “Region”.
            </p>
          )}
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
                Source: {referenceSites[0].source}. Shown as hollow markers
                wherever they fall inside the current view.
              </p>
            </>
          )}
        </div>
      </div>
      <p className="muted small">
        Imagery: NASA LROC WAC south pole mosaic, south-polar stereographic
        projection. Markers are research reference points, not approved
        touchdown locations; imagery is not a landing-hazard assessment.
      </p>
    </section>
  )
}
