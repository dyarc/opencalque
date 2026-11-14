import { describe, expect, it } from 'vitest'
import { applyOps, buildScene, createDocument, Registry } from '../src'

const registry = new Registry()
describe('the scene cache', () => {
  it('keeps the wall it did not move when a piece of furniture moves', () => {
    const doc = applyOps(createDocument(), [
      { op: 'add_node', node: { id: 'w', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200 } } as never,
      { op: 'add_node', node: { id: 'r', type: 'rect', parent: 'page_1', layer: 'layer_1', x: 500, y: 500, width: 500, height: 500 } } as never,
    ])
    const first = buildScene(doc, 'page_1', registry)
    const next = applyOps(doc, [{ op: 'update_node', id: 'r', patch: { x: 800 } } as never])
    const second = buildScene(next, 'page_1', registry)
    expect(second.find((item) => item.id === 'w')!.prims).toBe(first.find((item) => item.id === 'w')!.prims)
    expect(second.find((item) => item.id === 'r')!.prims).not.toBe(first.find((item) => item.id === 'r')!.prims)
  })
})
