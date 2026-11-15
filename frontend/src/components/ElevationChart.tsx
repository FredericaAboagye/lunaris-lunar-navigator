import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmtDay, fmtUtc } from '../lib'
import type { Entry, Mode } from './types'

type Props = {
  entries: Entry[]
  body: 'sun' | 'earth'
  cursorIndex: number
  mode: Mode
}

export default function ElevationChart({
  entries,
  body,
  cursorIndex,
  mode,
}: Props) {
  const terrain = mode === 'terrain'
  const times = entries[0].data.times
  const rows = times.map((t, i) => {
    const row: Record<string, number> = { t: Date.parse(t) }
    for (const e of entries) {
      row[e.site.id] = e.data[body].elevation_deg[i]
      if (terrain) {
        row[`${e.site.id}:h`] = e.data[body].terrain_horizon_deg[i]
      }
    }
    return row
  })
  const label = body === 'sun' ? 'Sun' : 'Earth'
  const all = entries.flatMap(e =>
    terrain
      ? [...e.data[body].elevation_deg, ...e.data[body].terrain_horizon_deg]
      : e.data[body].elevation_deg
  )
  const lo = Math.min(...all, -1)
  const hi = Math.max(...all, 1)
  const step = hi - lo > 12 ? 5 : 2
  const yMin = Math.floor(lo / step) * step
  const yMax = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = yMin; v <= yMax; v += step) ticks.push(v)

  return (
    <div
      className="chart"
      role="img"
      aria-label={`${label} elevation and ${
        terrain ? 'terrain' : 'geometric'
      } horizon over time for ${entries
        .map(e => e.site.name)
        .join(', ')}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
        >
          <CartesianGrid stroke="#dfe1e2" vertical={false} />
          {!terrain && (
            <ReferenceArea
              y2={0}
              fill="#1b1b1b"
              fillOpacity={0.05}
              ifOverflow="extendDomain"
            />
          )}
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtDay}
            stroke="#565c65"
            tick={{ fontSize: 12 }}
            minTickGap={36}
          />
          <YAxis
            stroke="#565c65"
            tick={{ fontSize: 12 }}
            tickFormatter={v => `${v}°`}
            width={44}
            domain={[yMin, yMax]}
            ticks={ticks}
          />
          <Tooltip
            labelFormatter={v => `${fmtUtc(new Date(Number(v)).toISOString())} UTC`}
            formatter={(value, name) => [
              `${Number(value).toFixed(2)}°`,
              String(name),
            ]}
            contentStyle={{
              borderRadius: 4,
              border: '1px solid #a9aeb1',
              fontSize: 13,
            }}
          />
          <Legend verticalAlign="top" height={28} iconType="plainline" />
          <ReferenceLine
            y={0}
            stroke={terrain ? '#a9aeb1' : '#1b1b1b'}
            strokeWidth={terrain ? 1 : 1.5}
            label={{
              value: terrain ? '0° (smooth sphere)' : 'Horizon',
              position: 'insideBottomRight',
              fill: '#565c65',
              fontSize: 11,
            }}
          />
          <ReferenceLine
            x={rows[cursorIndex]?.t}
            stroke="#fc3d21"
            strokeDasharray="4 3"
          />
          {entries.map(e => (
            <Line
              key={e.site.id}
              dataKey={e.site.id}
              name={e.site.name}
              stroke={e.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              type="monotone"
              isAnimationActive={false}
            />
          ))}
          {terrain &&
            entries.map(e => (
              <Line
                key={`${e.site.id}:h`}
                dataKey={`${e.site.id}:h`}
                name={`${e.site.name} terrain horizon`}
                stroke={e.color}
                strokeWidth={1.25}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                type="linear"
                legendType="none"
                isAnimationActive={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
