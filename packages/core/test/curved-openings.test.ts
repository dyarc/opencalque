import { describe, expect, it } from 'vitest'
import { curvedDoor, curvedWindow, door, windowKind } from '../../ext-architecture/src/openings'

describe('curved doors and windows', () => {
  it('follow the wall when they are built on a curved one', () => {
    const env = { wallThickness: 200 }
    for (const kind of [curvedDoor, curvedWindow]) {
      const prims = kind.build!({ width: 1000, height: 1200, sillHeight: 900, type: 'Single', shape: 'Curved', bow: 80 }, env)
      expect(prims.length).toBeGreaterThan(0)
      const paths = prims.filter((prim) => prim.kind === 'path') as { points: unknown[]; closed?: boolean }[]
      expect(paths.some((path) => path.points.length > 2)).toBe(true)
    }
  })
})

describe('the shape of a door or a window, rather than a copy of the kind', () => {
  it('is not offered as a kind of its own any more, though drawings made with one still open', () => {
    expect([curvedDoor.hidden, curvedWindow.hidden]).toEqual([true, true])
    expect([door.hidden, windowKind.hidden]).toEqual([undefined, undefined])
  })

  it('bows to either side: a bow on the other side is a bow the other way', () => {
    // The middle of the frame on the far side of the wall, whose middle is the bow's own sagitta.
    const middle = (bow: number) => {
      const prims = curvedDoor.build!({ width: 1000, height: 1200, type: 'Single', shape: 'Curved', bow }, { wallThickness: 200 })
      const path = prims.find((prim) => prim.kind === 'path' && prim.points.length > 2) as { points: { x: number; y: number }[] }
      return path.points[Math.floor(path.points.length / 2)].y
    }
    // The frame runs at -100 (half of the wall), and the middle of it stands out by the bow.
    expect(middle(80)).toBeCloseTo(-20, 0)
    expect(middle(-80)).toBeCloseTo(-180, 0)
  })
})

describe('the two faces of a curved opening', () => {
  /** The centre of the circle three points of a sampled arc lie on. */
  const centreOf = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
    const [a2, b2, c2] = [a.x * a.x + a.y * a.y, b.x * b.x + b.y * b.y, c.x * c.x + c.y * c.y]
    return { x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d }
  }
  const radius = (centre: { x: number; y: number }, p: { x: number; y: number }) => Math.hypot(p.x - centre.x, p.y - centre.y)
  const faces = () =>
    windowKind
      .build({ width: 1000, panes: 1, glazing: 'Single', sill: 0, shape: 'Curved', bow: 300 }, { wallThickness: 200 })
      .filter((prim) => prim.kind === 'path')
      .slice(0, 2) as { points: { x: number; y: number }[] }[]

  it('are concentric arcs, half a wall apart, rather than one arc moved outwards', () => {
    const [inner, outer] = faces()
    const mid = (path: { points: { x: number; y: number }[] }) => path.points[Math.floor(path.points.length / 2)]
    const centre = centreOf(inner.points[0], mid(inner), inner.points[inner.points.length - 1])
    // Concentric: the two radii differ by the wall, 200 mm, and not by nothing.
    const apart = Math.abs(radius(centre, outer.points[0]) - radius(centre, inner.points[0]))
    expect(Math.abs(apart - 200)).toBeLessThan(1)
  })

  it('ends square to the curve: both faces end on one radius', () => {
    const [inner, outer] = faces()
    const mid = (path: { points: { x: number; y: number }[] }) => path.points[Math.floor(path.points.length / 2)]
    const centre = centreOf(inner.points[0], mid(inner), inner.points[inner.points.length - 1])
    const [a, b] = [inner.points[0], outer.points[0]]
    // How far the centre lies off the line the two ends make: nothing, when the end is radial.
    const away = Math.abs((b.x - a.x) * (centre.y - a.y) - (b.y - a.y) * (centre.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y)
    expect(away).toBeLessThan(1)
  })
})
