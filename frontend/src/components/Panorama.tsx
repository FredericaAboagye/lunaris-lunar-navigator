import { fmtDeg } from '../lib'
import { explainVisibility, type Explanation } from '../logic/visibility'
import type { Entry, Mode } from './types'

const W = 720
const H = 240
const PAD = { l: 48, r: 10, t: 12, b: 30 }
const SUN = '#d9a400'
const EARTH = '#1a5f9e'
const SUN_R = 0.2666
const EARTH_R = 0.95

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
  horizon,
  mode,
  e,
}: {
  body: string
  dot: string
  elevation: number
  horizon: number
  mode: Mode
  e: Explanation
}) {
  const state =
    e.visible === null ? 'unknown' : e.visible ? 'up' : 'down'
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
  const i = cursorIndex

  const values = [
    ...prof.full_deg,
    ...data.sun.elevation_deg,
    ...data.earth.elevation_deg,
    0,
  ]
  const lo = Math.floor(Math.min(...values) - 0.5)
  const hi = Math.ceil(Math.max(...values) + 0.5)
  const x = (az: number) => PAD.l + (az / 360) * (W - PAD.l - PAD.r)
  const y = (el: number) =>
    PAD.t + ((hi - el) / (hi - lo)) * (H - PAD.t - PAD.b)
  const degPx = (H - PAD.t - PAD.b) / (hi - lo)
  const azPx = (W - PAD.l - PAD.r) / 360
  const stretch = degPx / azPx

  const ridge = (vals: number[]) =>
    prof.azimuth_deg
      .map((az, k) => `${k ? 'L' : 'M'}${x(az).toFixed(1)} ${y(vals[k]).toFixed(1)}`)
      .join(' ') + ` L${x(360)} ${y(vals[0]).toFixed(1)}`
  const silhouette = terrain
    ? `${ridge(prof.full_deg)} L${x(360)} ${H - PAD.b} L${x(0)} ${H - PAD.b} Z`
    : `M${x(0)} ${y(0)} L${x(360)} ${y(0)} L${x(360)} ${H - PAD.b} L${x(0)} ${H - PAD.b} Z`

  const track = (az: number[], el: number[]) => {
    let d = ''
    for (let k = 0; k < az.length; k++) {
      const jump = k > 0 && Math.abs(az[k] - az[k - 1]) > 180
      d += `${k === 0 || jump ? 'M' : 'L'}${x(az[k]).toFixed(1)} ${y(el[k]).toFixed(1)} `
    }
    return d
  }

  const sunAz = data.sun.azimuth_deg[i]
  const sunEl = data.sun.elevation_deg[i]
  const earthAz = data.earth.azimuth_deg[i]
  const earthEl = data.earth.elevation_deg[i]
  const sunH = terrain ? data.sun.terrain_horizon_deg[i] : 0
  const earthH = terrain ? data.earth.terrain_horizon_deg[i] : 0
  const complete = site.coverage.complete
  const sunE = explainVisibility('Sun', sunEl, sunH, mode, complete)
  const earthE = explainVisibility('Earth', earthEl, earthH, mode, complete)
  const ticks = []
  for (let v = lo; v <= hi; v += hi - lo > 8 ? 2 : 1) ticks.push(v)

  return (
    <figure className="panorama">
      <figcaption>
        <span
          className="swatch"
          style={{ background: color }}
          aria-hidden="true"
        />
        {site.name}
        <span className="panorama__meta">
          Observer {data.height_m} m above ground
        </span>
      </figcaption>
      <div
        className="panorama__scroll"
        role="region"
        aria-label={`Horizon panorama for ${site.name}; scroll sideways on small screens`}
        tabIndex={0}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Horizon panorama for ${site.name}. Sun: ${sunE.label}. Earth: ${earthE.label}.`}
        >
          {ticks.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)}
                stroke={v === 0 ? '#a9aeb1' : '#eef0f1'} />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end"
                fontSize="15" fill="#3d4551">{v}°</text>
            </g>
          ))}
          {['N', 'E', 'S', 'W', 'N'].map((l, k) => (
            <text key={k} x={x(k * 90)} y={H - 8} textAnchor="middle"
              fontSize="16" fontWeight="600" fill="#3d4551">{l}</text>
          ))}
          <path d={track(data.sun.azimuth_deg, data.sun.elevation_deg)}
            fill="none" stroke={SUN} strokeOpacity="0.5" strokeWidth="1.5" />
          <path d={track(data.earth.azimuth_deg, data.earth.elevation_deg)}
            fill="none" stroke={EARTH} strokeOpacity="0.5" strokeWidth="1.5" />
          <path d={silhouette} fill="#5d5d52" fillOpacity="0.82" />
          {terrain && (
            <path d={ridge(prof.far_field_deg)} fill="none"
              stroke="#fff" strokeOpacity="0.7" strokeDasharray="3 3" />
          )}
          <Disc cx={x(sunAz)} cy={y(sunEl)}
            r={Math.max(SUN_R * degPx, 4)} color={SUN}
            visible={sunE.visible !== false} />
          <Disc cx={x(earthAz)} cy={y(earthEl)}
            r={Math.max(EARTH_R * degPx, 4)} color={EARTH}
            visible={earthE.visible !== false} />
        </svg>
      </div>
      <p className="panorama__swipe" aria-hidden="true">
        Swipe sideways to see all 360°.
      </p>
      <p className="panorama__scale">
        Vertical axis stretched ≈{Math.round(stretch)}× vs azimuth; low
        hills look steep. Discs use the vertical scale.
      </p>
      <div className="readouts">
        <Readout body="Sun" dot="dot--sun" elevation={sunEl}
          horizon={sunH} mode={mode} e={sunE} />
        <Readout body="Earth" dot="dot--earth" elevation={earthEl}
          horizon={earthH} mode={mode} e={earthE} />
      </div>
    </figure>
  )
}
