import { fmtDay } from '../lib'
import type { Entry, Mode } from './types'

const SUN = '#d9a400'
const EARTH = '#1a5f9e'
const BOTH = '#1a7f5a'
const OFF = '#e6e8ea'

function Strip({
  label,
  intervals,
  total,
  color,
  cursorPct,
}: {
  label: string
  intervals: { s: number; e: number }[]
  total: number
  color: string
  cursorPct: number
}) {
  return (
    <div className="strip">
      <span className="strip__label">{label}</span>
      <svg
        viewBox="0 0 1000 18"
        preserveAspectRatio="none"
        className="strip__bar"
        role="img"
        aria-label={`${label} availability timeline`}
      >
        <rect width="1000" height="18" fill={OFF} />
        {intervals.map((iv, i) => (
          <rect
            key={i}
            x={(iv.s / total) * 1000}
            width={Math.max(((iv.e - iv.s) / total) * 1000, 1)}
            height="18"
            fill={color}
          />
        ))}
        <rect
          x={cursorPct * 10 - 1}
          width="2"
          height="18"
          fill="#fc3d21"
        />
      </svg>
    </div>
  )
}

export default function Availability({
  entries,
  cursorIndex,
  mode,
}: {
  entries: Entry[]
  cursorIndex: number
  mode: Mode
}) {
  const startMs = Date.parse(entries[0].data.start)
  const days = entries[0].data.days
  const total = days * 24
  const toHours = (iso: string) => (Date.parse(iso) - startMs) / 36e5
  const cursorPct =
    (cursorIndex / (entries[0].data.times.length - 1)) * 100
  const ticks = Array.from({ length: 5 }, (_, i) =>
    startMs + (i * days * 864e5) / 4
  )

  return (
    <div className="availability">
      <div className="legend-row" aria-hidden="true">
        <span><i style={{ background: SUN }} />Sun visible</span>
        <span><i style={{ background: EARTH }} />Earth visible</span>
        <span><i style={{ background: BOTH }} />Both</span>
        <span><i style={{ background: OFF }} />Not available</span>
      </div>
      {entries.map(e => {
        const conv = (k: 'sun' | 'earth' | 'both') =>
          e.data.windows[mode][k].map(w => ({
            s: toHours(w.start),
            e: toHours(w.end),
          }))
        return (
          <div className="availability__site" key={e.site.id}>
            <h3>
              <span
                className="swatch"
                style={{ background: e.color }}
                aria-hidden="true"
              />
              {e.site.name}
            </h3>
            <Strip label="Sun" intervals={conv('sun')} total={total}
              color={SUN} cursorPct={cursorPct} />
            <Strip label="Earth" intervals={conv('earth')} total={total}
              color={EARTH} cursorPct={cursorPct} />
            <Strip label="Both" intervals={conv('both')} total={total}
              color={BOTH} cursorPct={cursorPct} />
          </div>
        )
      })}
      <div className="strip strip--axis">
        <span className="strip__label" />
        <div className="axis">
          {ticks.map(t => (
            <span key={t}>{fmtDay(t)}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
