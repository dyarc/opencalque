import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, cutOpeningOps, insidePrimitive, nodePrimitives, Registry, type Document } from '../src'

const registry = new Registry()

const plan = (): Document =>
  applyOps(createDocument('Plan'), [
    { op: 'add_node', node: { id: 'outer', type: 'rect', parent: 'page_1', layer: 'layer_1', x: 0, y: 0, width: 1000, height: 1000, style: { fill: '#eeeeee' } } } as never,
    { op: 'add_node', node: { id: 'inner', type: 'rect', parent: 'page_1', layer: 'layer_1', x: 400, y: 400, width: 200, height: 200 } } as never,
  ])

describe('cutting an opening in a rectangle', () => {
  it('keeps the outer rectangle, cuts the inner one out of its fill, and carried in its own space', () => {
    const doc = plan()
    const ops = cutOpeningOps(doc, ['outer', 'inner'])!
    expect(ops).not.toBeNull()
    const cut = applyOps(doc, ops)
    expect(cut.nodes.inner).toBeUndefined()
    const outer = cut.nodes.outer
    expect(outer.type).toBe('rect')
    expect((outer as never as { holes: unknown[] }).holes).toHaveLength(1)
    const [prim] = nodePrimitives(outer, { doc: cut, registry, depth: 0 })
    expect(prim.kind).toBe('path')
    if (prim.kind !== 'path') return
    expect(prim.holes).toHaveLength(1)
    expect(insidePrimitive(prim, { x: 500, y: 500 })).toBe(false)
    expect(insidePrimitive(prim, { x: 100, y: 100 })).toBe(true)
  })

  it('refuses rectangles that are not inside the outer one', () => {
    const doc = applyOps(plan(), [{ op: 'update_node', id: 'inner', patch: { x: 950, y: 950 } }])
    expect(cutOpeningOps(doc, ['outer', 'inner'])).toBeNull()
  })
})
