import type { Bounds, Vec2 } from '@opencalque/core'

/** How far the view zooms out and in, in screen pixels per millimetre. */
export const MIN_ZOOM = 0.002
export const MAX_ZOOM = 20

/** How the drawing is laid on the screen: `screen = world * zoom + (x, y)`. */
export interface View {
  /** Screen position of the world origin, in CSS pixels. */
  x: number
  y: number
  /** Pixels per millimetre. */
  zoom: number
}

/** A point of the drawing area (CSS pixels from its corner) in drawing millimetres. */
export const toWorld = (p: Vec2, view: View): Vec2 => ({ x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom })

/** What is on screen, in millimetres: the drawing area's corners taken back through the view. Null before the area has a size. */
export function visibleArea(view: View, viewport: { width: number; height: number }): Bounds | null {
  if (viewport.width <= 0) return null
  return { minX: -view.x / view.zoom, minY: -view.y / view.zoom, maxX: (viewport.width - view.x) / view.zoom, maxY: (viewport.height - view.y) / view.zoom }
}

/** The part of a `WheelEvent` that decides how it moves the view. */
export interface WheelInput {
  deltaX: number
  deltaY: number
  /** 0 for pixels, 1 for lines, 2 for pages (DOM_DELTA_*). */
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
}

/** Pixels a line of a line-based wheel event is taken as. */
const WHEEL_LINE = 16
/** How fast a pinch or a Ctrl-wheel zooms: the factor is e to the power of minus the pixels times this. */
const WHEEL_ZOOM = 0.01

/**
 * The view a wheel event leaves, as a trackpad is used on a Mac and a mouse wheel elsewhere: a
 * two-finger scroll pans the drawing by the distance scrolled, and a pinch — which browsers send as
 * a wheel event with Ctrl held — zooms about the pointer, as Ctrl-wheel (⌘-wheel) does for a mouse.
 * Ctrl and ⌘ are taken alike, so either zooms without the other's system shortcut getting in the way.
 * @param view - the view to move.
 * @param at - the pointer's place in the drawing area, in CSS pixels.
 * @param input - the wheel event.
 * @param viewportHeight - the drawing area's height, for a page-based event.
 * @param speed - how fast a zoom goes, as a multiple of the usual speed (Preferences › Zoom speed).
 * @param mode - what the wheel does: 'trackpad' scrolls and pinches, 'mouse' zooms on the wheel.
 * @returns the view to show.
 */
export function wheelNavigation(view: View, at: Vec2, input: WheelInput, viewportHeight: number, speed = 1, mode: 'trackpad' | 'mouse' = 'trackpad'): View {
  const unit = input.deltaMode === 1 ? WHEEL_LINE : input.deltaMode === 2 ? viewportHeight : 1
  const dx = input.deltaX * unit
  const dy = input.deltaY * unit
  if (mode === 'mouse' || input.ctrlKey || input.metaKey) {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * Math.exp(-dy * WHEEL_ZOOM * Math.max(0.05, speed))))
    // The world point under the pointer stays under it.
    return { zoom, x: at.x - ((at.x - view.x) / view.zoom) * zoom, y: at.y - ((at.y - view.y) / view.zoom) * zoom }
  }
  // The drawing follows the fingers: what is scrolled to the left is seen further left.
  return { ...view, x: view.x - dx, y: view.y - dy }
}

/** The grid step, in mm, for a zoom: the finest whose squares are at least 8 pixels on screen. */
/** CSS pixels in a millimetre of screen: 96 to the inch. */
const PX_PER_MM = 96 / 25.4

/**
 * The scale the drawing is seen at on screen, as a drawing scale: "1:50" when a metre of the
 * drawing is 2 cm of screen, "5:1" when enlarged. Taken at 96 pixels to the inch, which screens
 * only roughly are.
 */
export function screenScale(zoom: number): string {
  const n = PX_PER_MM / zoom
  if (n >= 1) return `1:${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}`
  return `${Math.round(10 / n) / 10}:1`
}

export function gridStep(zoom: number): number {
  for (const step of [1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 50000]) if (step * zoom >= 8) return step
  return 100000
}
