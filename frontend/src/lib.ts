import type { Analysis, Site } from './api'

export const SITE_COLORS = ['#0b4778', '#c05600', '#1a7f5a']

export const DURATIONS = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
]

export const MAX_SITES = 3
// Example window that shows a sunlight/Earth tradeoff. Not "today" and
// not an optimized landing window.
export const DEFAULT_START = '2027-03-01'
export const HEIGHTS = [1, 2, 10]
export const DEFAULT_HEIGHT = 2

export function fmtHours(hours: number): string {
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`
  return `${hours.toFixed(1)} h`
}

export function fmtDeg(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}°`
}

export function fmtUtc(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  })
}

export function fmtLat(site: Pick<Site, 'latitude' | 'longitude'>) {
  const lat = `${Math.abs(site.latitude).toFixed(2)}°${
    site.latitude < 0 ? 'S' : 'N'
  }`
  const lon = `${Math.abs(site.longitude).toFixed(2)}°E`
  return `${lat}, ${lon}`
}

export function toCsv(
  entries: { site: Site; data: Analysis }[]
): string {
  const lines = [
    'site,latitude,longitude,observer_height_m,time_utc,' +
      'sun_az_deg,sun_el_deg,sun_terrain_horizon_deg,' +
      'earth_az_deg,earth_el_deg,earth_terrain_horizon_deg',
  ]
  for (const { site, data } of entries) {
    data.times.forEach((t, i) => {
      lines.push(
        [
          `"${site.name}"`,
          site.latitude,
          site.longitude,
          data.height_m,
          t,
          data.sun.azimuth_deg[i],
          data.sun.elevation_deg[i],
          data.sun.terrain_horizon_deg[i],
          data.earth.azimuth_deg[i],
          data.earth.elevation_deg[i],
          data.earth.terrain_horizon_deg[i],
        ].join(',')
      )
    })
  }
  return lines.join('\n')
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' })
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
