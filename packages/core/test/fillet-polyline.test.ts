import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, filletOps, type Document, type NodeOf, type Op } from '../src'

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
    const points = (out.nodes.p as NodeOf<'polyline'>).points
    expect((out.nodes.p as NodeOf<'polyline'>).closed).toBeFalsy()
    // Kept ends, the two tangent points, and enough points between them to look round.
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[1]).toMatchObject({ x: 1700, y: 0 })
    expect(points.at(-1)).toEqual({ x: 2000, y: 2000 })
    expect(points.at(-2)).toMatchObject({ x: 2000, y: 300 })
    expect(points.length).toBeGreaterThan(20)
    // The corner itself is gone; the arc stays inside it, near (2000 - 300, 0) to (2000, 300).
    expect(points.some((p) => p.x === 2000 && p.y === 0)).toBe(false)
    expect(out.nodes.arc).toBeUndefined()
  })

  it('keeps a closed polyline closed when one of its corners is rounded', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [2000, 0], [2000, 2000], [0, 2000]], true)])
    const out = filleted(doc, { id: 'p', segment: 0, at: [1000, 0] }, { id: 'p', segment: 1, at: [2000, 1000] }, 300)!
    const points = (out.nodes.p as NodeOf<'polyline'>).points
    expect((out.nodes.p as NodeOf<'polyline'>).closed).toBe(true)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[1]).toMatchObject({ x: 1700, y: 0 })
    expect(points.at(-1)).toEqual({ x: 0, y: 2000 })
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
