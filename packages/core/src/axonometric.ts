import { rootOf } from './document'
import { perp, norm, sub, add, scale, rotate } from './geometry'
import { leavesOf, isVisible } from './document'
import { roomAt } from './rooms'
import type { Registry } from './registry'
import type { Document, NodeOf } from './schema'
import { wallOutline } from './walls/outline'
import { polylinePath, rectCorners } from './kinds'
import type { Vec2 } from './geometry'

/*
 * An axonometric view of a drawing: the walls it has as the blocks they stand as, and the floors
 * of its rooms, seen from a direction, without perspective. Nothing of the view is kept in the
 * drawing: it is worked out from the plan each time it is drawn, as an elevation is.
 */

/** A point in the drawing's space: x and y on the plan, z up from its floor. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** How high a wall stands when neither it nor its page says. */
export const AXO_WALL_HEIGHT = 2500

/** A face of the view: the points around it, and how much light falls on it. */
export interface AxoFace {
  /** The node the face belongs to, when it was made from one. */
  id?: string
  points: Vec3[]
  /** The way it faces, in the plan, for vertical faces; straight up for a top or a floor. */
  normal: Vec2
  /** 0 for a face in shadow, 1 for one turned to the light. */
  light: number
  kind: 'top' | 'side' | 'floor'
}

/** The height a wall stands: its own, else its page's, else the usual. */
export function wallHeightOf(doc: Document, wall: NodeOf<'wall'>): number {
  if (wall.height !== undefined) return wall.height
  const page = rootOf(doc, wall.id)
  return page?.type === 'page' && page.wallHeight !== undefined ? page.wallHeight : AXO_WALL_HEIGHT
}

const LIGHT: Vec3 = { x: -0.45, y: -0.7, z: 1 }
const LENGTH = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z)
const light = (normal: Vec2, z: number): number => Math.max(0, Math.min(1, (normal.x * LIGHT.x + normal.y * LIGHT.y + z * LIGHT.z) / LENGTH))

/** The faces of the drawing under `root` (a page or a component), worked out from what it holds. */
export function axonometricFaces(doc: Document, root: string, registry: Registry): AxoFace[] {
  const faces: AxoFace[] = []
  for (const node of leavesOf(doc, root)) {
    if (!isVisible(doc, node)) continue
    const first = faces.length
    if (node.type === 'wall') {
      const outline = wallOutline(node, doc)
      if (outline.length < 3) continue
      const height = wallHeightOf(doc, node)
      faces.push({ points: outline.map((p): Vec3 => ({ x: p.x, y: p.y, z: height })), normal: { x: 0, y: 0 }, light: light({ x: 0, y: 0 }, 1), kind: 'top' })
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i]
        const b = outline[(i + 1) % outline.length]
        const side = Math.hypot(b.x - a.x, b.y - a.y)
        if (side < 1e-6) continue
        const normal = { x: (b.y - a.y) / side, y: -(b.x - a.x) / side }
        faces.push({
          points: [
            { x: a.x, y: a.y, z: 0 },
            { x: b.x, y: b.y, z: 0 },
            { x: b.x, y: b.y, z: height },
            { x: a.x, y: a.y, z: height },
          ],
          normal,
          light: light(normal, 0),
          kind: 'side',
        })
      }
    } else if (node.type === 'rect' && node.top !== undefined && node.bottom !== undefined) {
      const [bottom, top] = [Math.min(node.top, node.bottom), Math.max(node.top, node.bottom)]
      faces.push(...(node.recess ? slabWithRecess(node, bottom, top) : prism(rectCorners(node), bottom, top)))
    } else if (node.type === 'column' && node.top !== undefined && node.bottom !== undefined) {
      faces.push(...prism(rectCorners(node as never), Math.min(node.top, node.bottom), Math.max(node.top, node.bottom)))
    } else if (node.type === 'polyline' && node.closed && node.top !== undefined && node.bottom !== undefined) {
      const outline = polylinePath(node)
      if (outline.length >= 3) faces.push(...prism(outline, Math.min(node.top, node.bottom), Math.max(node.top, node.bottom)))
    } else if (node.type === 'beam' && node.top !== undefined && node.bottom !== undefined) {
      const across = perp(norm(sub(node.b, node.a)))
      const half = node.width / 2
      const outline = [add(node.a, scale(across, half)), add(node.b, scale(across, half)), add(node.b, scale(across, -half)), add(node.a, scale(across, -half))]
      faces.push(...prism(outline, Math.min(node.top, node.bottom), Math.max(node.top, node.bottom)))
    } else if (node.type === 'room') {
      const region = roomAt(doc, node.parent, { x: node.x, y: node.y })
      if (!region || region.outline.length < 3) continue
      faces.push({ points: region.outline.map((p): Vec3 => ({ x: p.x, y: p.y, z: 0 })), normal: { x: 0, y: 0 }, light: 1, kind: 'floor' })
    }
    for (let i = first; i < faces.length; i++) faces[i].id = node.id
  }
  return faces
}

/** Where a point of the drawing is on the screen, in an axonometric view turned by `turn` quarter turns. */
export function axoProject(p: Vec3, turn: number, scale: number, pan: Vec2): Vec2 {
  const angle = (turn * Math.PI) / 2
  const x = p.x * Math.cos(angle) - p.y * Math.sin(angle)
  const y = p.x * Math.sin(angle) + p.y * Math.cos(angle)
  // The usual isometric axes: 30° up either way, and the height straight up the screen.
  return { x: (x - y) * Math.cos(Math.PI / 6) * scale + pan.x, y: ((x + y) * Math.sin(Math.PI / 6) - p.z) * scale + pan.y }
}

/** How near the camera a point is: what is drawn later, over what is further. */
export function axoDepth(p: Vec3, turn: number): number {
  const angle = (turn * Math.PI) / 2
  const x = p.x * Math.cos(angle) - p.y * Math.sin(angle)
  const y = p.x * Math.sin(angle) + p.y * Math.cos(angle)
  return x + y + p.z
}

/** The faces of a slab with a sunken pit: its top around the pit, the pit walls and its floor. */
function slabWithRecess(node: NodeOf<'rect'>, bottom: number, top: number): AxoFace[] {
  const r = node.recess!
  const [w, h] = [node.width, node.height]
  const local = (x: number, y: number): Vec2 => add(rotate({ x, y }, node.rotation ?? 0), node)
  const parts = [
    { x: 0, y: 0, width: w, height: r.y },
    { x: 0, y: r.y + r.height, width: w, height: h - (r.y + r.height) },
    { x: 0, y: r.y, width: r.x, height: r.height },
    { x: r.x + r.width, y: r.y, width: w - (r.x + r.width), height: r.height },
  ].filter((part) => part.width > 1e-6 && part.height > 1e-6)
  const faces: AxoFace[] = parts.map((part) => ({
    points: [local(part.x, part.y), local(part.x + part.width, part.y), local(part.x + part.width, part.y + part.height), local(part.x, part.y + part.height)].map((p): Vec3 => ({ x: p.x, y: p.y, z: top })),
    normal: { x: 0, y: 0 },
    light: 1,
    kind: 'top',
  }))
  faces.push(...prism(rectCorners(node), bottom, top).filter((face) => face.kind !== 'top'))
  // The floor of the pit and the walls around it, from the top of the slab down to that floor.
  const floor = top - r.top
  if (top - floor > 1e-6) {
    const hole = [local(r.x, r.y), local(r.x + r.width, r.y), local(r.x + r.width, r.y + r.height), local(r.x, r.y + r.height)]
    faces.push({ points: hole.map((p): Vec3 => ({ x: p.x, y: p.y, z: floor })), normal: { x: 0, y: 0 }, light: 1, kind: 'floor' })
    for (let i = 0; i < hole.length; i++) {
      const a = hole[i]
      const b = hole[(i + 1) % hole.length]
      const side = Math.hypot(b.x - a.x, b.y - a.y)
      if (side < 1e-6) continue
      // Facing into the pit, the other way from the slab's outside.
      const normal = { x: -(b.y - a.y) / side, y: (b.x - a.x) / side }
      faces.push({
        points: [
          { x: a.x, y: a.y, z: floor },
          { x: b.x, y: b.y, z: floor },
          { x: b.x, y: b.y, z: top },
          { x: a.x, y: a.y, z: top },
        ],
        normal,
        light: light(normal, 0),
        kind: 'side',
      })
    }
  }
  return faces
}

/** The faces of a solid standing between `bottom` and `top` over a plan outline. */
function prism(outline: Vec2[], bottom: number, top: number): AxoFace[] {
  if (outline.length < 3 || top - bottom < 1e-6) return []
  const faces: AxoFace[] = [{ points: outline.map((p): Vec3 => ({ x: p.x, y: p.y, z: top })), normal: { x: 0, y: 0 }, light: 1, kind: 'top' }]
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const side = Math.hypot(b.x - a.x, b.y - a.y)
    if (side < 1e-6) continue
    const normal = { x: (b.y - a.y) / side, y: -(b.x - a.x) / side }
    faces.push({
      points: [
        { x: a.x, y: a.y, z: bottom },
        { x: b.x, y: b.y, z: bottom },
        { x: b.x, y: b.y, z: top },
        { x: a.x, y: a.y, z: top },
      ],
      normal,
      light: light(normal, 0),
      kind: 'side',
    })
  }
  return faces
}
