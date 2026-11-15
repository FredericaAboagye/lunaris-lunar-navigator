/**
 * Plain-language visibility states for the horizon readout.
 *
 * Matches the backend definitions: a body counts as visible when its
 * centre is above the horizon (strictly), using the modelled terrain
 * horizon in terrain mode or 0 deg (the reference horizontal) in
 * smooth-surface mode. Partial solar-disk visibility uses the same
 * circular-segment area formula as the "mean solar disk" metric.
 */

export const SUN_RADIUS_DEG = 0.2666

export type VisibilityState =
  | 'visible-above-reference'
  | 'visible-below-reference'
  | 'hidden-by-terrain'
  | 'below-reference-smooth'
  | 'above-reference-smooth'
  | 'unknown'

export type Explanation = {
  state: VisibilityState
  visible: boolean | null
  label: string
  reason: string
  /** Visible fraction of the solar disk, only when it is partial. */
  partialDisk?: number
}

export function diskFraction(clearanceDeg: number, radiusDeg: number) {
  const c = clearanceDeg / radiusDeg
  if (c >= 1) return 1
  if (c <= -1) return 0
  return 1 - (Math.acos(c) - c * Math.sqrt(1 - c * c)) / Math.PI
}

const deg = (v: number) => `${Math.abs(v).toFixed(2)}°`
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${deg(v)}`

export function explainVisibility(
  body: 'Sun' | 'Earth',
  elevation: number,
  terrainHorizon: number,
  mode: 'terrain' | 'geometric',
  coverageComplete = true
): Explanation {
  const horizon = mode === 'terrain' ? terrainHorizon : 0
  const clearance = elevation - horizon
  let partialDisk: number | undefined
  if (body === 'Sun' && Math.abs(clearance) < SUN_RADIUS_DEG) {
    partialDisk = diskFraction(clearance, SUN_RADIUS_DEG)
  }
  const disk =
    partialDisk === undefined
      ? ''
      : ` About ${Math.round(partialDisk * 100)}% of the solar disk is above the horizon.`

  if (mode === 'geometric') {
    return elevation > 0
      ? {
          state: 'above-reference-smooth',
          visible: true,
          label: 'Visible (smooth surface)',
          reason: `${body} centre is ${deg(elevation)} above the reference horizon (0°). Smooth-surface model: terrain is ignored.${disk}`,
          partialDisk,
        }
      : {
          state: 'below-reference-smooth',
          visible: false,
          label: 'Below reference horizon',
          reason: `${body} centre is ${deg(elevation)} below the reference horizon (0°) in the smooth-surface model, which ignores terrain.${disk}`,
          partialDisk,
        }
  }

  if (!coverageComplete) {
    return {
      state: 'unknown',
      visible: null,
      label: 'Unknown',
      reason: `Terrain coverage is incomplete in this direction, so ${body === 'Sun' ? 'sunlight' : 'Earth visibility'} cannot be determined.`,
    }
  }

  if (clearance > 0) {
    if (elevation >= 0) {
      return {
        state: 'visible-above-reference',
        visible: true,
        label: 'Visible',
        reason: `${body} centre is ${deg(clearance)} above the terrain horizon in this direction.${disk}`,
        partialDisk,
      }
    }
    return {
      state: 'visible-below-reference',
      visible: true,
      label: 'Visible below 0°',
      reason: `${body} centre is ${deg(elevation)} below the reference horizon (0°) but still visible: the modelled terrain horizon in this direction is lower, at ${signed(terrainHorizon)}.${disk}`,
      partialDisk,
    }
  }
  return {
    state: 'hidden-by-terrain',
    visible: false,
    label: 'Hidden by terrain',
    reason: `${body} centre is ${deg(clearance)} below the modelled terrain horizon (${signed(terrainHorizon)}) in this direction${elevation > 0 ? ', even though it is above the reference horizon (0°)' : ''}.${disk}`,
    partialDisk,
  }
}
