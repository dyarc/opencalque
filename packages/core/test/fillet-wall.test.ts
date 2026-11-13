import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, filletOps, type Document } from '../src'

const plan = (): Document =>
  applyOps(createDocument('Plan'), [
    { op: 'add_node', node: { id: 'w1', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 2000, y: 0 }, thickness: 200 } } as never,
    { op: 'add_node', node: { id: 'w2', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 2000, y: 0 }, b: { x: 2000, y: 2000 }, thickness: 200 } } as never,
  ])

describe('filleting walls', () => {
  it('cuts both walls back to the tangent points and joins them with a curved wall of their thickness', () => {
    const doc = plan()
    const ops = filletOps({ node: doc.nodes.w1 as never, at: { x: 1000, y: 0 } }, { node: doc.nodes.w2 as never, at: { x: 2000, y: 1000 } }, 300, 'arc')!
    expect(ops).not.toBeNull()
    const cut = applyOps(doc, ops)
    const w1 = cut.nodes.w1 as never as { b: { x: number; y: number } }
    const w2 = cut.nodes.w2 as never as { a: { x: number; y: number } }
    expect(w1.b.x).toBeCloseTo(1700, 6)
    expect(w2.a.y).toBeCloseTo(300, 6)
    const arc = cut.nodes.arc as never as { type: string; bulge?: number; thickness?: number; a: { x: number; y: number }; b: { x: number; y: number } }
    expect(arc.type).toBe('wall')
    expect(Math.abs(arc.bulge ?? 0)).toBeGreaterThan(50)
    expect(arc.thickness).toBe(200)
    expect(arc.a.x).toBeCloseTo(1700, 6)
    expect(arc.b.y).toBeCloseTo(300, 6)
  })
})
