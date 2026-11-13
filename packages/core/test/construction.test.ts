import { describe, expect, it } from 'vitest'
import { applyOps, buildScene, canOffset, CONSTRUCTION_DASH, constructionEnds, createDocument, hitTest, nodePrimitives, offsetOps, parseDocument, Registry, sceneBounds, serializeDocument, snapTo, toSVG, type Document, type NodeOf } from '../src'

/*
 * Construction lines: endless dashed guides through two points, drawn across the view, never
 * printed, and nowhere in the drawing to fit or measure — but lines to snap onto and pick.
 */

const registry = new Registry()

/** A page with a construction line along y = 0 from x = 0 to x = 1000, and whatever else is given. */
const plan = (extra = false): Document =>
  applyOps(
    createDocument('Plan'),
    [
      { op: 'add_node', node: { id: 'guide', type: 'construction', parent: 'page_1', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } } },
      ...(extra ? [{ op: 'add_node', node: { id: 'line', type: 'line', parent: 'page_1', a: { x: 0, y: 2000 }, b: { x: 1000, y: 2000 } } } as const] : []),
    ] as never,
  )

const guide = (doc: Document) => doc.nodes.guide as NodeOf<'construction'>

describe('a construction line', () => {
  it('is drawn a kilometre either way, dashed, through its two points', () => {
    const prims = nodePrimitives(guide(plan()), { doc: plan(), registry, depth: 0 })
    expect(prims).toHaveLength(1)
    const [path] = prims
    expect(path.kind).toBe('path')
    if (path.kind !== 'path') return
    expect(path.dash).toEqual(CONSTRUCTION_DASH)
    expect(path.points[0].x).toBeCloseTo(-1e6, 6)
    expect(path.points[1].x).toBeCloseTo(1e6 + 1000, 6)
    expect(path.points[0].y).toBeCloseTo(0, 6)
  })

  it('is nowhere to fit or frame: a page of it has no bounds, and a line beside it has its own', () => {
    const alone = buildScene(plan(), 'page_1', registry)
    expect(sceneBounds(alone)).toBeNull()
    const withLine = buildScene(plan(true), 'page_1', registry)
    expect(sceneBounds(withLine)).toMatchObject({ minX: 0, minY: 2000, maxX: 1000, maxY: 2000 })
    expect(constructionEnds(guide(plan()))).not.toBeNull()
  })

  it('is picked and snapped to along its whole length, far past its two points', () => {
    const scene = buildScene(plan(), 'page_1', registry)
    expect(hitTest(scene, { x: 400_000, y: 0 }, 1)?.id).toBe('guide')
    expect(hitTest(scene, { x: 400_000, y: 50 }, 1)).toBeNull()
    const snap = snapTo(scene, { x: 400_000, y: 5 }, 20)
    expect(snap).toMatchObject({ kind: 'edge', p: { x: 400_000, y: 0 } })
  })

  it('is never printed or exported', () => {
    const svg = toSVG(plan(true), 'page_1', registry)
    expect(svg.match(/<path/g) ?? []).toHaveLength(1)
    // The dashed guide is not in it; the 1 km reach of one would show in the numbers it writes.
    expect(svg).not.toContain('999999')
  })

  it('writes the format version it needs, and leaves drawings without one as they were', () => {
    expect(JSON.parse(serializeDocument(plan())).version).toBe(4)
    expect(JSON.parse(serializeDocument(plan(true))).version).toBe(4)
    const plain = applyOps(createDocument('Plain'), [{ op: 'add_node', node: { id: 'l', type: 'line', parent: 'page_1', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } } as never }])
    expect(JSON.parse(serializeDocument(plain)).version).toBe(2)
    expect(parseDocument(JSON.parse(serializeDocument(plan()))).nodes.guide).toMatchObject({ type: 'construction' })
  })

  it('is no part of the size of a group it is put in, and is still picked in it', () => {
    const doc = applyOps(plan(true), [
      { op: 'add_node', node: { id: 'g', type: 'group', parent: 'page_1' } },
      { op: 'update_node', id: 'guide', patch: { parent: 'g' } },
      { op: 'update_node', id: 'line', patch: { parent: 'g' } },
    ] as never)
    const scene = buildScene(doc, 'page_1', registry)
    expect(scene).toHaveLength(1)
    expect(sceneBounds(scene)).toMatchObject({ minX: 0, minY: 2000, maxX: 1000, maxY: 2000 })
    expect(hitTest(scene, { x: 400_000, y: 0 }, 1)?.id).toBe('g')
    expect((toSVG(doc, 'page_1', registry).match(/<path/g) ?? []).length).toBe(1)
  })

  it('is no place to snap a point to, though its line is', () => {
    const scene = buildScene(plan(), 'page_1', registry)
    const own = nodePrimitives(guide(plan()), { doc: plan(), registry, depth: 0 })
    expect(own.length).toBe(1)
    // The ends of the drawn kilometres are no points of the drawing to snap to.
    expect(snapTo(scene, { x: 1e6 + 1000, y: 0 }, 5)).not.toMatchObject({ kind: 'point' })
  })
})

describe('offsetting a construction line', () => {
  it('makes another endless guide parallel to it, at the distance asked', () => {
    const doc = plan()
    expect(canOffset(doc.nodes.guide)).toBe(true)
    const copy = offsetOps(doc, doc.nodes.guide, 500)!
    const made = applyOps(doc, copy.ops)
    const node = made.nodes[copy.id]
    expect(node.type).toBe('construction')
    expect(Math.abs((node as never as { a: { y: number } }).a.y)).toBeCloseTo(500, 6)
    const [prim] = nodePrimitives(node, { doc: made, registry, depth: 0 })
    expect(prim.kind === 'path' && prim.dash).toEqual(CONSTRUCTION_DASH)
  })
})
