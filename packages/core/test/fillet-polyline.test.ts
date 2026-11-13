import { describe, expect, it } from 'vitest'
import { applyOps, bulgePoints, createDocument, filletOps, nodePrimitives, Registry, transformOps, type Document, type NodeOf, type Op } from '../src'

const add = (node: Record<string, unknown>): Op => ({ op: 'add_node', node: { parent: 'page_1', ...node } }) as Op
const line = (id: string, ax: number, ay: number, bx: number, by: number) => add({ type: 'line', id, a: { x: ax, y: ay }, b: { x: bx, y: by } })
const polyline = (id: string, points: [number, number][], closed = false) => add({ type: 'polyline', id, points: points.map(([x, y]) => ({ x, y })), closed })

/** The polyline `id`, after a fillet of the stretches given, by segment index and click. */
const filleted = (doc: Document, first: { id: string; segment: number; at: [number, number] }, second: { id: string; segment?: number; at: [number, number] }, radius: number) => {
  const ops = filletOps(
    { node: doc.nodes[first.id] as NodeOf<'polyline'>, segment: first.segment, at: { x: first.at[0], y: first.at[1] } },
    { node: doc.nodes[second.id] as NodeOf<'line' | 'polyline'>, segment: second.segment, at: { x: second.at[0], y: second.at[1] } },
    radius,
    'arc',
  )
  return ops && applyOps(doc, ops)
}

describe('filleting a polyline', () => {
  it('rounds a corner of one polyline in place, the arc laid in as short straight stretches', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [2000, 0], [2000, 2000]])])
    const out = filleted(doc, { id: 'p', segment: 0, at: [1000, 0] }, { id: 'p', segment: 1, at: [2000, 1000] }, 300)!
    const shape = out.nodes.p as NodeOf<'polyline'>
    expect(shape.closed).toBeFalsy()
    // The corner becomes the two tangent points, and the true arc is kept as their bulge.
    expect(shape.points).toEqual([{ x: 0, y: 0 }, { x: 1700, y: 0 }, { x: 2000, y: 300 }, { x: 2000, y: 2000 }])
    expect(shape.bulges).toHaveLength(3)
    expect(Math.abs(shape.bulges![1])).toBeCloseTo(Math.tan(Math.PI / 8), 6)
    expect(shape.bulges![0]).toBe(0)
    expect(shape.bulges![2]).toBe(0)
    expect(out.nodes.arc).toBeUndefined()
    // Drawn, the arc is a smooth run of points between its ends.
    const drawn = nodePrimitives(shape, { doc: out, registry: new Registry(), depth: 0 })
    const path = drawn[0]
    if (path.kind !== 'path') throw new Error('not a path')
    expect(path.points.length).toBeGreaterThan(20)
  })

  it('keeps a closed polyline closed when one of its corners is rounded', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [2000, 0], [2000, 2000], [0, 2000]], true)])
    const out = filleted(doc, { id: 'p', segment: 0, at: [1000, 0] }, { id: 'p', segment: 1, at: [2000, 1000] }, 300)!
    const shape = out.nodes.p as NodeOf<'polyline'>
    expect(shape.closed).toBe(true)
    expect(shape.points[0]).toEqual({ x: 0, y: 0 })
    expect(shape.points[1]).toMatchObject({ x: 1700, y: 0 })
    expect(shape.points.at(-1)).toEqual({ x: 0, y: 2000 })
    expect(shape.bulges).toHaveLength(5)
  })

  it('cuts an open polyline back to where an arc takes over from a line, and adds the arc', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [1000, 0]]), line('up', 2000, -1000, 2000, 1000)])
    const out = filleted(doc, { id: 'p', segment: 0, at: [900, 0] }, { id: 'up', at: [2000, 500] }, 200)!
    expect((out.nodes.p as NodeOf<'polyline'>).points).toEqual([{ x: 0, y: 0 }, { x: 1800, y: 0 }])
    expect(out.nodes.up).toMatchObject({ a: { x: 2000, y: 200 }, b: { x: 2000, y: 1000 } })
    const arc = out.nodes.arc as NodeOf<'ellipse'>
    expect(arc).toMatchObject({ type: 'ellipse', rx: 200, ry: 200 })
  })

  it('refuses a corner of a polyline that is not where the two stretches meet, and one it would have to break', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [2000, 0], [2000, 2000], [4000, 2000]]), line('up', 2000, -1000, 2000, 1000)])
    // Two segments that are not neighbours: no single corner to round.
    expect(filleted(doc, { id: 'p', segment: 0, at: [1000, 0] }, { id: 'p', segment: 2, at: [3000, 2000] }, 100)).toBeNull()
    // A middle vertex against another line: cutting it back would bend the rest of the polyline.
    expect(filleted(doc, { id: 'p', segment: 0, at: [1000, 0] }, { id: 'up', at: [2000, 500] }, 100)).toBeNull()
  })
})

describe('the bulge of an arc', () => {
  it('turns over with a mirrored line, its arc bowing the other way', () => {
    const doc = applyOps(createDocument('Plan'), [{ op: 'add_node', node: { id: 'p', type: 'polyline', parent: 'page_1', points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], bulges: [Math.tan(Math.PI / 8)] } } as never])
    const out = applyOps(doc, transformOps(doc, [doc.nodes.p], { pivot: { x: 500, y: 0 }, mirror: true }, new Registry()))
    expect((out.nodes.p as NodeOf<'polyline'>).bulges![0]).toBeCloseTo(-Math.tan(Math.PI / 8), 9)
  })

  it('bows to the left of the way it runs when positive, to the right when negative, by the sagitta it says', () => {
    const up = bulgePoints({ x: 0, y: 0 }, { x: 1000, y: 0 }, Math.tan(Math.PI / 8))
    const middle = up[Math.floor(up.length / 2)]
    expect(middle.x).toBeCloseTo(500, 6)
    expect(middle.y).toBeLessThan(-200)
    const down = bulgePoints({ x: 0, y: 0 }, { x: 1000, y: 0 }, -Math.tan(Math.PI / 8))
    expect(down[Math.floor(down.length / 2)].y).toBeGreaterThan(200)
  })
})
