import { wallHeightOf } from './axonometric'
import { isVisible, leavesOf } from './document'
import { openingHeights } from './elevation'
import { perp, norm, sub, add, scale, type Vec2 } from './geometry'
import { polylinePath, rectCorners } from './kinds'
import { roomAt } from './rooms'
import { courseOf, middleAcross, wallSides, type Wall } from './walls/course'
import { wallParts } from './walls/outline'
import { wallOpenings } from './walls/openings'
import type { Registry } from './registry'
import type { Document } from './schema'

/*
 * A drawing as the solids it stands as, for a 3D engine to draw: each wall, slab, column, beam and
 * room floor as the faces of a solid, in the drawing's own space — x and y on the plan, z up from
 * its floor, in millimetres. Nothing of it is kept in the drawing: it is worked out from the plan
 * each time, as the axonometric view is, and no engine is needed to work it out.
 *
 * A wall is not one block: it is the stretches between its doors and windows (`wallParts`), each as
 * tall as the wall, and what is left above and below each opening that does not reach the floor or
 * the top, and a pane in the middle of a window. So a door is a hole through the wall, and a window
 * is a hole with its sill under it.
 */

/** A point in the drawing's space: x and y on the plan, z up from its floor. */
export interface Point3 {
  x: number
  y: number
  z: number
}

/** What a solid is: a wall, a slab, a column, a beam, the floor of a room, or the glass of a window. */
export type SolidKind = 'wall' | 'slab' | 'column' | 'beam' | 'floor' | 'glass'

/** A solid of the drawing: the faces around it, and what it is made of. */
export interface BuildingSolid {
  /** The node it stands for: the stretches and the panes of a wall or a window all bear its id. */
  id: string
  kind: SolidKind
  /** The id of its material in the drawing, or null for the default one. */
  material: string | null
  /** Its faces: each a polygon, wound counter-clockwise seen from outside it. */
  faces: Point3[][]
}

/** How thick the glass of a window is drawn, at most. */
const GLASS = 20

/** How far along a curved wall the points of a face are taken, so that an arc is not its chord. */
const SAMPLE = 250

/** The solids of the drawing under `root` (a page or a component), worked out from what it holds. */
export function buildingSolids(doc: Document, root: string, registry: Registry): BuildingSolid[] {
  const solids: BuildingSolid[] = []
  const put = (id: string, kind: SolidKind, material: string | null, faces: Point3[][]) => {
    if (faces.length > 0) solids.push({ id, kind, material, faces })
  }
  for (const node of leavesOf(doc, root)) {
    if (!isVisible(doc, node)) continue
    if (node.type === 'wall') {
      wallsOf(doc, node, registry, put)
    } else if (node.type === 'rect' && node.top !== undefined && node.bottom !== undefined) {
      put(node.id, 'slab', null, extruded(rectCorners(node), Math.min(node.top, node.bottom), Math.max(node.top, node.bottom)))
    } else if (node.type === 'column' && node.top !== undefined && node.bottom !== undefined) {
      put(node.id, 'column', node.material ?? null, extruded(rectCorners(node as never), Math.min(node.top, node.bottom), Math.max(node.top, node.bottom)))
    } else if (node.type === 'polyline' && node.closed && node.top !== undefined && node.bottom !== undefined) {
      put(node.id, 'slab', null, extruded(polylinePath(node), Math.min(node.top, node.bottom), Math.max(node.top, node.bottom)))
    } else if (node.type === 'beam' && node.top !== undefined && node.bottom !== undefined) {
      const across = perp(norm(sub(node.b, node.a)))
      const half = node.width / 2
      const outline = [add(node.a, scale(across, half)), add(node.b, scale(across, half)), add(node.b, scale(across, -half)), add(node.a, scale(across, -half))]
      put(node.id, 'beam', null, extruded(outline, Math.min(node.top, node.bottom), Math.max(node.top, node.bottom)))
    } else if (node.type === 'room') {
      const region = roomAt(doc, node.parent, { x: node.x, y: node.y })
      if (region && region.outline.length >= 3) put(node.id, 'floor', node.material ?? null, extruded(region.outline, 0, 0))
    }
  }
  return solids
}

/** The triangles of a solid, flat: x, y and z for each point, three points to a triangle. */
export function solidTriangles(solid: BuildingSolid): number[] {
  const out: number[] = []
  for (const face of solid.faces) {
    for (const [a, b, c] of faceTriangles(face)) {
      for (const i of [a, b, c]) {
        const p = face[i]
        out.push(p.x, p.y, p.z)
      }
    }
  }
  return out
}

/** The box around every solid, or null when there is none. */
export function solidsBounds(solids: BuildingSolid[]): { min: Point3; max: Point3 } | null {
  let box: { min: Point3; max: Point3 } | null = null
  for (const solid of solids) {
    for (const face of solid.faces) {
      for (const p of face) {
        box = box ? { min: { x: Math.min(box.min.x, p.x), y: Math.min(box.min.y, p.y), z: Math.min(box.min.z, p.z) }, max: { x: Math.max(box.max.x, p.x), y: Math.max(box.max.y, p.y), z: Math.max(box.max.z, p.z) } } : { min: { ...p }, max: { ...p } }
      }
    }
  }
  return box
}

/** The triangles of a face of a solid, as indexes into its points: what a mesh is made of. */
export function faceTriangles(face: Point3[]): [number, number, number][] {
  if (face.length < 3) return []
  if (face.length === 3) return [[0, 1, 2]]
  const normal = faceNormal(face)
  // Seen down the axis the face turns to least, the face is turned the same way all through, and
  // what is cut out of it there is what is cut out of the face. The three pairs of axes the face may
  // be seen down — (y, z), (z, x), (x, y) — all turn the same way round (x, y, z) as one another, so
  // a face is counter-clockwise as it is seen however the face itself is turned: the two ways of
  // seeing are the same way, and only the winding of the face as it is given has to be turned.
  const drop = Math.abs(normal.x) > Math.abs(normal.y) ? (Math.abs(normal.x) > Math.abs(normal.z) ? 0 : 2) : Math.abs(normal.y) > Math.abs(normal.z) ? 1 : 2
  const flat = face.map((p): Vec2 => (drop === 0 ? { x: p.y, y: p.z } : drop === 1 ? { x: p.z, y: p.x } : { x: p.x, y: p.y }))
  const order = face.map((_, i) => i)
  if (signedArea(flat) < 0) {
    flat.reverse()
    order.reverse()
  }
  return earClip(flat).map((triangle): [number, number, number] => {
    const [a, b, c] = triangle.map((i) => order[i]) as [number, number, number]
    // Turned to face the way the face faces, so that a face lit from outside is lit as a whole.
    const turned = cross3(face[b], face[a], face[c])
    return turned.x * normal.x + turned.y * normal.y + turned.z * normal.z < 0 ? [a, c, b] : [a, b, c]
  })
}

/** The way a face turns, by Newell's way: the sum of the corners it turns through. */
function faceNormal(face: Point3[]): Point3 {
  let n = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < face.length; i++) {
    const a = face[i]
    const b = face[(i + 1) % face.length]
    n = { x: n.x + (a.y - b.y) * (a.z + b.z), y: n.y + (a.z - b.z) * (a.x + b.x), z: n.z + (a.x - b.x) * (a.y + b.y) }
  }
  return n
}

/** The triangle `a`, `b`, `c` makes, as the vector across it. */
function cross3(a: Point3, b: Point3, c: Point3): Point3 {
  const [ux, uy, uz] = [b.x - a.x, b.y - a.y, b.z - a.z]
  const [vx, vy, vz] = [c.x - a.x, c.y - a.y, c.z - a.z]
  return { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx }
}

/** Twice the area of a polygon, positive when it turns counter-clockwise. */
function signedArea(points: Vec2[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return area
}

/** Inside a triangle, its own edges counting as inside: a corner that touches does not block an ear. */
function inTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const sides = [
    (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x),
    (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x),
    (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x),
  ]
  return sides.every((side) => side >= -1e-9) || sides.every((side) => side <= 1e-9)
}

/**
 * A polygon cut into triangles, by taking off one ear at a time (a corner whose triangle holds no
 * other corner of the polygon). Counter-clockwise, and simple: a wall's outline is.
 */
function earClip(points: Vec2[]): [number, number, number][] {
  const left = points.map((_, i) => i)
  const triangles: [number, number, number][] = []
  let guard = left.length * left.length + 8
  while (left.length > 3 && guard-- > 0) {
    let cut = false
    for (let i = 0; i < left.length; i++) {
      const [ia, ib, ic] = [left[(i - 1 + left.length) % left.length], left[i], left[(i + 1) % left.length]]
      const [a, b, c] = [points[ia], points[ib], points[ic]]
      if ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y) <= 0) continue
      if (left.some((k) => k !== ia && k !== ib && k !== ic && inTriangle(points[k], a, b, c))) continue
      triangles.push([ia, ib, ic])
      left.splice(i, 1)
      cut = true
      break
    }
    // Nothing to take off: the polygon is not simple, and what was cut off it is all it gives.
    // Never a triangle across the whole of it, which would be a sheet over the drawing.
    if (!cut) return triangles
  }
  if (left.length === 3) triangles.push([left[0], left[1], left[2]])
  return triangles
}

/** A wall as the solids it stands as: its stretches, what is above and below its openings, and their glass. */
function wallsOf(doc: Document, wall: Wall, registry: Registry, put: (id: string, kind: SolidKind, material: string | null, faces: Point3[][]) => void): void {
  const height = wallHeightOf(doc, wall)
  const material = wall.material ?? null
  for (const piece of wallParts(wall, doc, registry).pieces) put(wall.id, 'wall', material, extruded(piece.outline, 0, height))
  const sides = wallSides(wall)
  const middle = middleAcross(wall)
  const glass = Math.min(GLASS, wall.thickness / 4)
  // `wallSides` gives how far the wall reaches each way; its faces are at -left and at right.
  const [faceA, faceB] = [-sides.left, sides.right]
  for (const { node: opening, from, to } of wallOpenings(doc, wall, registry)) {
    const kind = registry.parametric.get(opening.kind)
    if (!kind?.opening) continue
    const [bottom, top] = openingHeights(kind, registry.resolveProps(kind, opening.props), height)
    const [s0, s1] = from <= to ? [from, to] : [to, from]
    if (bottom > 1e-6) put(opening.id, 'wall', material, alongWall(wall, s0, s1, faceA, faceB, 0, bottom))
    if (height - top > 1e-6) put(opening.id, 'wall', material, alongWall(wall, s0, s1, faceA, faceB, top, height))
    if (bottom > 1e-6 && top - bottom > 1e-6 && glass > 0) put(opening.id, 'glass', null, alongWall(wall, s0, s1, middle - glass, middle + glass, bottom, top))
  }
}

/** The solid a wall makes between two points along it and two heights, across the two faces it runs between. */
function alongWall(wall: Wall, from: number, to: number, acrossA: number, acrossB: number, bottom: number, top: number): Point3[][] {
  if (to - from < 1e-6 || top - bottom < 1e-6) return []
  const course = courseOf(wall)
  const steps = Math.max(1, Math.ceil((to - from) / SAMPLE))
  const line = (across: number): Vec2[] => Array.from({ length: steps + 1 }, (_, i) => course.offset(from + ((to - from) * i) / steps, across))
  return extruded([...line(acrossA), ...line(acrossB).reverse()], bottom, top)
}

/** A solid standing between two heights over a plan outline: its top, its underside, and a face for each of its sides. */
function extruded(outline: Vec2[], bottom: number, top: number): Point3[][] {
  // A floor to walk on at no height at all is a face and nothing else.
  if (outline.length < 3) return []
  const ring = sides(outline)
  // What is left of an outline with no area about it stands for nothing, and is not drawn.
  if (ring.length < 3 || Math.abs(signedArea(ring)) < 1) return []
  const at = (p: Vec2, z: number): Point3 => ({ x: p.x, y: p.y, z })
  if (top - bottom < 1e-6) return [ring.map((p) => at(p, top))]
  const faces: Point3[][] = [ring.map((p) => at(p, top)), ring.map((p) => at(p, bottom)).reverse()]
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    faces.push([at(a, bottom), at(b, bottom), at(b, top), at(a, top)])
  }
  return faces
}

/**
 * An outline turned counter-clockwise, without the points that have no area about them: a point
 * repeated, and a point standing on the line between its neighbours. Two walls met, with the face of
 * one running on from the other's, leave the second's outline running out to the corner and straight
 * back to the joint (`walls/outline.ts`); that point has no area, and a ring that keeps it is pinched
 * and cannot be cut into triangles at all.
 */
function sides(outline: Vec2[]): Vec2[] {
  const at = (i: number) => outline[(i + outline.length) % outline.length]
  const corner = (prev: Vec2, p: Vec2, next: Vec2) => Math.abs((p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x))
  const turned = outline.filter((p, i) => corner(at(i - 1), p, at(i + 1)) > 1e-3)
  // An outline of nothing but points without area is no ring: it is kept as it stands.
  const ring = turned.length >= 3 ? turned : outline.slice()
  return signedArea(ring) < 0 ? ring.reverse() : ring
}
