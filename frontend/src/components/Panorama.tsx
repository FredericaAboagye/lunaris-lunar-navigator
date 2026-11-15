import { useEffect, useRef, useState } from 'react'
import { fmtDeg, fmtUtc } from '../lib'
import {
  CARDINALS,
  compassName,
  delta,
  inView,
  norm,
  rangeLabel,
  relAz,
  viewSpan,
  windowStart,
} from '../logic/panorama'
import { explainVisibility, type Explanation } from '../logic/visibility'
import type { Entry, Mode } from './types'

const W = 720
const H = 240
const PAD = { l: 48, r: 10, t: 12, b: 30 }
const PLOT_W = W - PAD.l - PAD.r
const OV_H = 64
const SUN = '#d9a400'
const EARTH = '#1a5f9e'
const SUN_R = 0.2666
const EARTH_R = 0.95
const KEY_STEP = 15
const BUTTON_STEP = 45

type Props = { entry: Entry; cursorIndex: number; mode: Mode }

function Disc(p: {
  cx: number
  cy: number
  r: number
  color: string
  visible: boolean
}) {
  // Hidden bodies are drawn as dashed outlines "behind" the horizon.
  return p.visible ? (
    <circle cx={p.cx} cy={p.cy} r={p.r} fill={p.color}
      stroke="#fff" strokeWidth="1.5" />
  ) : (
    <circle cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke={p.color}
      strokeWidth="2" strokeDasharray="3 2" />
  )
}

function Readout({
  body,
  dot,
  elevation,
  azimuth,
  horizon,
  mode,
  e,
}: {
  body: string
  dot: string
  elevation: number
  azimuth: number
  horizon: number
  mode: Mode
  e: Explanation
}) {
  const state = e.visible === null ? 'unknown' : e.visible ? 'up' : 'down'
  return (
    <div className="readout">
      <p className="readout__head">
        <i className={`dot ${dot}`} aria-hidden="true" />
        <strong>{body}</strong>{' '}
        <span className={`readout__state readout__state--${state}`}>
          {e.label}
        </span>
      </p>
      <dl className="readout__nums">
        <div>
          <dt>Azimuth</dt>
          <dd>
            {Math.round(norm(azimuth))}° {compassName(azimuth)}
          </dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd>{fmtDeg(elevation)}</dd>
        </div>
        <div>
          <dt>{mode === 'terrain' ? 'Terrain horizon' : 'Reference horizon'}</dt>
          <dd>{fmtDeg(horizon)}</dd>
        </div>
        <div>
          <dt>Clearance</dt>
          <dd>{fmtDeg(elevation - horizon)}</dd>
        </div>
      </dl>
      <p className="readout__reason">{e.reason}</p>
    </div>
  )
}

export default function Panorama({ entry, cursorIndex, mode }: Props) {
  const { site, data, color } = entry
  const terrain = mode === 'terrain'
  const prof = data.horizon_profile
  const step = prof.azimuth_deg[1] - prof.azimuth_deg[0]
  const i = cursorIndex

  const sunAz = data.sun.azimuth_deg[i]
  const sunEl = data.sun.elevation_deg[i]
  const earthAz = data.earth.azimuth_deg[i]
  const earthEl = data.earth.elevation_deg[i]
  const sunH = terrain ? data.sun.terrain_horizon_deg[i] : 0
  const earthH = terrain ? data.earth.terrain_horizon_deg[i] : 0
  const complete = site.coverage.complete
  const sunE = explainVisibility('Sun', sunEl, sunH, mode, complete)
  const earthE = explainVisibility('Earth', earthEl, earthH, mode, complete)

  // Width-driven span: full 360° where it stays readable, a focused
  // window plus overview on narrow screens.
  const figRef = useRef<HTMLElement>(null)
  const [plotPx, setPlotPx] = useState(720)
  useEffect(() => {
    const el = figRef.current
    if (!el) return
    // Plot width = figure content width (minus 2 × 1 rem padding) scaled to
    // the plotting area inside the SVG (excluding the y-axis gutter).
    const measure = () => setPlotPx(((el.clientWidth - 32) * PLOT_W) / W)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const span = viewSpan(plotPx)
  const focused = span < 360

  // Initial direction: towards the Sun, rounded, so something useful is in
  // view; afterwards only the user moves the view.
  const [center, setCenter] = useState(() => Math.round(norm(sunAz) / 15) * 15)
  const [announce, setAnnounce] = useState('')
  const c = focused ? center : 180
  const start = focused ? windowStart(c, span) : 0

  function moveTo(next: number, how: string) {
    const n = norm(Math.round(next))
    setCenter(n)
    setAnnounce(`${site.name}: ${how}. ${rangeLabel(n, span)}.`)
  }

  // y scale shared by focused view and overview
  const values = [
    ...prof.full_deg,
    ...data.sun.elevation_deg,
    ...data.earth.elevation_deg,
    0,
  ]
  const lo = Math.floor(Math.min(...values) - 0.5)
  const hi = Math.ceil(Math.max(...values) + 0.5)
  const y = (el: number) =>
    PAD.t + ((hi - el) / (hi - lo)) * (H - PAD.t - PAD.b)
  const degPx = (H - PAD.t - PAD.b) / (hi - lo)
  const stretch = degPx / (PLOT_W / span)

  // Focused view geometry (linear in true azimuth from the window start).
  const x = (az: number) => PAD.l + (relAz(az, start) / span) * PLOT_W
  const horizonAt = (vals: number[], az: number) => {
    const p = norm(az) / step
    const k = Math.floor(p)
    const f = p - k
    return vals[k % vals.length] * (1 - f) + vals[(k + 1) % vals.length] * f
  }
  const ridge = (vals: number[]) => {
    let d = ''
    for (let r = 0; r <= span; r += 1) {
      const az = start + r
      d += `${r ? 'L' : 'M'}${(PAD.l + (r / span) * PLOT_W).toFixed(1)} ${y(horizonAt(vals, az)).toFixed(1)} `
    }
    return d
  }
  const silhouette = terrain
    ? `${ridge(prof.full_deg)} L${W - PAD.r} ${H - PAD.b} L${PAD.l} ${H - PAD.b} Z`
    : `M${PAD.l} ${y(0)} L${W - PAD.r} ${y(0)} L${W - PAD.r} ${H - PAD.b} L${PAD.l} ${H - PAD.b} Z`
  const track = (az: number[], el: number[]) => {
    let d = ''
    let pen = false
    let prev = 0
    for (let k = 0; k < az.length; k++) {
      const r = relAz(az[k], start)
      const ok = span >= 360 ? true : r <= span
      const jump = pen && Math.abs(r - prev) > span / 2
      if (!ok || jump) {
        pen = false
        if (!ok) continue
      }
      d += `${pen ? 'L' : 'M'}${x(az[k]).toFixed(1)} ${y(el[k]).toFixed(1)} `
      pen = true
      prev = r
    }
    return d
  }

  // Direction ticks every 45° that fall inside the window.
  const ticksAz: number[] = []
  for (let a = 0; a < 360; a += 45) {
    if (inView(a, c, span) || span >= 360) ticksAz.push(a)
  }
  if (span >= 360) ticksAz.push(360)

  const yTicks: number[] = []
  for (let v = lo; v <= hi; v += hi - lo > 8 ? 2 : 1) yTicks.push(v)

  const offView = (az: number, label: string, colorFill: string) => {
    if (!focused || inView(az, c, span)) return null
    const d = delta(c, az)
    const right = d > 0
    const tx = right ? W - PAD.r - 4 : PAD.l + 4
    return (
      <text x={tx} y={PAD.t + 16} textAnchor={right ? 'end' : 'start'}
        fontSize="15" fontWeight="700" fill={colorFill}>
        {right ? `${label} ${Math.round(norm(az))}° ▶` : `◀ ${label} ${Math.round(norm(az))}°`}
      </text>
    )
  }

  // Swipe: horizontal drags rotate; vertical gestures stay with the page
  // (touch-action: pan-y in CSS).
  const drag = useRef<{ x: number; y: number; c: number; on: boolean } | null>(null)
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!focused) return
    drag.current = { x: e.clientX, y: e.clientY, c: center, on: false }
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return
      d.on = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    const w = e.currentTarget.clientWidth * (PLOT_W / W)
    setCenter(norm(Math.round(d.c - (dx * span) / w)))
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (d?.on) setAnnounce(`${site.name}: view rotated. ${rangeLabel(center, span)}.`)
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!focused) return
    if (e.key === 'ArrowLeft') moveTo(center - KEY_STEP, `rotated ${KEY_STEP}° left`)
    else if (e.key === 'ArrowRight') moveTo(center + KEY_STEP, `rotated ${KEY_STEP}° right`)
    else if (e.key === 'Home') moveTo(0, 'facing north')
    else return
    e.preventDefault()
  }

  const summary = `${site.name} at ${fmtUtc(data.times[i])} UTC. Sun: ${sunE.label}. Earth: ${earthE.label}.`

  // Overview strip (full 360°, compact): silhouette, bodies, view window.
  const ox = (az: number) => (norm(az) / 360) * W
  const oy = (el: number) => 4 + ((hi - el) / (hi - lo)) * (OV_H - 18)
  const ovRidge =
    prof.azimuth_deg.map((az, k) => `${k ? 'L' : 'M'}${ox(az).toFixed(1)} ${oy(prof.full_deg[k]).toFixed(1)}`).join(' ') +
    ` L${W} ${oy(prof.full_deg[0]).toFixed(1)}`
  const ovSil = terrain
    ? `${ovRidge} L${W} ${OV_H - 14} L0 ${OV_H - 14} Z`
    : `M0 ${oy(0)} L${W} ${oy(0)} L${W} ${OV_H - 14} L0 ${OV_H - 14} Z`
  const winRects = (() => {
    if (!focused) return []
    const a = ox(start)
    const w = (span / 360) * W
    return a + w <= W ? [[a, w]] : [[a, W - a], [0, a + w - W]]
  })()

  return (
    <figure className="panorama" ref={figRef}>
      <figcaption>
        <span className="swatch" style={{ background: color }} aria-hidden="true" />
        {site.name}
        <span className="panorama__meta">
          {fmtUtc(data.times[i])} UTC · observer {data.height_m} m above ground
        </span>
      </figcaption>
      <p className="usa-sr-only">{summary}</p>

      {focused && (
        <div className="pano-nav" role="group" aria-label={`View direction for ${site.name}`}>
          <button type="button" className="pano-nav__btn"
            aria-label={`Rotate view ${BUTTON_STEP}° left`}
            onClick={() => moveTo(center - BUTTON_STEP, `rotated ${BUTTON_STEP}° left`)}>
            ◀
          </button>
          {CARDINALS.map(d => (
            <button key={d.label} type="button" className="pano-nav__btn"
              aria-pressed={norm(center) === d.az}
              aria-label={`Face ${d.name}`}
              onClick={() => moveTo(d.az, `facing ${d.name}`)}>
              {d.label}
            </button>
          ))}
          <button type="button" className="pano-nav__btn"
            aria-label={`Rotate view ${BUTTON_STEP}° right`}
            onClick={() => moveTo(center + BUTTON_STEP, `rotated ${BUTTON_STEP}° right`)}>
            ▶
          </button>
          <button type="button" className="pano-nav__btn pano-nav__btn--body"
            aria-label="Centre view on the Sun"
            onClick={() => moveTo(sunAz, 'centred on the Sun')}>
            <i className="dot dot--sun" aria-hidden="true" />Sun
          </button>
          <button type="button" className="pano-nav__btn pano-nav__btn--body"
            aria-label="Centre view on Earth"
            onClick={() => moveTo(earthAz, 'centred on Earth')}>
            <i className="dot dot--earth" aria-hidden="true" />Earth
          </button>
        </div>
      )}
      {focused && <p className="pano-range">{rangeLabel(center, span)}</p>}

      <div
        className={`pano-view${focused ? ' pano-view--focused' : ''}`}
        tabIndex={focused ? 0 : undefined}
        role={focused ? 'group' : undefined}
        aria-label={
          focused
            ? `Horizon view for ${site.name}. ${rangeLabel(center, span)}. Left and right arrow keys rotate; Home faces north.`
            : undefined
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <svg viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Horizon chart. ${summary}`}>
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)}
                stroke={v === 0 ? '#a9aeb1' : '#eef0f1'} />
              <text x={PAD.l - 6} y={y(v) + 5} textAnchor="end"
                fontSize="15" fill="#3d4551">{v}°</text>
            </g>
          ))}
          {ticksAz.map(a => (
            <text key={a} x={span >= 360 ? PAD.l + (a / 360) * PLOT_W : x(a)}
              y={H - 8} textAnchor="middle" fontSize="16" fontWeight="600"
              fill="#3d4551">
              {compassName(a)}
            </text>
          ))}
          <path d={track(data.sun.azimuth_deg, data.sun.elevation_deg)}
            fill="none" stroke={SUN} strokeOpacity="0.55" strokeWidth="2" />
          <path d={track(data.earth.azimuth_deg, data.earth.elevation_deg)}
            fill="none" stroke={EARTH} strokeOpacity="0.55" strokeWidth="2" />
          <path d={silhouette} fill="#5d5d52" fillOpacity="0.82" />
          {terrain && (
            <path d={ridge(prof.far_field_deg)} fill="none"
              stroke="#fff" strokeOpacity="0.7" strokeDasharray="3 3" />
          )}
          {inView(sunAz, c, span) && (
            <Disc cx={x(sunAz)} cy={y(sunEl)} r={Math.max(SUN_R * degPx, 5)}
              color={SUN} visible={sunE.visible !== false} />
          )}
          {inView(earthAz, c, span) && (
            <Disc cx={x(earthAz)} cy={y(earthEl)} r={Math.max(EARTH_R * degPx, 5)}
              color={EARTH} visible={earthE.visible !== false} />
          )}
          {offView(sunAz, 'Sun', '#7a5c00')}
          {offView(earthAz, 'Earth', EARTH)}
        </svg>
      </div>

      {focused && (
        <svg className="pano-overview" viewBox={`0 0 ${W} ${OV_H}`}
          role="img"
          aria-label={`360° overview. ${rangeLabel(center, span)}.`}>
          <path d={ovSil} fill="#5d5d52" fillOpacity="0.6" />
          {winRects.map(([a, w], k) => (
            <rect key={k} x={a} y={1} width={w} height={OV_H - 16} rx="3"
              fill="none" stroke="#0b4778" strokeWidth="3" />
          ))}
          <circle cx={ox(sunAz)} cy={oy(sunEl)} r="6" fill={SUN} stroke="#fff" />
          <circle cx={ox(earthAz)} cy={oy(earthEl)} r="6" fill={EARTH} stroke="#fff" />
          {['N', 'E', 'S', 'W'].map((l, k) => (
            <text key={l} x={Math.max(8, Math.min(W - 8, ox(k * 90)))} y={OV_H - 2}
              textAnchor="middle" fontSize="13" fill="#3d4551">{l}</text>
          ))}
        </svg>
      )}

      <p className="panorama__scale">
        Vertical axis stretched ≈{Math.round(stretch)}× vs azimuth
        {focused ? ` in this ${span}° view` : ''}; low hills look steep.
        Discs use the vertical scale.
      </p>
      <p className="usa-sr-only" aria-live="polite">{announce}</p>

      <div className="readouts">
        <Readout body="Sun" dot="dot--sun" elevation={sunEl} azimuth={sunAz}
          horizon={sunH} mode={mode} e={sunE} />
        <Readout body="Earth" dot="dot--earth" elevation={earthEl} azimuth={earthAz}
          horizon={earthH} mode={mode} e={earthE} />
      </div>
    </figure>
  )
}
