import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, Registry, wallParts } from '../src'

const registry = new Registry()

describe('a column in a wall', () => {
  it('breaks the wall where its footprint crosses the line', () => {
    const doc = applyOps(createDocument(), [
      { op: 'add_node', node: { id: 'w', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200 } } as never,
      { op: 'add_node', node: { id: 'c', type: 'column', parent: 'page_1', layer: 'layer_1', x: 1900, y: -100, width: 200, height: 200 } } as never,
    ])
    const wall = doc.nodes.w as never as { a: { x: number; y: number }; b: { x: number; y: number }; thickness: number; id: string; parent: string; layer: string; type: 'wall' }
    const pieces = wallParts(wall, doc, registry).pieces
    expect(pieces.map((piece) => [Math.round(piece.from), Math.round(piece.to)])).toEqual([
      [0, 1900],
      [2100, 4000],
    ])
  })
})
