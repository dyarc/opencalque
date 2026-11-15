import { describe, expect, it } from 'vitest'
import { kindOf, type Node } from '../src'

const polyline = (extra: Record<string, unknown> = {}) => ({ id: 'p', type: 'polyline', parent: 'page_1', order: 'a0', points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], ...extra }) as Node
const kindOfPolyline = (node: Node) => kindOf(node)

// The middle of a straight edge is a handle of its own: dragging it slides the edge, with the points
// at its two ends going along the edges they are on.
describe('the middle of a polyline’s edge', () => {
  it('comes after the corners, as the handles that move each straight edge', () => {
    const node = polyline()
    const handles = kindOfPolyline(node).handles!(node)
    expect(handles).toEqual([
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 500, y: 0 },
      { x: 1000, y: 500 },
    ])
    expect(kindOfPolyline(node).handleMiddles!(node)).toBe(2)
  })

  it('moves its two ends with it, the corners beyond them staying', () => {
    const node = polyline()
    const patch = kindOfPolyline(node).moveHandle!(node, 3, { x: 500, y: 300 }) as { points: { x: number; y: number }[] }
    // The first edge is now at y = 300: both of its ends went down by 300, the same amount.
    expect(patch.points).toEqual([
      { x: 0, y: 300 },
      { x: 1000, y: 300 },
      { x: 1000, y: 1000 },
    ])
  })

  it('moves both of its ends the same, so a slight stray of the pointer cannot favour one', () => {
    // A slanting edge between two levels: dragged a little up as well as to the left, both ends go by
    // exactly the same, and the edge keeps its tilt. Sliding each end along the levels it is on would
    // have run the end nearer to level with the edge off with the pointer.
    const slanted = polyline({ points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1500, y: 600 }, { x: 2500, y: 600 }] })
    // Its middle stands at (1250, 300): the pointer takes it to (1180, 340), so the edge moves by
    // (-70, 40) and both of its ends by exactly that.
    const patch = kindOfPolyline(slanted).moveHandle!(slanted, 4 + 1, { x: 1180, y: 340 }) as { points: { x: number; y: number }[] }
    expect(patch.points).toEqual([
      { x: 0, y: 0 },
      { x: 930, y: 40 },
      { x: 1430, y: 640 },
      { x: 2500, y: 600 },
    ])
    // Both ends moved by the same (x, y), which is what the pointer asked for, nothing else.
    expect([patch.points[1].x - 1000, patch.points[1].y - 0]).toEqual([-70, 40])
    expect([patch.points[2].x - 1500, patch.points[2].y - 600]).toEqual([-70, 40])
  })

  it('moves a closed shape’s edge as it is, its other corners staying', () => {
    const square = polyline({ closed: true, points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }] })
    // Its first edge, moved up by 200: both corners go up, each on its own side.
    const up = kindOfPolyline(square).moveHandle!(square, 4, { x: 500, y: -200 }) as { points: { x: number; y: number }[] }
    expect(up.points).toEqual([
      { x: 0, y: -200 },
      { x: 1000, y: -200 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ])
    // Its last edge (the one closing it), moved to the left: both corners slide along the levels
    // they are on, so the two sides run out to the moved edge.
    const left = kindOfPolyline(square).moveHandle!(square, 4 + 3, { x: -300, y: 500 }) as { points: { x: number; y: number }[] }
    expect(left.points).toEqual([
      { x: -300, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: -300, y: 1000 },
    ])
  })

  it('leaves an edge bowed by a bulge to its bow: no middle to move it', () => {
    const bowed = polyline({ bulges: [200, null] })
    expect(kindOfPolyline(bowed).handleMiddles!(bowed)).toBe(1)
    expect(kindOfPolyline(bowed).handles!(bowed)).toHaveLength(4)
  })
})

describe('the middle of a line', () => {
  const line = { id: 'l', type: 'line', parent: 'page_1', order: 'a0', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } } as Node

  it('carries both of its ends with it', () => {
    expect(kindOfPolyline(line).handleMiddles!(line)).toBe(1)
    const patch = kindOfPolyline(line).moveHandle!(line, 2, { x: 500, y: 400 }) as { a: { x: number; y: number }; b: { x: number; y: number } }
    expect(patch).toEqual({ a: { x: 0, y: 400 }, b: { x: 1000, y: 400 } })
    // An end still moves on its own.
    expect(kindOfPolyline(line).moveHandle!(line, 0, { x: -100, y: 0 })).toEqual({ a: { x: -100, y: 0 } })
  })
})
