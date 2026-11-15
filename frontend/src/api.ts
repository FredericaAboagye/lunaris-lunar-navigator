export const API_URL: string =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export type HazardDisc = {
  pixels: number
  median_deg: number
  p95_deg: number
  max_deg: number
  pct_below_5: number
  pct_below_10: number
  pct_below_15: number
}

export type Site = {
  id: string
  name: string
  region: string
  latitude: number
  longitude: number
  point_source: string
  surface_height_m: number
  heights_m: number[]
  coverage: {
    terrain_search_km: number
    min_terrain_coverage_km: number
    complete: boolean
    local_dem: string
    regional_dem: string
    far_field_m: number
  }
  hazard: {
    source: string
    slope_rms_error_deg: string
    within_100m: HazardDisc
    within_500m: HazardDisc
  }
  validation: {
    passed: boolean
    published_check: {
      reference: string
      our_mean_solar_disk_fraction_1m: number
      pass: boolean
    }
  }
}

export const API_VERSION = 2

export type SitesResponse = {
  api_version?: number
  sites: Site[]
  unsupported: Record<string, string>
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
  max_sun_elevation_deg?: number
  max_earth_elevation_deg?: number
  max_sun_clearance_deg?: number
  max_earth_clearance_deg?: number
  mean_sun_disk_pct: number
}

export type Window = { start: string; end: string; hours: number }
export type Windows = { sun: Window[]; earth: Window[]; both: Window[] }
export type Mode = 'terrain' | 'geometric'

export type Body = {
  azimuth_deg: number[]
  elevation_deg: number[]
  terrain_horizon_deg: number[]
}

export type Analysis = {
  site: Site
  height_m: number
  start: string
  days: number
  step_minutes: number
  times: string[]
  sun: Body
  earth: Body
  metrics: {
    terrain: Metrics
    geometric: Metrics
    terrain_far_field: {
      sun_up_pct: number
      mean_sun_disk_pct: number
      earth_visible_pct: number
      far_field_m: number
    }
  }
  windows: Record<Mode, Windows>
  horizon_profile: {
    azimuth_deg: number[]
    full_deg: number[]
    far_field_deg: number[]
  }
  definitions: Record<string, string>
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
    const err = new Error(
      detail || `Data service error (${response.status})`
    ) as Error & { status?: number }
    err.status = response.status
    throw err
  }
  return response.json() as Promise<T>
}

function versionError(reported?: number) {
  return new Error(
    `This page needs Lunaris API v${API_VERSION}, but the data service ` +
      `reports ${reported ? `v${reported}` : 'an older version'}. ` +
      'Deploy the backend before the frontend.'
  )
}

export async function fetchSites(signal?: AbortSignal) {
  let body: SitesResponse
  try {
    body = await getJson<SitesResponse>('/api/sites', signal)
  } catch (err) {
    // API v1 had no /api/sites endpoint.
    if ((err as { status?: number }).status === 404) throw versionError()
    throw err
  }
  if (body.api_version !== API_VERSION) throw versionError(body.api_version)
  return body
}

const cache = new Map<string, Promise<Analysis>>()

export function fetchAnalysis(
  siteId: string,
  start: string,
  days: number,
  height: number
): Promise<Analysis> {
  const key = new URLSearchParams({
    site: siteId,
    start,
    days: String(days),
    height: String(height),
    step: '60',
  }).toString()
  let hit = cache.get(key)
  if (!hit) {
    hit = getJson<Analysis>(`/api/analysis?${key}`)
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}
