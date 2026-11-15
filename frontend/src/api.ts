export const API_URL: string =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export type Site = {
  id: string
  name: string
  latitude: number
  longitude: number
  region: string
  note: string
}

export type Series = {
  azimuth_deg: number[]
  elevation_deg: number[]
}

export type Metrics = {
  span_hours: number
  sun_up_pct: number
  earth_visible_pct: number
  both_pct: number
  longest_sunlit_hours: number
  longest_darkness_hours: number
  longest_earth_visible_hours: number
  longest_comms_blackout_hours: number
  sun_windows: number
  earth_windows: number
  max_sun_elevation_deg: number
  max_earth_elevation_deg: number
}

export type Window = { start: string; end: string; hours: number }

export type Analysis = {
  latitude: number
  longitude: number
  start: string
  days: number
  step_minutes: number
  times: string[]
  sun: Series
  earth: Series
  metrics: Metrics
  windows: { sun: Window[]; earth: Window[]; both: Window[] }
  source: string
  generated_at: string
  limitations: string
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { signal })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error(
      'Cannot reach the Lunaris data service. If it was idle it may ' +
        'be waking up — retry in a few seconds.'
    )
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail =
      typeof body?.detail === 'string' ? body.detail : null
    throw new Error(detail || `Data service error (${response.status})`)
  }
  return response.json() as Promise<T>
}

export function fetchSites(signal?: AbortSignal) {
  return getJson<{ sites: Site[] }>('/api/sites', signal)
}

const cache = new Map<string, Promise<Analysis>>()

export function fetchAnalysis(
  site: Site,
  start: string,
  days: number
): Promise<Analysis> {
  const params = new URLSearchParams({
    lat: String(site.latitude),
    lon: String(site.longitude),
    start,
    days: String(days),
    step: '60',
  })
  const key = params.toString()
  let hit = cache.get(key)
  if (!hit) {
    // Cached request is not tied to one component's abort signal.
    hit = getJson<Analysis>(`/api/analysis?${key}`)
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}
