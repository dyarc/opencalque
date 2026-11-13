import { expect, test } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, toWorld, wheelNavigation, type View, type WheelInput } from './view'

/** A view at 0.1 px/mm, its origin at (100, 50) on screen. */
const view: View = { x: 100, y: 50, zoom: 0.1 }

/** A wheel event, as a mouse or a trackpad sends it, unless told otherwise. */
const wheel = (over: Partial<WheelInput> = {}): WheelInput => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, ...over })

test('a two-finger scroll pans the drawing both ways, and leaves the zoom alone', () => {
  expect(wheelNavigation(view, { x: 0, y: 0 }, wheel({ deltaX: 30, deltaY: 40 }), 800)).toEqual({ zoom: 0.1, x: 70, y: 10 })
})

test('a horizontal scroll alone pans across', () => {
  expect(wheelNavigation(view, { x: 0, y: 0 }, wheel({ deltaX: -25 }), 800)).toEqual({ zoom: 0.1, x: 125, y: 50 })
})

test('a pinch zooms about the pointer, which stays over the same place of the drawing', () => {
  const at = { x: 300, y: 200 }
  const under = toWorld(at, view)
  const zoomed = wheelNavigation(view, at, wheel({ deltaY: -100, ctrlKey: true }), 800)
  expect(zoomed.zoom).toBeGreaterThan(view.zoom)
  const stillUnder = toWorld(at, zoomed)
  expect(stillUnder.x).toBeCloseTo(under.x, 9)
  expect(stillUnder.y).toBeCloseTo(under.y, 9)
})

test('⌘-wheel zooms as Ctrl-wheel does', () => {
  const inByCtrl = wheelNavigation(view, { x: 300, y: 200 }, wheel({ deltaY: -100, ctrlKey: true }), 800)
  const inByMeta = wheelNavigation(view, { x: 300, y: 200 }, wheel({ deltaY: -100, metaKey: true }), 800)
  expect(inByMeta).toEqual(inByCtrl)
})

test('a plain wheel does not zoom', () => {
  expect(wheelNavigation(view, { x: 0, y: 0 }, wheel({ deltaY: -1000 }), 800).zoom).toBe(view.zoom)
})

test('a line-based wheel event is taken as pixels, a page-based one as the height of the view', () => {
  expect(wheelNavigation(view, { x: 0, y: 0 }, wheel({ deltaY: 3, deltaMode: 1 }), 800).y).toBe(50 - 48)
  expect(wheelNavigation(view, { x: 0, y: 0 }, wheel({ deltaY: 1, deltaMode: 2 }), 800).y).toBe(50 - 800)
})

test('zooming stops at the limits the view bar has', () => {
  const at = { x: 0, y: 0 }
  expect(wheelNavigation({ ...view, zoom: MIN_ZOOM }, at, wheel({ deltaY: 100000, ctrlKey: true }), 800).zoom).toBe(MIN_ZOOM)
  expect(wheelNavigation({ ...view, zoom: MAX_ZOOM }, at, wheel({ deltaY: -100000, ctrlKey: true }), 800).zoom).toBe(MAX_ZOOM)
})

test('a faster zoom speed zooms further, in proportion, and one is the speed without it', () => {
  const at = { x: 0, y: 0 }
  const slow = wheelNavigation({ ...view, zoom: 1 }, at, wheel({ deltaY: -100, ctrlKey: true }), 800)
  const once = wheelNavigation({ ...view, zoom: 1 }, at, wheel({ deltaY: -100, ctrlKey: true }), 800, 1)
  const twice = wheelNavigation({ ...view, zoom: 1 }, at, wheel({ deltaY: -100, ctrlKey: true }), 800, 2)
  expect(once).toEqual(slow)
  expect(Math.log(twice.zoom)).toBeCloseTo(2 * Math.log(once.zoom), 9)
})
