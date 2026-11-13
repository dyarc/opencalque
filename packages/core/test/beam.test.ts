import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, nodePrimitives, Registry } from '../src'

const registry = new Registry()
const beam = (id: string, a: [number, number], b: [number, number], top: number, bottom: number) =>
  ({ op: 'add_node', node: { id, type: 'beam', parent: 'page_1', layer: 'layer_1', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, width: 200, top, bottom } }) as never

describe('beams of one height', () => {
  it('are merged into one shape where they cross, and beams of another height are not', () => {
    const doc = applyOps(createDocument('Plan'), [beam('a', [0, 0], [2000, 0], 2500, 2300), beam('b', [1000, -1000], [1000, 1000], 2500, 2300), beam('c', [0, 2000], [2000, 2000], 2800, 2600)])
    const key = (id: string) => nodePrimitives(doc.nodes[id], { doc, registry, depth: 0 })[0]
    const [a, b, c] = [key('a'), key('b'), key('c')]
    expect(a.kind === 'path' && a.union).toBeTruthy()
    expect(a.kind === 'path' && b.kind === 'path' ? a.union === b.union : false).toBe(true)
    expect(a.kind === 'path' && c.kind === 'path' ? a.union === c.union : true).toBe(false)
  })
})

describe('beams of different heights', () => {
  it('breaks the thinner beam at the deeper one, which runs through', () => {
    // Both at the same top, so only their depth decides: the deeper beam runs through.
    const doc = applyOps(createDocument('Plan'), [beam('deep', [0, 0], [2000, 0], 2500, 2300), beam('thin', [1000, -1000], [1000, 1000], 2500, 2400)])
    const deep = nodePrimitives(doc.nodes.deep, { doc, registry, depth: 0 })
    const thin = nodePrimitives(doc.nodes.thin, { doc, registry, depth: 0 })
    expect(deep.every((prim) => prim.kind === 'path' && prim.closed)).toBe(true)
    expect(thin.some((prim) => prim.kind === 'path' && !prim.closed)).toBe(true)
    for (const prim of thin) {
      if (prim.kind !== 'path') continue
      for (let i = 0; i < prim.points.length - 1; i++) {
        const mid = { x: (prim.points[i].x + prim.points[i + 1].x) / 2, y: (prim.points[i].y + prim.points[i + 1].y) / 2 }
        expect(mid.x > 900 && mid.x < 1100).toBe(false)
      }
    }
  })
})
