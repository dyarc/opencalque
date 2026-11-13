import { rectCorners } from './kinds'
import { pointInPolygon, rotate, sub } from './geometry'
import type { Document, Node } from './schema'
import type { Op } from './ops'

/**
 * Cuts the rectangles selected inside the largest of them out of it, as openings: the shape keeps
 * its outline and its name, its fill stops at the openings, and they go where it goes. This is the
 * plan's way of making a ring out of two rectangles; the rectangle holds the openings in its own
 * unrotated space (`holes`), so moving or turning it carries them along.
 */
export function cutOpeningOps(doc: Document, ids: string[]): Op[] | null {
  const rects = [...new Set(ids)].map((id) => doc.nodes[id]).filter((node): node is Node & { type: 'rect' } => node?.type === 'rect')
  if (rects.length < 2) return null
  const area = (node: Node & { type: 'rect' }) => node.width * node.height
  const outer = rects.reduce((biggest, node) => (area(node) > area(biggest) ? node : biggest))
  const inner = rects.filter((node) => node !== outer)
  if (inner.some((node) => !inside(node, outer))) return null
  const holes = [...(outer.holes ?? [])]
  for (const node of inner) {
    const turn = -((outer.rotation ?? 0) * Math.PI) / 180
    holes.push(rectCorners(node).map((p) => rotate(sub(p, outer), turn)))
  }
  return [{ op: 'update_node', id: outer.id, patch: { holes } }, ...inner.map((node): Op => ({ op: 'remove_node', id: node.id }))]
}

/** Whether every corner of `inner`, and its middle, is inside `outer`. */
function inside(inner: Node & { type: 'rect' }, outer: Node & { type: 'rect' }): boolean {
  const corners = rectCorners(inner)
  const middle = corners.reduce((sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }), { x: 0, y: 0 })
  const outline = rectCorners(outer)
  return [...corners, middle].every((p) => pointInPolygon(p, outline))
}
