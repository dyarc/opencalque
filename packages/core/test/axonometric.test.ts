import { describe, expect, it } from 'vitest'
import { applyOps, axoDepth, axoProject, axonometricFaces, createDocument, type Op } from '../src'

const registry = {} as never

const plan = () =>
  applyOps(createDocument('Plan'), [
    { op: 'update_node', id: 'page_1', patch: { wallHeight: 2600 } } as never,
    ...(
      [
        ['n', [0, 0], [4000, 0]],
        ['e', [4000, 0], [4000, 3000]],
        ['s', [4000, 3000], [0, 3000]],
        ['w', [0, 3000], [0, 0]],
      ] as [string, number[], number[]][]
    ).map(([id, a, b]): Op => ({ op: 'add_node', node: { id, type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, thickness: 200 } } as never)),
    { op: 'add_node', node: { id: 'r', type: 'room', parent: 'page_1', layer: 'layer_1', name: 'Room', x: 2000, y: 1500 } } as never,
  ])

describe('axonometric faces', () => {
  it('stands a wall up as a top and four sides, and lays a room floor at the floor', () => {
    const doc = plan()
    const faces = axonometricFaces(doc, 'page_1', registry)
    const wall = faces.filter((face) => face.kind !== 'floor')
    // A top and four sides, unless the wall has no width: it is a box.
    expect(wall.filter((face) => face.kind === 'top')).toHaveLength(4)
    expect(wall.filter((face) => face.kind === 'side').length).toBeGreaterThan(0)
    expect(wall.every((face) => face.points.every((p) => p.z === 0 || p.z === 2600))).toBe(true)
    // The room's floor, and it is at the floor.
    const floor = faces.filter((face) => face.kind === 'floor')
    expect(floor).toHaveLength(1)
    expect(floor[0].points.every((p) => p.z === 0)).toBe(true)
  })

  it('projects without perspective, so that parallel lines stay parallel, and the height stands up the page', () => {
    const a = axoProject({ x: 0, y: 0, z: 0 }, 0, 1, { x: 0, y: 0 })
    const b = axoProject({ x: 1000, y: 0, z: 0 }, 0, 1, { x: 0, y: 0 })
    const c = axoProject({ x: 2000, y: 0, z: 0 }, 0, 1, { x: 0, y: 0 })
    expect(b.x - a.x).toBeCloseTo(c.x - b.x, 9)
    expect(b.y - a.y).toBeCloseTo(c.y - b.y, 9)
    const up = axoProject({ x: 0, y: 0, z: 1000 }, 0, 1, { x: 0, y: 0 })
    expect(up.x).toBeCloseTo(a.x, 9)
    expect(up.y).toBeLessThan(a.y)
    // Turning the view turns the drawing with it.
    const turned = axoProject({ x: 1000, y: 0, z: 0 }, 1, 1, { x: 0, y: 0 })
    expect(turned.x).not.toBeCloseTo(b.x, 3)
  })

  it('sorts by how near the camera a point is', () => {
    expect(axoDepth({ x: 1000, y: 0, z: 0 }, 0)).toBeGreaterThan(axoDepth({ x: 0, y: 0, z: 0 }, 0))
  })
})

describe('structural solids in the axonometric view', () => {
  it('stands slabs, columns and beams up between their bottom and their top', () => {
    const doc = applyOps(createDocument('Plan'), [
      { op: 'add_node', node: { id: 'slab', type: 'rect', parent: 'page_1', layer: 'layer_1', x: 0, y: 0, width: 3000, height: 2000, top: 2700, bottom: 2500 } } as never,
      { op: 'add_node', node: { id: 'col', type: 'column', parent: 'page_1', layer: 'layer_1', x: 1000, y: 500, width: 300, height: 300, top: 2700, bottom: 0 } } as never,
      { op: 'add_node', node: { id: 'beam', type: 'beam', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, width: 200, top: 2700, bottom: 2400 } } as never,
    ])
    const faces = axonometricFaces(doc, 'page_1', registry)
    expect(faces.some((face) => face.points.every((p) => p.z === 2500 || p.z === 2700))).toBe(true)
    expect(faces.some((face) => face.points.every((p) => p.z === 0 || p.z === 2700))).toBe(true)
    expect(faces.some((face) => face.points.every((p) => p.z === 2400 || p.z === 2700))).toBe(true)
  })
})
