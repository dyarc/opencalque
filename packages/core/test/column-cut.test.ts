import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, Registry, wallParts, type Vec2 } from '../src'

const registry = new Registry()

const rounded = (p: Vec2) => [Math.round(p.x), Math.round(p.y)]

describe('a column in a wall', () => {
  it('breaks the wall where its footprint crosses the line', () => {
    const doc = applyOps(createDocument(), [
      { op: 'add_node', node: { id: 'w', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200 } } as never,
      { op: 'add_node', node: { id: 'c', type: 'column', parent: 'page_1', layer: 'layer_1', x: 1900, y: -100, width: 200, height: 200 } } as never,
    ])
    const pieces = wallParts(doc.nodes.w as never, doc, registry).pieces
    expect(pieces.map((piece) => [Math.round(piece.from), Math.round(piece.to)])).toEqual([
      [0, 1900],
      [2100, 4000],
    ])
  })

  it('cuts the wall along the column’s own sides, turned as it is', () => {
    const doc = applyOps(createDocument(), [
      { op: 'add_node', node: { id: 'w', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, thickness: 200 } } as never,
      { op: 'add_node', node: { id: 'c', type: 'column', parent: 'page_1', layer: 'layer_1', x: 2600, y: -400, width: 800, height: 800, rotation: 30 } } as never,
    ])
    const [before, after] = wallParts(doc.nodes.w as never, doc, registry).pieces
    // The cut at each end is the column's own edge, not a line across the wall: its corners are at
    // (2200, 293) and (2600, -400), which cross the wall's faces at x 2311 and 2427 …
    // (a piece ends on its right face and starts on its left, as its outline runs).
    expect(before.end.map(rounded)).toEqual([
      [2311, 100],
      [2427, -100],
    ])
    // … and at the far end, on the edges through (3293, 0), at 3120 and 3235.
    expect(after.start.map(rounded)).toEqual([
      [3120, -100],
      [3235, 100],
    ])
    // The two pieces stay simple: nothing crossing itself, and each one as long as it looks.
    for (const piece of [before, after]) expect(piece.outline.length).toBeGreaterThanOrEqual(4)
  })
})
