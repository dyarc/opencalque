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

describe('a pattern on a shape with an opening', () => {
  it('stops at the opening, as the fill does', () => {
    const doc = applyOps(plan(), [{ op: 'update_node', id: 'outer', patch: { style: { fill: '#eeeeee', pattern: { kind: 'Lines', angle: 45, spacing: 100, stroke: '#333333' } } } }])
    const cut = applyOps(doc, cutOpeningOps(doc, ['outer', 'inner'])!)
    const hatches = nodePrimitives(cut.nodes.outer, { doc: cut, registry, depth: 0 }).filter((prim) => prim.kind === 'path' && prim.texture)
    expect(hatches.length).toBeGreaterThan(0)
    // No stretch of a hatch runs through the middle of the opening.
    for (const prim of hatches) {
      if (prim.kind !== 'path') continue
      for (let i = 0; i < prim.points.length - 1; i++) {
        const a = prim.points[i]
        const b = prim.points[i + 1]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        expect(mid.x > 400 && mid.x < 600 && mid.y > 400 && mid.y < 600).toBe(false)
      }
    }
  })
})
