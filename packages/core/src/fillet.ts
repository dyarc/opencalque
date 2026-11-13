import { add, arcThrough, bulgeOf, len, norm, scale, sub, type Vec2 } from './geometry'
import type { NodeInput, Op } from './ops'
import type { Node, NodeOf } from './schema'
import { cross, dot, tidy } from './walls/course'

/*
 * The fillet tool, as in CAD: two stretches of line made to meet. With no radius, each is cut back
 * or carried on to where they cross, which makes a clean corner; with a radius, each stops where an
 * arc of that radius takes over. A stretch is a whole line, or one segment of a polyline. Two
 * neighbouring segments of one polyline have their corner rounded in place, the arc kept as the
 * polyline's own bulge, so the line stays one object and a closed line stays closed; anywhere else
 * the arc is an ellipse of its own, as it always was.
 */

/** A node a stretch of which can be filleted: a line, a polyline that is not a curve, or a wall. */
export type FilletNode = NodeOf<'line'> | NodeOf<'polyline'> | NodeOf<'wall'>

/** What is filleted: the node, where it was clicked, and for a polyline the segment clicked. */
export interface FilletTarget {
  node: FilletNode
  at: Vec2
  /** The segment clicked, by the index of the point it starts at. */
  segment?: number
}

/** What can be filleted: a straight line, a wall, or a polyline that is not a curve. */
export const canFillet = (node: Node): node is FilletNode => node.type === 'line' || node.type === 'wall' || (node.type === 'polyline' && !node.smooth)

const point = (p: Vec2): Vec2 => ({ x: tidy(p.x), y: tidy(p.y) })

/** The two ends of the stretch of `target`, and the patch that puts one of them elsewhere. */
function stretch(target: FilletTarget): { a: Vec2; b: Vec2; patch: (end: 0 | 1, p: Vec2) => Record<string, unknown> } | null {
  const node = target.node
  if (node.type === 'line' || node.type === 'wall') return { a: node.a, b: node.b, patch: (end, p) => (end === 0 ? { a: p } : { b: p }) }
  const index = target.segment
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= node.points.length) return null
  const next = (index + 1) % node.points.length
  return {
    a: node.points[index],
    b: node.points[next],
    patch: (end, p) => ({ points: node.points.map((q, i) => (i === (end === 0 ? index : next) ? p : q)) }),
  }
}

/** Whether the stretch clicked of `target` is a straight one: an arc is no line to cut back. */
function straight(target: FilletTarget): boolean {
  return target.node.type === 'line' || target.node.type === 'wall' || !(target.node.bulges?.[target.segment ?? 0] ?? 0)
}

/**
 * The operations that make the stretches of `first` and `second` meet, each clicked at its own
 * place (the part kept is the one on the side of their crossing it was clicked on), with an arc of
 * `radius` between them when it is more than 0. Two neighbouring segments of one polyline are
 * rounded where they meet, the arc kept as the polyline's bulge; anything else gives up a free end,
 * and the arc is a node of its own with the id given, on the first node's layer and in its look.
 * Null when they cannot meet: lines that run side by side, too short for the radius, an arc to cut
 * back, or a polyline that would have to give up a corner it keeps.
 */
export function filletOps(first: FilletTarget, second: FilletTarget, radius: number, arcId: string): Op[] | null {
  if (!(radius >= 0)) return null
  const one = stretch(first)
  const two = stretch(second)
  if (!one || !two || !straight(first) || !straight(second)) return null
  const d1 = sub(one.b, one.a)
  const d2 = sub(two.b, two.a)
  const denom = cross(d1, d2)
  if (len(d1) < 1e-9 || len(d2) < 1e-9 || Math.abs(denom) < 1e-9 * len(d1) * len(d2)) return null
  const crossing = add(one.a, scale(d1, cross(sub(two.a, one.a), d2) / denom))
  // For each stretch: the way from the crossing to the part kept, the end that stays, and how far it is.
  const kept = (line: { a: Vec2; b: Vec2 }, at: Vec2) => {
    const dir = norm(sub(line.b, line.a))
    const along = (q: Vec2) => dot(sub(q, crossing), dir)
    // Clicked on the crossing itself: the longer part is kept.
    const side = Math.abs(along(at)) > 1e-6 ? Math.sign(along(at)) : Math.sign(along(line.a)) || 1
    const stays: 0 | 1 = along(line.a) * side >= along(line.b) * side ? 0 : 1
    return { way: scale(dir, side || 1), stays, reach: along(stays === 0 ? line.a : line.b) * side }
  }
  const a1 = kept(one, first.at)
  const a2 = kept(two, second.at)
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(a1.way, a2.way))))
  if (angle < 1e-6 || Math.PI - angle < 1e-6) return null
  // How far back from the crossing each stretch stops, for the arc to touch it there.
  const back = radius / Math.tan(angle / 2)
  if (a1.reach <= back + 1e-6 || a2.reach <= back + 1e-6) return null
  const ends = [add(crossing, scale(a1.way, back)), add(crossing, scale(a2.way, back))].map(point)
  // The arc is the circle touching both stretches at their ends, its middle nearest the crossing.
  const halfway = norm(add(a1.way, a2.way))
  const centre = add(crossing, scale(halfway, radius / Math.sin(angle / 2)))
  const arc = radius > 0 ? arcThrough(ends[0], ends[1], sub(centre, scale(halfway, radius))) : null

  // Two neighbouring segments of one polyline: the corner between them goes, and the arc takes its place.
  if (first.node.id === second.node.id && first.node.type === 'polyline' && second.node.type === 'polyline') {
    const node = first.node
    const n = node.points.length
    const i1 = first.segment
    const i2 = second.segment
    if (i1 === undefined || i2 === undefined) return null
    const shared = i2 === (i1 + 1) % n ? (i1 + 1) % n : i1 === (i2 + 1) % n ? (i2 + 1) % n : null
    if (shared === null || (!node.closed && (shared === 0 || shared === n - 1))) return null
    const moving = (index: number, a: { stays: 0 | 1 }) => (a.stays === 0 ? (index + 1) % n : index)
    if (moving(i1, a1) !== shared || moving(i2, a2) !== shared) return null
    // With no radius the two segments already meet there: nothing to do.
    if (radius === 0) return []
    if (!arc) return null
    const before = i1 === (shared - 1 + n) % n ? ends[0] : ends[1]
    const after = before === ends[0] ? ends[1] : ends[0]
    // The true arc, as the bulge of the stretch between the two tangent points.
    const bulge = bulgeOf(before, after, sub(centre, scale(halfway, radius)))
    if (bulge === null) return null
    const oldCount = node.closed ? n : n - 1
    const bulges = Array.from({ length: oldCount }, (_, i) => node.bulges?.[i] ?? 0)
    const points = [...node.points.slice(0, shared), point(before), point(after), ...node.points.slice(shared + 1)]
    return [{ op: 'update_node', id: node.id, patch: { points, bulges: [...bulges.slice(0, shared), bulge, ...bulges.slice(shared)] } }]
  }

  // Anything else gives up a free end: a line either end, an open polyline its first or its last point.
  const free = (target: FilletTarget, a: { stays: 0 | 1 }) => {
    const node = target.node
    if (node.type === 'line' || node.type === 'wall') return true
    if (node.closed) return false
    const index = target.segment
    if (index === undefined) return false
    const moved = a.stays === 0 ? (index + 1) % node.points.length : index
    return moved === 0 || moved === node.points.length - 1
  }
  if (!free(first, a1) || !free(second, a2)) return null
  const moving: (stays: 0 | 1) => 0 | 1 = (stays) => (stays === 0 ? 1 : 0)
  const ops: Op[] = [
    { op: 'update_node', id: first.node.id, patch: one.patch(moving(a1.stays), ends[0]) },
    { op: 'update_node', id: second.node.id, patch: two.patch(moving(a2.stays), ends[1]) },
  ]
  if (radius === 0) return ops
  if (!arc) return null
  const parent = first.node.parent
  const layer = first.node.layer ? { layer: first.node.layer } : {}
  const style = first.node.style ? { style: first.node.style } : {}
  if (first.node.type === 'wall' && second.node.type === 'wall') {
    // A wall's rounding is a curved wall between the two tangent points, so it keeps its thickness
    // and its material, and stands in the 3D view and in sections as the walls it joins do.
    const bulge = bulgeOf(ends[0], ends[1], sub(centre, scale(halfway, radius)))
    if (bulge === null) return null
    const wall = {
      id: arcId,
      type: 'wall',
      parent,
      ...layer,
      ...style,
      a: ends[0],
      b: ends[1],
      thickness: first.node.thickness,
      ...(first.node.material ? { material: first.node.material } : {}),
      ...(first.node.justify ? { justify: first.node.justify } : {}),
      bulge,
    } as NodeInput
    return [...ops, { op: 'add_node', node: wall }]
  }
  const node = {
    id: arcId,
    type: 'ellipse',
    parent,
    ...layer,
    ...style,
    cx: tidy(arc.cx),
    cy: tidy(arc.cy),
    rx: radius,
    ry: radius,
    from: arc.from,
    to: arc.to,
  } as NodeInput
  return [...ops, { op: 'add_node', node }]
}
