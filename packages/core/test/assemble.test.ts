import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, explodeOps, joinOps, parseDocument, serializeDocument, type Document, type NodeOf, type Op } from '../src'

const add = (node: Record<string, unknown>): Op => ({ op: 'add_node', node: { parent: 'page_1', ...node } }) as Op
const line = (id: string, ax: number, ay: number, bx: number, by: number, more: Record<string, unknown> = {}) => add({ type: 'line', id, a: { x: ax, y: ay }, b: { x: bx, y: by }, ...more })
const polyline = (id: string, points: [number, number][], more: Record<string, unknown> = {}) => add({ type: 'polyline', id, points: points.map(([x, y]) => ({ x, y })), ...more })
const shapes = (doc: Document) => Object.values(doc.nodes).filter((node) => node.type === 'line' || node.type === 'polyline')

describe('exploding', () => {
  it('draws a closed polygon as one line per side, in its layer and its look', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [2000, 0], [2000, 1000], [0, 1000]], { closed: true, style: { stroke: '#c00' } })])
    const out = explodeOps(doc, ['p'])!
    expect(out.ids).toHaveLength(4)
    const after = applyOps(doc, out.ops)
    expect(after.nodes.p).toBeUndefined()
    const lines = Object.values(after.nodes).filter((node) => node.type === 'line')
    expect(lines).toHaveLength(4)
    expect(new Set(lines.map((node) => JSON.stringify([(node as NodeOf<'line'>).a, (node as NodeOf<'line'>).b])))).toHaveLength(4)
    for (const piece of lines) expect(piece).toMatchObject({ type: 'line', style: { stroke: '#c00' } })
  })

  it('draws an arc inside a polyline as an arc, not as its chord', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [1000, 0], [1000, 1000]], { bulges: [Math.tan(Math.PI / 8), 0] })])
    const out = explodeOps(doc, ['p'])!
    const after = applyOps(doc, out.ops)
    const pieces = out.ids.map((id) => after.nodes[id])
    expect(pieces.map((node) => node.type).sort()).toEqual(['ellipse', 'line'])
    const arc = pieces.find((node) => node.type === 'ellipse') as NodeOf<'ellipse'>
    expect(arc.rx).toBeCloseTo(1000 / (2 * Math.sin(Math.PI / 4)), 6)
    expect(arc.from).not.toBeUndefined()
  })

  it('keeps its arcs through a save and read, and says the version that knows them', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [1000, 0], [1000, 1000]], { bulges: [Math.tan(Math.PI / 8), 0] })])
    const text = serializeDocument(doc)
    expect(JSON.parse(text).version).toBe(4)
    const read = parseDocument(JSON.parse(text))
    expect((read.nodes.p as NodeOf<'polyline'>).bulges).toEqual([Math.tan(Math.PI / 8), 0])
  })

  it('leaves a line with an arc out of joining, where its points alone would lose the arc', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [1000, 0], [1000, 1000]], { bulges: [Math.tan(Math.PI / 8), 0] }), line('l', 1000, 1000, 2000, 1000)])
    expect(joinOps(doc, ['p', 'l'])).toBeNull()
  })

  it('draws an open polyline as its segments, and a rectangle as its four sides', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [1000, 0], [1000, 500]]), add({ type: 'rect', id: 'r', x: 2000, y: 0, width: 1000, height: 800 })])
    const open = explodeOps(doc, ['p'])!
    expect(open.ids).toHaveLength(2)
    const rect = explodeOps(doc, ['r'])!
    expect(rect.ids).toHaveLength(4)
  })
})

describe('joining', () => {
  it('joins lines end to end into one open polyline', () => {
    const doc = applyOps(createDocument('Plan'), [line('a', 0, 0, 1000, 0), line('b', 1000, 0, 1000, 800), line('c', 4000, 0, 5000, 0)])
    const out = joinOps(doc, ['a', 'b', 'c'])!
    expect(out.ids).toHaveLength(1)
    const after = applyOps(doc, out.ops)
    const joined = after.nodes[out.ids[0]] as NodeOf<'polyline'>
    expect(joined).toMatchObject({ type: 'polyline', points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }] })
    expect(joined.closed).toBeFalsy()
    // The line that touches nothing is left as it was.
    expect(after.nodes.c).toBeDefined()
  })

  it('closes the shape when the lines form a loop, and leaves it open otherwise', () => {
    const loop = applyOps(createDocument('Plan'), [
      line('n', 0, 0, 1000, 0),
      line('e', 1000, 0, 1000, 1000),
      line('s', 1000, 1000, 0, 1000),
      line('w', 0, 1000, 0, 0),
    ])
    const closed = joinOps(loop, ['n', 'e', 's', 'w'])!
    const shape = applyOps(loop, closed.ops).nodes[closed.ids[0]] as NodeOf<'polyline'>
    expect(shape).toMatchObject({ type: 'polyline', closed: true })
    expect(shape.points).toHaveLength(4)
  })

  it('joins two polylines and a line into one, whichever way each runs', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [1000, 0]]), polyline('q', [[2000, 0], [2000, 800]]), line('l', 2000, 0, 1000, 0)])
    const out = joinOps(doc, ['p', 'q', 'l'])!
    const joined = applyOps(doc, out.ops).nodes[out.ids[0]] as NodeOf<'polyline'>
    expect(joined.points).toEqual([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 800 }])
  })

  it('leaves a corner where three lines meet alone, and says how many', () => {
    const doc = applyOps(createDocument('Plan'), [line('a', 0, 0, 1000, 0), line('b', 1000, 0, 2000, 0), line('c', 1000, 0, 1000, 1000)])
    expect(joinOps(doc, ['a', 'b', 'c'])).toBeNull()
  })

  it('goes back and forth with exploding, open and closed', () => {
    const doc = applyOps(createDocument('Plan'), [polyline('p', [[0, 0], [1000, 0], [1000, 800]], { closed: false }), polyline('q', [[5000, 0], [6000, 0], [6000, 800], [5000, 800]], { closed: true })])
    for (const id of ['p', 'q']) {
      const exploded = explodeOps(doc, [id])!
      const again = joinOps(applyOps(doc, exploded.ops), exploded.ids)!
      const shape = applyOps(applyOps(doc, exploded.ops), again.ops).nodes[again.ids[0]] as NodeOf<'polyline'>
      const before = doc.nodes[id] as NodeOf<'polyline'>
      expect(shape.points).toEqual(before.points)
      expect(!!shape.closed).toBe(!!before.closed)
    }
  })

  it('counts what it could not join', () => {
    const doc = applyOps(createDocument('Plan'), [line('a', 0, 0, 1000, 0), line('b', 1000, 0, 1000, 800), line('c', 4000, 0, 5000, 0)])
    const out = joinOps(doc, ['a', 'b', 'c'])!
    expect(out.skipped).toBe(1)
    expect(shapes(doc)).toHaveLength(3)
  })
})
