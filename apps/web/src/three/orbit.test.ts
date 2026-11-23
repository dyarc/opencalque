import { describe, expect, it } from 'vitest'
import { acrossOf, clampDistance, eyeOf, fitted, FOV, orbitOf, panned, turned, zoomed, type Orbit } from './orbit'

const middle = { x: 0, y: 0, z: 0 }
const level: Orbit = { target: middle, yaw: 0, pitch: 0, distance: 1000 }
const round = (p: { x: number; y: number; z: number }) => ({ x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) })

describe('the eye of the 3D view', () => {
  it('stands where it is turned to: to the side at no pitch, above it at a right angle', () => {
    expect(round(eyeOf(level))).toEqual({ x: 1000, y: 0, z: 0 })
    // Turned a quarter: right round to the far side of the drawing.
    expect(round(eyeOf({ ...level, yaw: Math.PI / 2 }))).toEqual({ x: 0, y: 1000, z: 0 })
    // Straight down from above, as far up as it may go: the target is straight under it.
    const top = eyeOf(orbitOf('top', middle, 1000))
    expect(top.z).toBeCloseTo(1000, 6)
    expect(Math.hypot(top.x, top.y)).toBeLessThan(2)
  })

  it('looks at the front from the -Y side, and at each side from its own', () => {
    expect(eyeOf(orbitOf('front', middle, 1000)).y).toBeCloseTo(-1000, 6)
    expect(eyeOf(orbitOf('back', middle, 1000)).y).toBeCloseTo(1000, 6)
    expect(eyeOf(orbitOf('right', middle, 1000)).x).toBeCloseTo(1000, 6)
    expect(eyeOf(orbitOf('left', middle, 1000)).x).toBeCloseTo(-1000, 6)
  })

  it('turns round and up no further than straight above or below', () => {
    expect(turned(level, 100, 0).yaw).toBeCloseTo(-0.75, 6)
    expect(turned(level, 0, 100000).pitch).toBeLessThan(Math.PI / 2)
    expect(turned(level, 0, -100000).pitch).toBeGreaterThan(-Math.PI / 2)
  })

  it('moves what it looks at across the window, and up or down it as the pointer is dragged', () => {
    const [right, up] = acrossOf(level)
    const perPixel = (2 * Math.tan(FOV / 2) * 1000) / 800
    const moved = panned(level, 100, 0, 800, FOV)
    // Dragged right: the drawing follows the pointer, so the eye looks further left.
    expect(moved.target.x).toBeCloseTo(-right.x * 100 * perPixel, 6)
    expect(moved.target.y).toBeCloseTo(-right.y * 100 * perPixel, 6)
    // Dragged down: the drawing follows the pointer, so the eye looks further up, along the window's own up.
    expect(panned(level, 0, 60, 800, FOV).target.z).toBeCloseTo(up.z * 60 * perPixel, 6)
  })

  it('draws nearer and further off with the wheel, within sight of what it looks at', () => {
    expect(zoomed(level, 0).distance).toBeCloseTo(1000, 6)
    expect(zoomed(level, 1000).distance).toBeGreaterThan(1000)
    expect(zoomed(level, -100000).distance).toBe(clampDistance(0))
    expect(zoomed(level, 100000).distance).toBe(clampDistance(Infinity))
  })

  it('fits a box: the eye backs off as the box grows, and looks at its middle', () => {
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 3000, z: 2600 } }
    const one = fitted(box, FOV, 1.5)
    expect(one.target).toEqual({ x: 2000, y: 1500, z: 1300 })
    const bigger = fitted({ min: box.min, max: { x: 8000, y: 6000, z: 2600 } }, FOV, 1.5)
    expect(bigger.distance).toBeGreaterThan(one.distance)
    // Far enough off that the box is inside the view, with room to spare.
    expect(2 * Math.tan(FOV / 2) * one.distance).toBeGreaterThan(Math.hypot(4000, 3000, 2600))
    // A narrow window needs the eye further off than a wide one.
    expect(fitted(box, FOV, 0.5).distance).toBeGreaterThan(fitted(box, FOV, 2).distance)
  })
})
