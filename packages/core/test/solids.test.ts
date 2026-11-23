import { describe, expect, it } from 'vitest'
import { architecture } from '../../ext-architecture/src'
import { applyOps, buildingSolids, createDocument, faceTriangles, pointInPolygon, Registry, snapOpeningToWall, solidTriangles, solidsBounds, type Point3 } from '../src'

const registry = new Registry().use(architecture)

/** A room of four walls 3200 high, 200 thick, and the room they hold. */
const room = () =>
  applyOps(createDocument('Plan'), [
    { op: 'update_node', id: 'page_1', patch: { wallHeight: 3200 } } as never,
    ...(
      [
        ['n', [0, 0], [4000, 0]],
        ['e', [4000, 0], [4000, 3000]],
        ['s', [4000, 3000], [0, 3000]],
        ['w', [0, 3000], [0, 0]],
      ] as [string, number[], number[]][]
    ).map(([id, a, b]): never => ({ op: 'add_node', node: { id, type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, thickness: 200 } }) as never),
    { op: 'add_node', node: { id: 'r', type: 'room', parent: 'page_1', layer: 'layer_1', name: 'Room', x: 2000, y: 1500 } } as never,
  ])

/** The same room, with a door or a window set in its north wall. */
const opened = (kind: string, props: Record<string, unknown>) => {
  const doc = room()
  const at = snapOpeningToWall(doc, 'page_1', registry, { kind, props }, { x: 2000, y: 0 }, 1000, 10)
  expect(at).not.toBeNull()
  return applyOps(doc, [{ op: 'add_node', node: { id: 'o', type: 'parametric', parent: 'page_1', layer: 'layer_1', kind, props, ...at! } } as never])
}

const heights = (points: Point3[]) => [...new Set(points.map((p) => Math.round(p.z)))].sort((a, b) => a - b)
const zs = (solid: { faces: Point3[][] }) => heights(solid.faces.flat())
const area = (a: Point3, b: Point3, c: Point3) => {
  const [ux, uy] = [b.x - a.x, b.y - a.y]
  const [vx, vy] = [c.x - a.x, c.y - a.y]
  return Math.abs(ux * vy - uy * vx) / 2
}

describe('the solids of a drawing', () => {
  it('stands each wall up as a box, and lays the room floor at the floor', () => {
    const doc = room()
    const solids = buildingSolids(doc, 'page_1', registry)
    const walls = solids.filter((solid) => solid.kind === 'wall')
    expect(walls).toHaveLength(4)
    // From the floor to the height of the page, and every face of the box is there.
    for (const wall of walls) {
      expect(zs(wall)).toEqual([0, 3200])
      expect(wall.faces.length).toBeGreaterThanOrEqual(6)
    }
    const floors = solids.filter((solid) => solid.kind === 'floor')
    expect(floors).toHaveLength(1)
    expect(zs(floors[0])).toEqual([0])
  })

  it('leaves the sill under a window, the wall above it, and a pane of glass between', () => {
    const doc = opened('arch.window', { width: 1200, height: 1200, sillHeight: 900 })
    const solids = buildingSolids(doc, 'page_1', registry)
    // The wall itself is in two stretches, one either side of the window.
    expect(solids.filter((solid) => solid.id === 'n' && solid.kind === 'wall')).toHaveLength(2)
    const ofWindow = solids.filter((solid) => solid.id === 'o')
    const panes = ofWindow.filter((solid) => solid.kind === 'glass')
    const panels = ofWindow.filter((solid) => solid.kind === 'wall')
    expect(panes).toHaveLength(1)
    expect(panels).toHaveLength(2)
    const [glass] = zs(panes[0])
    expect(glass).toBeGreaterThan(0)
    expect(glass).toBeLessThan(3200)
    // One panel from the floor up to the glass, one from the top of the glass to the top of the wall.
    const [low, high] = panels.map(zs).sort((a, b) => a[0] - b[0])
    expect(low[0]).toBe(0)
    expect(low[1]).toBe(glass)
    expect(high[1]).toBe(3200)
    expect(high[0]).toBeGreaterThan(glass)
  })

  it('leaves a door open to the floor, with the wall above it', () => {
    const doc = opened('arch.door', { width: 900, height: 2100 })
    const ofDoor = buildingSolids(doc, 'page_1', registry).filter((solid) => solid.id === 'o')
    expect(ofDoor.filter((solid) => solid.kind === 'glass')).toHaveLength(0)
    const panels = ofDoor.filter((solid) => solid.kind === 'wall')
    expect(panels).toHaveLength(1)
    const [bottom, top] = zs(panels[0])
    expect(bottom).toBeGreaterThan(0)
    expect(top).toBe(3200)
  })

  it('stands slabs, columns and beams between their bottom and their top', () => {
    const doc = applyOps(createDocument('Plan'), [
      { op: 'add_node', node: { id: 'slab', type: 'rect', parent: 'page_1', layer: 'layer_1', x: 0, y: 0, width: 3000, height: 2000, top: 2700, bottom: 2500 } } as never,
      { op: 'add_node', node: { id: 'col', type: 'column', parent: 'page_1', layer: 'layer_1', x: 1000, y: 500, width: 300, height: 300, top: 2700, bottom: 0 } } as never,
      { op: 'add_node', node: { id: 'beam', type: 'beam', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, width: 200, top: 2700, bottom: 2400 } } as never,
      { op: 'add_node', node: { id: 'poly', type: 'polyline', parent: 'page_1', layer: 'layer_1', points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }], closed: true, top: 3000, bottom: 2800 } } as never,
    ])
    const solids = buildingSolids(doc, 'page_1', registry)
    const at = (id: string) => solids.find((solid) => solid.id === id)
    expect(at('slab') && zs(at('slab')!)).toEqual([2500, 2700])
    expect(at('slab')?.kind).toBe('slab')
    expect(at('col') && zs(at('col')!)).toEqual([0, 2700])
    expect(at('col')?.kind).toBe('column')
    expect(at('beam') && zs(at('beam')!)).toEqual([2400, 2700])
    expect(at('beam')?.kind).toBe('beam')
    expect(at('poly') && zs(at('poly')!)).toEqual([2800, 3000])
  })
})

describe('the faces of a solid', () => {
  const L: Point3[] = [
    { x: 0, y: 0, z: 0 },
    { x: 3000, y: 0, z: 0 },
    { x: 3000, y: 1000, z: 0 },
    { x: 1000, y: 1000, z: 0 },
    { x: 1000, y: 3000, z: 0 },
    { x: 0, y: 3000, z: 0 },
  ]

  it('cuts a face that is not a triangle into triangles that keep its area, corners inside it or not', () => {
    // An L, whose corner is inside the shape: the triangles must not run across the notch.
    const triangles = faceTriangles(L)
    expect(triangles).toHaveLength(4)
    const total = triangles.reduce((sum, [a, b, c]) => sum + area(L[a], L[b], L[c]), 0)
    expect(total).toBeCloseTo(5000000, 3)
    // Every triangle lies inside the L: its middle is in it.
    for (const [a, b, c] of triangles) {
      const middle = { x: (L[a].x + L[b].x + L[c].x) / 3, y: (L[a].y + L[b].y + L[c].y) / 3 }
      expect(pointInPolygon(middle, L)).toBe(true)
    }
  })

  it('cuts a face the same way whichever way round its points are given', () => {
    // A face given the other way round is the same face: it must not come out as one sheet across it.
    const back = [...L].reverse()
    const triangles = faceTriangles(back)
    expect(triangles).toHaveLength(4)
    expect(triangles.reduce((sum, [a, b, c]) => sum + area(back[a], back[b], back[c]), 0)).toBeCloseTo(5000000, 3)
  })

  it('cuts a face standing up, whose points are not on the floor', () => {
    const side: Point3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 4000, y: 0, z: 0 },
      { x: 4000, y: 0, z: 2600 },
      { x: 0, y: 0, z: 2600 },
    ]
    expect(faceTriangles(side)).toHaveLength(2)
    expect(faceTriangles([...side].reverse())).toHaveLength(2)
  })

  it('cuts every face of every solid into one triangle less than it has points', () => {
    const doc = room()
    const solids = buildingSolids(doc, 'page_1', registry)
    expect(solids.length).toBeGreaterThan(4)
    for (const solid of solids) {
      for (const face of solid.faces) expect([solid.kind, face.length, faceTriangles(face).length]).toEqual([solid.kind, face.length, face.length - 2])
    }
  })

  it('gives three points to a triangle, flat, for a mesh to take', () => {
    const doc = room()
    const wall = buildingSolids(doc, 'page_1', registry).find((solid) => solid.kind === 'wall')!
    const flat = solidTriangles(wall)
    expect(flat.length % 9).toBe(0)
    expect(flat.length / 9).toBe(wall.faces.reduce((sum, face) => sum + faceTriangles(face).length, 0))
  })

  it('gives the box around every solid', () => {
    const doc = room()
    const box = solidsBounds(buildingSolids(doc, 'page_1', registry))!
    expect(box.min.z).toBe(0)
    expect(box.max.z).toBe(3200)
    // The walls are 200 thick, so they run 100 out of the lines they are drawn on either way.
    expect(box.min.x).toBeLessThan(0)
    expect(box.max.x).toBeGreaterThan(4000)
    expect(solidsBounds([])).toBeNull()
  })
})
