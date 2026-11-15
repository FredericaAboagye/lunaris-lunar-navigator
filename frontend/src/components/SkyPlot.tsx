import type { Analysis, Site } from '../api'
import { fmtDeg } from '../lib'

type Props = {
  site: Site
  data: Analysis
  color: string
  cursorIndex: number
}

const R = 100
const C = 120

// Polar projection of the low-elevation sky (polar sites never see
// bodies high overhead): rim = -5° (just below horizon), centre = MAX_EL.
const MAX_EL = 30

function project(az: number, el: number) {
  const clamped = Math.max(-5, Math.min(el, MAX_EL))
  const r = R * (1 - (clamped + 5) / (MAX_EL + 5))
  const rad = (az * Math.PI) / 180
  // North up, azimuth increasing clockwise.
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) }
}

function path(az: number[], el: number[]) {
  let d = ''
  let pen = false
  for (let i = 0; i < az.length; i++) {
    if (el[i] < -5) {
      pen = false
      continue
    }
    const p = project(az[i], el[i])
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `
    pen = true
  }
  return d
}

export default function SkyPlot({
  site,
  data,
  color,
  cursorIndex,
}: Props) {
  const i = cursorIndex
  const sunEl = data.sun.elevation_deg[i]
  const earthEl = data.earth.elevation_deg[i]
  const sun = project(data.sun.azimuth_deg[i], sunEl)
  const earth = project(data.earth.azimuth_deg[i], earthEl)
  const horizonR = R * (1 - 5 / (MAX_EL + 5))
  const rings = [10, 20, 30].map(
    el => R * (1 - (el + 5) / (MAX_EL + 5))
  )

  return (
    <figure className="sky">
      <figcaption>
        <span
          className="swatch"
          style={{ background: color }}
          aria-hidden="true"
        />
        {site.name}
      </figcaption>
      <svg
        viewBox="0 0 240 240"
        role="img"
        aria-label={`Sky plot for ${site.name}: Sun at ${fmtDeg(
          sunEl
        )}, Earth at ${fmtDeg(earthEl)} elevation`}
      >
        <circle cx={C} cy={C} r={R} fill="#f6f7f8" stroke="#a9aeb1" />
        {rings.map((r, k) => (
          <circle
            key={k}
            cx={C}
            cy={C}
            r={r}
            fill="none"
            stroke="#dfe1e2"
          />
        ))}
        <circle
          cx={C}
          cy={C}
          r={horizonR}
          fill="none"
          stroke="#1b1b1b"
          strokeWidth="1.5"
        />
        <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#dfe1e2" />
        <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#dfe1e2" />
        {(['N', 'E', 'S', 'W'] as const).map((l, k) => {
          const a = (k * Math.PI) / 2
          return (
            <text
              key={l}
              x={C + (R + 10) * Math.sin(a)}
              y={C - (R + 10) * Math.cos(a) + 4}
              textAnchor="middle"
              fontSize="11"
              fill="#565c65"
            >
              {l}
            </text>
          )
        })}
        <path
          d={path(data.sun.azimuth_deg, data.sun.elevation_deg)}
          fill="none"
          stroke="#d9a400"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <path
          d={path(data.earth.azimuth_deg, data.earth.elevation_deg)}
          fill="none"
          stroke="#1a5f9e"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <g opacity={sunEl > 0 ? 1 : 0.35}>
          <circle cx={sun.x} cy={sun.y} r="7" fill="#d9a400"
            stroke="#fff" strokeWidth="1.5" />
        </g>
        <g opacity={earthEl > 0 ? 1 : 0.35}>
          <circle cx={earth.x} cy={earth.y} r="6" fill="#1a5f9e"
            stroke="#fff" strokeWidth="1.5" />
        </g>
      </svg>
      <dl className="sky__readout">
        <div>
          <dt><i className="dot dot--sun" />Sun</dt>
          <dd>
            {fmtDeg(sunEl)}{' '}
            <span className={sunEl > 0 ? 'up' : 'down'}>
              {sunEl > 0 ? 'up' : 'below'}
            </span>
          </dd>
        </div>
        <div>
          <dt><i className="dot dot--earth" />Earth</dt>
          <dd>
            {fmtDeg(earthEl)}{' '}
            <span className={earthEl > 0 ? 'up' : 'down'}>
              {earthEl > 0 ? 'up' : 'below'}
            </span>
          </dd>
        </div>
      </dl>
    </figure>
  )
}
