// Run with: npm test  (Node's built-in runner with TypeScript stripping)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  leaderSentence,
  rank,
  tradeoffSentence,
} from '../src/logic/compare.ts'
import { diskFraction, explainVisibility } from '../src/logic/visibility.ts'

const pct = (v: number) => `${v.toFixed(1)}%`
type S = { name: string; v: number }
const n = (s: S) => s.name
const v = (s: S) => s.v

test('clear winner respects direction', () => {
  const xs = [{ name: 'A', v: 72.2 }, { name: 'B', v: 64.6 }]
  assert.deepEqual(rank(xs, v, pct, 'high').winners.map(n), ['A'])
  assert.deepEqual(rank(xs, v, pct, 'low').winners.map(n), ['B'])
})

test('ties at displayed precision are joint winners', () => {
  const xs = [
    { name: 'A', v: 100 }, { name: 'B', v: 100 }, { name: 'C', v: 99.96 },
  ]
  const r = rank(xs, v, pct, 'high')
  assert.equal(r.allTied, true)
  assert.deepEqual(r.winners.map(n), ['A', 'B', 'C'])
  const two = rank([{ name: 'A', v: 13.44 }, { name: 'B', v: 13.41 },
    { name: 'C', v: 15 }], v, x => x.toFixed(1), 'low')
  assert.equal(two.tie, true)
  assert.equal(two.allTied, false)
  assert.deepEqual(two.winners.map(n), ['A', 'B'])
})

test('sentences never crown a winner on an exact tie', () => {
  const xs = [{ name: 'A', v: 100 }, { name: 'B', v: 100 }]
  const s = leaderSentence(xs, n, v, pct, 'high', 'sunlight', 'mean solar disk visible')
  assert.match(s, /^All selected sites tie on sunlight/)
})

test('tradeoff sentence names different leaders, never "best"', () => {
  const s = tradeoffSentence([
    { priority: 'sunlight', names: ['Connecting Ridge'], allTied: false },
    { priority: 'Earth contact', names: ['Connecting Ridge'], allTied: false },
    { priority: 'Sun and Earth together', names: ['Shackleton Rim'], allTied: false },
  ])
  assert.match(s, /^Tradeoff in this window/)
  assert.match(s, /Shackleton Rim on Sun and Earth together/)
  assert.doesNotMatch(s, /best/i)
  const same = tradeoffSentence([
    { priority: 'sunlight', names: ['A'], allTied: false },
    { priority: 'Earth contact', names: ['A'], allTied: false },
  ])
  assert.match(same, /A leads on sunlight and Earth contact in this window/)
  assert.doesNotMatch(same, /best/i)
})

test('disk fraction is area-based', () => {
  assert.equal(diskFraction(0, 0.2666), 0.5)
  assert.equal(diskFraction(1, 0.2666), 1)
  assert.equal(diskFraction(-1, 0.2666), 0)
  // Centre 0.6 radii below the horizon: visible cap area ~ 0.1424;
  // a diameter-based fraction would wrongly give 0.2.
  assert.ok(Math.abs(diskFraction(-0.6 * 0.2666, 0.2666) - 0.1424) < 0.001)
})

// Numerical cases taken from the running API (Shackleton Rim, 2 m).
test('visible below 0 deg because terrain horizon is lower', () => {
  const e = explainVisibility('Sun', -0.46, -0.58, 'terrain')
  assert.equal(e.state, 'visible-below-reference')
  assert.equal(e.visible, true)
  assert.match(e.reason, /below the reference horizon \(0°\) but still visible/)
  assert.ok(e.partialDisk !== undefined && e.partialDisk > 0.5)
})

test('hidden by terrain even when below 0 deg', () => {
  const e = explainVisibility('Earth', -6.24, 0.56, 'terrain')
  assert.equal(e.state, 'hidden-by-terrain')
  assert.equal(e.visible, false)
  assert.doesNotMatch(e.reason, /even though/)
})

test('hidden by terrain while above 0 deg says so', () => {
  const e = explainVisibility('Earth', 0.3, 0.8, 'terrain')
  assert.equal(e.state, 'hidden-by-terrain')
  assert.match(e.reason, /even though it is above the reference horizon/)
})

test('visible above reference, smooth mode and unknown coverage', () => {
  assert.equal(explainVisibility('Sun', 1.66, 1.02, 'terrain').state,
    'visible-above-reference')
  assert.equal(explainVisibility('Sun', -0.41, -2, 'geometric').state,
    'below-reference-smooth')
  assert.equal(explainVisibility('Sun', 0.4, 2, 'geometric').state,
    'above-reference-smooth')
  const u = explainVisibility('Earth', 1, 0, 'terrain', false)
  assert.equal(u.state, 'unknown')
  assert.equal(u.visible, null)
})

test('exactly on the horizon counts as hidden, like the backend', () => {
  assert.equal(explainVisibility('Earth', 0.5, 0.5, 'terrain').visible, false)
})

import { windowStarts } from '../src/logic/windows.ts'

test('consecutive windows share duration and stop at the API limit', () => {
  assert.deepEqual(windowStarts('2027-03-01', 30),
    ['2027-03-01', '2027-03-31', '2027-04-30', '2027-05-30'])
  assert.deepEqual(windowStarts('2027-03-01', 7, 2), ['2027-03-01', '2027-03-08'])
  // API accepts start <= 2049-12-31 minus the window length.
  assert.deepEqual(windowStarts('2049-11-01', 30), ['2049-11-01', '2049-12-01'])
})
