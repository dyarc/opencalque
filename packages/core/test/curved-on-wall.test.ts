import { describe, expect, it } from 'vitest'
import { architecture } from '../../ext-architecture/src'
import { applyOps, createDocument, nodePrimitives, Registry, snapOpeningToWall, type Document } from '../src'

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
