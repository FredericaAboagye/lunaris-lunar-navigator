
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
  time_utc: string
  azimuth_deg: number
  elevation_deg: number
  above_geometric_horizon: boolean
}

type Summary = {
  sample_count: number
  samples_above_horizon: number
  percent_samples_above_horizon: number
}

type BodyData = {
  observations: Observation[]
  summary: Summary
}

type MissionData = {
  duration_days: number
  step_hours: number
  sun: BodyData
  earth: BodyData
  source: string
  limitations: string
}

type RequestInfo = {
  siteA: Site
  siteB: Site
  date: string
  duration: number
}

type Props = {
  siteA: Site
  siteB: Site
  date: string
}

const API =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function fetchMission(
  site: Site,
  date: string,
  duration: number,
  signal: AbortSignal
): Promise<MissionData> {
  const params = new URLSearchParams({
    lat: String(site.latitude),
    lon: String(site.longitude),
    day: date,
    duration: String(duration),
  })

  const response = await fetch(
    `${API}/api/mission-window?${params}`,
    { signal }
  )

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      body?.detail || `Mission API error: ${response.status}`
    )
  }

  const data: MissionData = await response.json()
  const expected = duration * 4 + 1

  if (
    data.sun?.observations?.length !== expected ||
    data.earth?.observations?.length !== expected ||
    data.sun?.summary?.sample_count !== expected ||
    data.earth?.summary?.sample_count !== expected
  ) {
    throw new Error('Incomplete multi-day NASA response')
  }

  return data
}

function SummaryCard({
  label,
  site,
  data,
}: {
  label: string
  site: Site
  data: MissionData
}) {
  return (
    <div className="comparison-card">
      <div className="site-heading">
        <span className="site-label">{label}</span>
        <h3>{site.name}</h3>
      </div>

      <div className="metric">
        <span>☀ Sun samples above horizon</span>
        <strong>
          {data.sun.summary.percent_samples_above_horizon}%
        </strong>
      </div>
      <p className="muted">
        {data.sun.summary.samples_above_horizon} of{' '}
        {data.sun.summary.sample_count} samples
      </p>

      <div className="metric">
        <span>🌍 Earth samples above horizon</span>
        <strong>
          {data.earth.summary.percent_samples_above_horizon}%
        </strong>
      </div>
      <p className="muted">
        {data.earth.summary.samples_above_horizon} of{' '}
        {data.earth.summary.sample_count} samples
      </p>
    </div>
  )
}

function MissionGraph({
  title,
  body,
  a,
  b,
  nameA,
  nameB,
}: {
  title: string
  body: 'sun' | 'earth'
  a: MissionData
  b: MissionData
  nameA: string
  nameB: string
}) {
  const aPoints = a[body].observations
  const bPoints = b[body].observations

  const data = aPoints.map((point, index) => ({
    time: point.time_utc.slice(5, 16).replace('T', ' '),
    siteA: point.elevation_deg,
    siteB: bPoints[index].elevation_deg,
  }))

  return (
    <div className="panel timeline-panel">
      <h2>{title}</h2>
      <p className="muted">
        Elevation sampled every six hours, shown in UTC.
      </p>

      <div className="mission-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{
              top: 20,
              right: 24,
              left: 0,
              bottom: 35,
            }}
          >
            <CartesianGrid
              stroke="#293957"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="time"
              stroke="#9aabc9"
              tick={{ fontSize: 11 }}
              minTickGap={25}
              angle={-30}
              textAnchor="end"
              height={65}
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
            />
            <Line
              type="linear"
              dataKey="siteA"
              name={nameA}
              stroke="#60a5fa"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="siteB"
              name={nameB}
              stroke="#c084fc"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}


function calculateSimultaneousVisibility(
  data: MissionData
) {
  const sun = data.sun.observations
  const earth = data.earth.observations

  let simultaneous = 0

  for (let i = 0; i < sun.length; i++) {
    if (
      sun[i].time_utc !== earth[i]?.time_utc
    ) {
      throw new Error('Sun and Earth timestamps differ')
    }

    if (
      sun[i].above_geometric_horizon &&
      earth[i].above_geometric_horizon
    ) {
      simultaneous++
    }
  }

  return {
    count: simultaneous,
    total: sun.length,
    percentage: sun.length
      ? Number((simultaneous / sun.length * 100).toFixed(1))
      : 0,
  }
}

 
function MissionInsights({
  dataA,
  dataB,
  nameA,
  nameB,
}: {
  dataA: MissionData
  dataB: MissionData
  nameA: string
  nameB: string
}) {
  const simultaneousA =
    calculateSimultaneousVisibility(dataA)

  const simultaneousB =
    calculateSimultaneousVisibility(dataB)

  const sunA =
    dataA.sun.summary.percent_samples_above_horizon
  const sunB =
    dataB.sun.summary.percent_samples_above_horizon

  const earthA =
    dataA.earth.summary.percent_samples_above_horizon
  const earthB =
    dataB.earth.summary.percent_samples_above_horizon

  function compare(
    a: number,
    b: number,
    category: string
  ) {
    if (a === b) {
      return `Both locations have equal sampled ${category}.`
    }

    const winner = a > b ? nameA : nameB

    return `${winner} has greater sampled ${category}.`
  }

  return (
    <div className="panel mission-insights">
      <h2>Mission Tradeoff Analysis</h2>

      <p className="muted">
        Comparing geometric visibility across the
        selected mission period.
      </p>

      <div className="metric">
        <span>Simultaneous visibility — {nameA}</span>
        <strong>{simultaneousA.percentage}%</strong>
      </div>

      <div className="metric">
        <span>Simultaneous visibility — {nameB}</span>
        <strong>{simultaneousB.percentage}%</strong>
      </div>

      <div className="notice">
        <h3>Mission Insights</h3>

        <p>{compare(sunA, sunB, 'Sun visibility')}</p>
        <p>{compare(earthA, earthB, 'Earth visibility')}</p>
        <p>
          {compare(
            simultaneousA.percentage,
            simultaneousB.percentage,
            'simultaneous Sun and Earth visibility'
          )}
        </p>

        <p>
          These findings describe sampled geometric
          visibility only. They do not establish
          landing safety, actual solar power,
          or guaranteed communication availability.
        </p>
      </div>
    </div>
  )
}

export default function MissionWindow({
  siteA,
  siteB,
  date,
}: Props) {
  const [duration, setDuration] = useState(3)
  const [request, setRequest] = useState<RequestInfo | null>(null)
  const [dataA, setDataA] = useState<MissionData | null>(null)
  const [dataB, setDataB] = useState<MissionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!request) return

    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError('')
      setDataA(null)
      setDataB(null)

      try {
        // Sequential requests reduce simultaneous NASA traffic.
        const resultA = await fetchMission(
          request!.siteA,
          request!.date,
          request!.duration,
          controller.signal
        )
        const resultB = await fetchMission(
          request!.siteB,
          request!.date,
          request!.duration,
          controller.signal
        )

        const matches = (body: 'sun' | 'earth') =>
          resultA[body].observations.every(
            (point, index) =>
              point.time_utc ===
              resultB[body].observations[index]?.time_utc
          )

        if (!matches('sun') || !matches('earth')) {
          throw new Error('Site observation timestamps differ')
        }

        if (!controller.signal.aborted) {
          setDataA(resultA)
          setDataB(resultB)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Mission analysis failed'
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
  }, [request])

  return (
    <section className="mission-section">
      <div className="section-heading">
        <h2>Multi-Day Mission Analysis</h2>
        <p className="muted">
          Explore sampled Sun and Earth visibility over a
          longer mission period.
        </p>
      </div>

      <div className="panel">
        <label htmlFor="mission-duration">
          Mission Duration
        </label>
        <select
          id="mission-duration"
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
        >
          <option value={1}>1 day</option>
          <option value={3}>3 days</option>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
        </select>

        <button
          className="mission-button"
          disabled={loading}
          onClick={() =>
            setRequest({
              siteA: { ...siteA },
              siteB: { ...siteB },
              date,
              duration,
            })
          }
        >
          {loading ? 'Analyzing...' : 'Analyze Mission'}
        </button>

        <p className="muted">
          Select sites and a date above, choose a duration,
          then click Analyze Mission.
        </p>
      </div>

      {loading && (
        <div className="notice">
          Loading multi-day NASA observations...
        </div>
      )}

      {error && (
        <div className="notice error-notice">
          Unable to analyze mission: {error}
        </div>
      )}

      {!loading && !error && dataA && dataB && request && (
        <>
          <div className="notice">
            Results for {request.date}, {request.duration}{' '}
            day(s), comparing {request.siteA.name} and{' '}
            {request.siteB.name}.
            Change the inputs and click Analyze Mission
            again to refresh these results.
          </div>

          <h2 className="mission-subheading">
            Sampled Visibility Statistics
          </h2>

          <div className="comparison-grid">
            <SummaryCard
              label="SITE A"
              site={request.siteA}
              data={dataA}
            />
            <SummaryCard
              label="SITE B"
              site={request.siteB}
              data={dataB}
            />
          </div>

          <h2 className="mission-subheading">
            Multi-Day Elevation Trends
          </h2>

          <MissionGraph
            title="☀ Multi-Day Sun Elevation"
            body="sun"
            a={dataA}
            b={dataB}
            nameA={request.siteA.name}
            nameB={request.siteB.name}
          />

          <MissionGraph
            title="🌍 Multi-Day Earth Elevation"
            body="earth"
            a={dataA}
            b={dataB}
            nameA={request.siteA.name}
            nameB={request.siteB.name}
          />

          <MissionInsights
                dataA={dataA}
                dataB={dataB}
                nameA={request.siteA.name}
                nameB={request.siteB.name}
          />
          
          <div className="notice">
            Source: NASA JPL Horizons. Percentages describe
            sampled geometric visibility, not continuous
            mission-time coverage. Local terrain, landing
            safety, solar power production, and communication
            quality have not been modeled.
          </div>
        </>
      )}
    </section>
  )
}
