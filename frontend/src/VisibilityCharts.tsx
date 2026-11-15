
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Site = {
  name: string
  latitude: number
  longitude: number
}

type Observation = {
  hour: number
  time_utc: string
  azimuth_deg: number
  elevation_deg: number
  above_geometric_horizon: boolean
}

type Timeline = {
  sun: Observation[]
  earth: Observation[]
}

type ChartPoint = {
  time: string
  siteA: number
  siteB: number
}

type Props = {
  siteA: Site
  siteB: Site
  date: string
}

const API =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function fetchTimeline(
  site: Site,
  date: string,
  signal: AbortSignal
): Promise<Timeline> {
  const params = new URLSearchParams({
    lat: String(site.latitude),
    lon: String(site.longitude),
    day: date,
  })

  const response = await fetch(
    `${API}/api/timeline?${params}`,
    { signal }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || `HTTP ${response.status}`)
  }

  const data: Timeline = await response.json()

  if (
    !Array.isArray(data.sun) ||
    !Array.isArray(data.earth) ||
    data.sun.length !== 13 ||
    data.earth.length !== 13
  ) {
    throw new Error('Incomplete NASA timeline response')
  }

  return data
}

function prepareData(
  a: Observation[],
  b: Observation[]
): ChartPoint[] {
  return a.map(point => {
    const matching = b.find(
      other => other.time_utc === point.time_utc
    )

    if (!matching) {
      throw new Error('Site timelines have different timestamps')
    }

    return {
      time: point.hour === 24
        ? '24:00'
        : `${String(point.hour).padStart(2, '0')}:00`,
      siteA: point.elevation_deg,
      siteB: matching.elevation_deg,
    }
  })
}

function ElevationGraph({
  title,
  description,
  data,
  nameA,
  nameB,
}: {
  title: string
  description: string
  data: ChartPoint[]
  nameA: string
  nameB: string
}) {
  return (
    <div className="panel timeline-panel">
      <h2>{title}</h2>
      <p className="muted">{description}</p>

      <div
        className="chart-container"
        style={{
            width: '100%',
            height: '360px',
            minHeight: '360px',
            position: 'relative',
        }}
    >
  <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 20, right: 22, left: 0, bottom: 12 }}
          >
            <CartesianGrid
              stroke="#293957"
              strokeDasharray="3 3"
            />

            <XAxis
              dataKey="time"
              stroke="#9aabc9"
              tick={{ fontSize: 11 }}
            />

            <YAxis
              stroke="#9aabc9"
              tick={{ fontSize: 11 }}
              tickFormatter={value => `${value}°`}
              domain={[
                (min: number) => Math.min(min, 0),
                (max: number) => Math.max(max, 0),
              ]}
            />

            <Tooltip
              contentStyle={{
                background: '#111b30',
                border: '1px solid #344665',
                borderRadius: 8,
                color: '#e8efff',
              }}
              formatter={value =>
                `${Number(value).toFixed(3)}°`
              }
            />

            <Legend />

            <ReferenceLine
              y={0}
              stroke="#fbbf24"
              strokeDasharray="6 4"
              label={{
                value: 'Horizon (0°)',
                fill: '#fbbf24',
                position: 'insideTopRight',
                fontSize: 11,
              }}
            />

            <Line
              type="linear"
              dataKey="siteA"
              name={nameA}
              stroke="#60a5fa"
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />

            <Line
              type="linear"
              dataKey="siteB"
              name={nameB}
              stroke="#c084fc"
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function VisibilityCharts({
  siteA,
  siteB,
  date,
}: Props) {
  const [timelineA, setTimelineA] =
    useState<Timeline | null>(null)
  const [timelineB, setTimelineB] =
    useState<Timeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError('')
      setTimelineA(null)
      setTimelineB(null)

      try {
        // Request sequentially to limit upstream traffic.
        const resultA = await fetchTimeline(
          siteA, date, controller.signal
        )

        const resultB = await fetchTimeline(
          siteB, date, controller.signal
        )

        if (!controller.signal.aborted) {
          setTimelineA(resultA)
          setTimelineB(resultB)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load timeline'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => controller.abort()
  }, [
    siteA.latitude, siteA.longitude,
    siteB.latitude, siteB.longitude, date,
  ])

  let sunData: ChartPoint[] = []
  let earthData: ChartPoint[] = []
  let chartError = ''

  if (timelineA && timelineB) {
    try {
      sunData = prepareData(timelineA.sun, timelineB.sun)
      earthData = prepareData(timelineA.earth, timelineB.earth)
    } catch (err) {
      chartError = err instanceof Error
        ? err.message
        : 'Unable to prepare chart data'
    }
  }

  return (
    <section className="timeline-section">
      <div className="section-heading">
        <h2>24-Hour Visibility Analysis</h2>
        <p className="muted">
          NASA-derived elevation measurements at two-hour
          intervals, shown in UTC.
        </p>
      </div>

      {loading && (
        <div className="panel">
          <p className="muted">Loading NASA timeline data...</p>
        </div>
      )}

      {(error || chartError) && !loading && (
        <div className="notice error-notice">
          Unable to load timeline: {error || chartError}
        </div>
      )}

      {!loading && !error && !chartError &&
        timelineA && timelineB && (
          <>
            <ElevationGraph
              title="☀ Sun Elevation Over Time"
              description="Compare geometric solar elevation at both locations."
              data={sunData}
              nameA={siteA.name}
              nameB={siteB.name}
            />

            <ElevationGraph
              title="🌍 Earth Elevation Over Time"
              description="Compare geometric direct-to-Earth visibility."
              data={earthData}
              nameA={siteA.name}
              nameB={siteB.name}
            />

            <div className="notice">
              Values above 0° indicate geometric visibility.
              Local terrain may obstruct the view.
              Lines connect two-hour samples and do not
              represent independently calculated intermediate
              positions. These are not certified illumination
              or communication windows.
              <br /><br />
              Source: NASA JPL Horizons.
              Scientific validation is ongoing.
            </div>
          </>
        )}
    </section>
  )
}
