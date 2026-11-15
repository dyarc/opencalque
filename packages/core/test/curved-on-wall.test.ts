import { describe, expect, it } from 'vitest'
import { architecture } from '../../ext-architecture/src'
import { applyOps, arcLengthOfChord, chordOfArcLength, courseOf, createDocument, kindOf, nodePrimitives, openingArc, Registry, snapOpeningToWall, type Document } from '../src'

const registry = new Registry().use(architecture)
describe('a curved window placed on a curved wall', () => {
  it('draws a bow', () => {
    const doc = applyOps(createDocument(), [
      { op: 'add_node', node: { id: 'w', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200, bulge: -1000 } } as never,
    ])
    const at = snapOpeningToWall(doc, 'page_1', registry, { kind: 'arch.window.curved', props: { width: 1200, shape: 'Curved' } }, { x: 2000, y: -900 }, 2000, 10)
    expect(at).not.toBeNull()
    const made = applyOps(doc, [{ op: 'add_node', node: { id: 'win', type: 'parametric', parent: 'page_1', layer: 'layer_1', kind: 'arch.window.curved', props: { width: 1200, shape: 'Curved' }, ...at! } } as never])
    const prims = nodePrimitives(made.nodes.win, { doc: made, registry, depth: 0 })
    const paths = prims.filter((p) => p.kind === 'path') as { points: unknown[] }[]
    expect(paths.some((p) => p.points.length > 2)).toBe(true)
  })
})

describe('a window in a curved wall, without being told its shape', () => {
  const radius = 2500
  const curvedWall = () =>
    applyOps(createDocument(), [
      { op: 'add_node', node: { id: 'w', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200, bulge: -1000 } } as never,
    ])
  const placed = (props: Record<string, unknown>) => {
    const doc = curvedWall()
    const at = snapOpeningToWall(doc, 'page_1', registry, { kind: 'arch.window', props }, { x: 2000, y: -900 }, 2000, 10)
    expect(at).not.toBeNull()
    return applyOps(doc, [{ op: 'add_node', node: { id: 'win', type: 'parametric', parent: 'page_1', layer: 'layer_1', kind: 'arch.window', props, ...at! } } as never])
  }

  it('is drawn on the wall\'s own arc', () => {
    const doc = placed({ width: 1200 })
    const node = doc.nodes.win as never
    // Its Shape is Straight: the bend comes from the wall.
    expect((doc.nodes.win as { props: Record<string, unknown> }).props.shape).toBeUndefined()
    const prims = nodePrimitives(node, { doc, registry, depth: 0 })
    // The frame runs along the wall at one side of it: the first line of the window's own, not the
    // sill's outline around both.
    const path = prims.filter((prim) => prim.kind === 'path' && prim.points.length > 2 && prim.points.length < 40)[0] as { points: { x: number; y: number }[] }
    const points = path.points
    // A circle through three of its points: the wall's own radius, half a wall in or out.
    const [a, b, c] = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
    const [aa, bb, cc] = [a.x * a.x + a.y * a.y, b.x * b.x + b.y * b.y, c.x * c.x + c.y * c.y]
    const centre = { x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d, y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d }
    const fit = Math.hypot(a.x - centre.x, a.y - centre.y)
    expect(Math.abs(fit - radius)).toBeCloseTo(100, 0)
  })

  it('takes its length along the wall, stops at its end, and shrinks towards the end that stays', () => {
    const doc = placed({ width: 1200 })
    const node = doc.nodes.win as never
    const wall = doc.nodes.w as never
    const course = courseOf(wall)
    const start = course.project({ x: (node as { x: number }).x, y: (node as { y: number }).y }).along
    // Dragged along the wall: as far as the pointer is round it from the end that stays, and the
    // width kept is the chord of that stretch.
    const arc = (span: number) => 2 * radius * Math.sin(span / (2 * radius))
    const along = kindOf(node).moveHandle!(node, 1, course.at(start + 1800), registry, doc)
    expect(Number((along.props as Record<string, unknown>).width)).toBeCloseTo(arc(1800), 1)
    // Dragged past the wall\'s end: it stops there, as long as the wall leaves it.
    const far = kindOf(node).moveHandle!(node, 1, { x: 5000, y: -4000 }, registry, doc)
    expect(Number((far.props as Record<string, unknown>).width)).toBeLessThanOrEqual(course.length - start + 1e-6)
    // Its start dragged a little towards the far end: that end stays, and the width gives up the rest.
    const to = course.at(start + 400)
    const short = kindOf(node).moveHandle!(node, 0, to, registry, doc)
    expect(Number((short.props as Record<string, unknown>).width)).toBeCloseTo(arc(2 * radius * Math.asin(1200 / (2 * radius)) - 400), 1)
    expect(short.x).toBeCloseTo(to.x, 0)
    expect(short.y).toBeCloseTo(to.y, 0)
  })

  it('is measured round the curve from the chord its width is kept as', () => {
    const doc = placed({ width: 1200 })
    const node = doc.nodes.win as never
    const arc = openingArc(doc, node, registry)
    expect(arc?.radius).toBeCloseTo(radius, 6)
    // What the panel shows: the length of wall the opening takes round the curve.
    const round = arcLengthOfChord(arc!.radius, 1200)
    expect(round).toBeCloseTo(2 * radius * Math.asin(1200 / (2 * radius)), 6)
    // Typed round the curve, it is kept as the chord again: the width the drawing had.
    expect(chordOfArcLength(arc!.radius, round)).toBeCloseTo(1200, 6)
  })
})

describe('a window in a straight wall', () => {
  it('is not measured round a curve, and keeps the width it is given', () => {
    const doc = applyOps(createDocument(), [
      { op: 'add_node', node: { id: 'w', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200 } } as never,
    ])
    const at = snapOpeningToWall(doc, 'page_1', registry, { kind: 'arch.window', props: { width: 1200 } }, { x: 2000, y: 0 }, 2000, 10)
    expect(at).not.toBeNull()
    const made = applyOps(doc, [{ op: 'add_node', node: { id: 'win', type: 'parametric', parent: 'page_1', layer: 'layer_1', kind: 'arch.window', props: { width: 1200 }, ...at! } } as never])
    expect(openingArc(made, made.nodes.win, registry)).toBeNull()
  })
})
