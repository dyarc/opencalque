import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, DEFAULT_MATERIAL, nodePrimitives, Registry, WALL_FILL } from '../src'

const registry = new Registry()

// A column drawn in the fill of its material, as a wall is: its own style has no fill to give.
describe('a column and its material', () => {
  const doc = applyOps(createDocument(), [
    { op: 'add_material', material: { id: 'concrete', name: 'Concrete', fill: '#c9c5c0', pattern: { kind: 'Lines', strokeWidth: 1, spacing: 300, angle: 45 } } },
    { op: 'add_node', node: { id: 'plain', type: 'column', parent: 'page_1', layer: 'layer_1', x: 0, y: 0, width: 400, height: 400 } } as never,
    { op: 'add_node', node: { id: 'made', type: 'column', parent: 'page_1', layer: 'layer_1', x: 1000, y: 0, width: 400, height: 400, material: 'concrete' } } as never,
    { op: 'add_node', node: { id: 'own', type: 'column', parent: 'page_1', layer: 'layer_1', x: 2000, y: 0, width: 400, height: 400, material: 'concrete', style: { fill: '#123456' } } } as never,
  ])
  const fills = (id: string) => nodePrimitives(doc.nodes[id] as never, { doc, registry, depth: 0 }).filter((p) => p.kind === 'path')

  it('takes the fill and the pattern of the material it is made of', () => {
    const [shape] = fills('made')
    expect(shape.kind === 'path' && shape.fill).toBe('#c9c5c0')
    // The pattern is laid on it as strokes of its own, over the fill.
    expect(fills('made').length).toBeGreaterThan(1)
  })

  it('is the white of the paper when it names no material, as a wall of none is', () => {
    const [shape] = fills('plain')
    // A drawing's default material, where it has one, or the paper: it is never left unfilled.
    expect(shape.kind === 'path' && shape.fill).toBe(doc.materials?.[DEFAULT_MATERIAL]?.fill ?? WALL_FILL)
    expect(shape.kind === 'path' && shape.fill).toBeTruthy()
  })

  it('keeps a fill it was given of its own, as a wall taken from before materials', () => {
    const [shape] = fills('own')
    expect(shape.kind === 'path' && shape.fill).toBe('#123456')
  })
})
