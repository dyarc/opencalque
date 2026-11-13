import { rootOf } from './document'
import { leavesOf, isVisible } from './document'
import { roomAt } from './rooms'
import type { Registry } from './registry'
import type { Document, NodeOf } from './schema'
import { wallOutline } from './walls/outline'
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
    } else if (node.type === 'room') {
      const region = roomAt(doc, node.parent, { x: node.x, y: node.y })
      if (!region || region.outline.length < 3) continue
      faces.push({ points: region.outline.map((p): Vec3 => ({ x: p.x, y: p.y, z: 0 })), normal: { x: 0, y: 0 }, light: 1, kind: 'floor' })
    }
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
