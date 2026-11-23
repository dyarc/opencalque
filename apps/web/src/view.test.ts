import { expect, test } from 'vitest'
import { gridLevels, gridStep, MAX_ZOOM, MIN_ZOOM, toWorld, zoomedAbout, type View } from './view'

/** A view at 0.1 px/mm, its origin at (100, 50) on screen. */
const view: View = { x: 100, y: 50, zoom: 0.1 }

test('zooming keeps the point under the pointer over the same place of the drawing', () => {
  const at = { x: 300, y: 200 }
  const under = toWorld(at, view)
  const zoomed = zoomedAbout(view, at, 1.6)
  expect(zoomed.zoom).toBeCloseTo(view.zoom * 1.6, 9)
  const stillUnder = toWorld(at, zoomed)
  expect(stillUnder.x).toBeCloseTo(under.x, 9)
  expect(stillUnder.y).toBeCloseTo(under.y, 9)
})

test('zooming stops at the limits the view bar has', () => {
  const at = { x: 0, y: 0 }
  expect(zoomedAbout({ ...view, zoom: MIN_ZOOM }, at, 0.0001).zoom).toBe(MIN_ZOOM)
  expect(zoomedAbout({ ...view, zoom: MAX_ZOOM }, at, 10000).zoom).toBe(MAX_ZOOM)
})

test('a faster zoom speed zooms further, in proportion, and one is the speed without it', () => {
  const at = { x: 0, y: 0 }
  const once = zoomedAbout({ ...view, zoom: 1 }, at, Math.exp(-100 * 0.0015))
  const twice = zoomedAbout({ ...view, zoom: 1 }, at, Math.pow(Math.exp(-100 * 0.0015), 2))
  expect(once.zoom).toBeCloseTo(Math.exp(-100 * 0.0015), 9)
  expect(Math.log(twice.zoom)).toBeCloseTo(2 * Math.log(once.zoom), 9)
})

test('the grid changes with the zoom when the drawing has none of its own, its squares never under 8 pixels', () => {
  expect(gridLevels(1)).toEqual({ minor: 10, major: 100 })
  expect(gridLevels(0.1)).toEqual({ minor: 100, major: 1000 })
  expect(gridStep(10)).toBe(1)
  expect(gridStep(1e-9)).toBe(100000)
})

test('a grid of the drawing has lines every 455 mm between those every 910 mm, as long as they do not crowd', () => {
  const module = { spacing: 910, divisions: 2 }
  // 455 mm is 9 pixels and more: both kinds of line.
  expect(gridLevels(0.02, module)).toEqual({ minor: 455, major: 910 })
  // Zoomed in, the grid stays at its finer lines.
  expect(gridLevels(10, module)).toEqual({ minor: 455, major: 910 })
  // Zoomed out, the main lines become the finer ones, and every tenth of them is darker.
  expect(gridLevels(0.01, module)).toEqual({ minor: 910, major: 9100 })
  expect(gridStep(0.001, module)).toBe(9100)
})

test('a grid of the drawing goes by its main lines when they are not divided, and is never left without a step', () => {
  expect(gridLevels(1, { spacing: 1000 })).toEqual({ minor: 1000, major: 10000 })
  expect(gridLevels(1, { spacing: 1000, divisions: 1 })).toEqual({ minor: 1000, major: 10000 })
  // A drawing written by hand may ask for more divisions than shown, or none at all.
  expect(gridStep(1000, { spacing: 1000, divisions: 1e9 })).toBe(10)
  expect(gridStep(1, { spacing: 1000, divisions: 0 })).toBe(1000)
  // Too far out for any of its lines, the coarsest.
  expect(gridStep(1e-12, { spacing: 910, divisions: 2 })).toBe(91000000)
  // A spacing that is no length falls back on the grid that changes with the zoom.
  expect(gridLevels(1, { spacing: 0 })).toEqual({ minor: 10, major: 100 })
})
