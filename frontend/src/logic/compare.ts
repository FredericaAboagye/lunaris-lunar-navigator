/**
 * Site comparison at displayed precision.
 *
 * Winners are decided on the formatted value the user sees, so two sites
 * shown as "72.2%" tie even if their raw values differ in a later digit.
 */

export type Direction = 'high' | 'low'

export type Ranking<T> = {
  winners: T[]
  /** More than one site shares the best displayed value. */
  tie: boolean
  /** Every compared site shares the best displayed value. */
  allTied: boolean
}

export function rank<T>(
  items: T[],
  value: (item: T) => number,
  format: (v: number) => string,
  direction: Direction
): Ranking<T> {
  if (items.length < 2) return { winners: [], tie: false, allTied: false }
  let best = 0
  items.forEach((item, i) => {
    const v = value(item)
    const b = value(items[best])
    if (direction === 'high' ? v > b : v < b) best = i
  })
  const shown = format(value(items[best]))
  const winners = items.filter(item => format(value(item)) === shown)
  return {
    winners,
    tie: winners.length > 1,
    allTied: winners.length === items.length,
  }
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * One plain-language sentence about who leads on a metric.
 * `noun` describes the quantity, e.g. "the most sunlight".
 */
export function leaderSentence<T>(
  items: T[],
  name: (item: T) => string,
  value: (item: T) => number,
  format: (v: number) => string,
  direction: Direction,
  noun: string,
  unitPhrase: string
): string {
  if (items.length < 2) {
    return items.length
      ? `${name(items[0])}: ${format(value(items[0]))} ${unitPhrase}.`
      : ''
  }
  const r = rank(items, value, format, direction)
  const best = format(value(r.winners[0]))
  if (r.allTied) {
    return `All selected sites tie on ${noun} (${best} ${unitPhrase}).`
  }
  const others = items
    .filter(i => !r.winners.includes(i))
    .map(i => `${format(value(i))} at ${name(i)}`)
    .join(', ')
  const who = joinNames(r.winners.map(name))
  return `${who} ${r.tie ? 'tie for' : 'has'} ${noun}: ${best} ${unitPhrase}, vs ${others}.`
}

/**
 * Describe whether different sites lead on different priorities.
 * Never names an overall "best" site.
 */
export function tradeoffSentence(
  leaders: { priority: string; names: string[]; allTied: boolean }[]
): string {
  const decided = leaders.filter(l => !l.allTied && l.names.length > 0)
  if (decided.length === 0) {
    return 'No measure separates the selected sites in this window.'
  }
  const keys = new Set(decided.map(l => l.names.slice().sort().join('|')))
  if (keys.size === 1) {
    const who = joinNames(decided[0].names)
    const list = joinNames(decided.map(l => l.priority))
    return `${who} ${decided[0].names.length > 1 ? 'lead' : 'leads'} on ${list} in this window. Results change with the date — compare other windows below.`
  }
  const parts = decided.map(l => `${joinNames(l.names)} on ${l.priority}`)
  return `Tradeoff in this window: ${joinNames(parts)}. Which matters more depends on your mission priority.`
}
