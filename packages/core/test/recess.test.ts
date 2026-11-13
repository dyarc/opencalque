import { describe, expect, it } from 'vitest'
import { applyOps, axonometricFaces, createDocument, nodePrimitives, Registry } from '../src'

const registry = new Registry()

const slab = () =>
  applyOps(createDocument('Plan'), [
    {
      op: 'add_node',
      node: {
        id: 'slab',
        type: 'rect',
        parent: 'page_1',
        layer: 'layer_1',
        x: 0,
        y: 0,
        width: 4000,
        height: 3000,
        top: 0,
        bottom: -100,
        recess: { x: 1000, y: 1000, width: 1000, height: 1000, top: 50, bottom: -50 },
      },
    } as never,
  ])

describe('a sunken box in a slab', () => {
  it('is an opening in plan, and a pit with a floor in the 3D view', () => {
    const doc = slab()
    const [prim] = nodePrimitives(doc.nodes.slab, { doc, registry, depth: 0 })
    expect(prim.kind === 'path' && prim.holes).toHaveLength(1)
    const faces = axonometricFaces(doc, 'page_1', registry)
    // The top is drawn around the pit, in four parts, not over it.
    expect(faces.filter((face) => face.kind === 'top')).toHaveLength(4)
    // Its floor is 50 mm above the slab's underside (bottom -100 + recess top 50).
    expect(faces.some((face) => face.kind === 'floor' && face.points.every((p) => p.z === -50))).toBe(true)
    // Walls run from that floor up to the top of the slab.
    expect(faces.some((face) => face.kind === 'side' && face.points.some((p) => p.z === -50) && face.points.some((p) => p.z === 0))).toBe(true)
  })
})
