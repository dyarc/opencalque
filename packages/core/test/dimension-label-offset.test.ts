import { describe, expect, it } from 'vitest'
import { createDocument, nodePrimitives, type Document } from '../src'

const doc = (node: Record<string, unknown>): Document => ({ ...createDocument(), nodes: { ...createDocument().nodes, d: { parent: 'page_1', layer: 'layer_1', ...node } as never } })

describe('a dimension label', () => {
  it('moves away from its line when textOffset says so', () => {
    const base = { type: 'dimension', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, offset: 300, id: 'd' }
    const [atZero] = nodePrimitives(doc(base).nodes.d, { doc: doc(base), registry: undefined as never, depth: 0 }).filter((p) => p.kind === 'text')
    const [moved] = nodePrimitives(doc({ ...base, textOffset: { x: 200, y: 100 } }).nodes.d, { doc: doc({ ...base, textOffset: { x: 200, y: 100 } }), registry: undefined as never, depth: 0 }).filter((p) => p.kind === 'text')
    expect(moved).toMatchObject({ x: (atZero as { x: number }).x + 200, y: (atZero as { y: number }).y + 100 })
  })
})
