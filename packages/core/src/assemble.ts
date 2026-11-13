import { newId } from './document'
import { bulgeArc, dist, ellipseArc, smoothPoints, type Vec2 } from './geometry'
import { rectCorners } from './kinds'
import type { NodeInput, Op } from './ops'
import type { Document, Node, NodeOf } from './schema'

/*
 * Taking drawings apart and putting them together again: a polyline or a rectangle exploded into
 * the lines (and arcs) it is drawn as, and lines, open polylines and circular arcs joined end to
 * end into one polyline, closed when the ends meet back where they began. An arc keeps its bow as
 * the polyline's bulge, so what is joined stays as round as it was.
 */

/** How near two ends must be, in mm, to be taken as one when joining. */
export const JOIN_TOLERANCE = 0.01

/** A node that can be joined end to end: a line, an open polyline, or a circular arc. */
export type Joinable = NodeOf<'line'> | NodeOf<'polyline'> | NodeOf<'ellipse'>

export interface ExplodeResult {
  ops: Op[]
  /** The pieces made, for the editor to leave selected. */
  ids: string[]
}

export interface JoinResult {
  ops: Op[]
  /** The polylines and shapes made, for the editor to leave selected. */
  ids: string[]
  /** The pieces left as they were: they touch a corner three or more meet at, and do not join end to end. */
  skipped: number
}

/** What can be exploded into lines and arcs: a polyline, closed or open, or a rectangle. */
export const canExplode = (node: Node): node is NodeOf<'polyline'> | NodeOf<'rect'> => node.type === 'polyline' || node.type === 'rect'

/** A circular arc: an ellipse given a start and an end angle, its radii equal. */
export const isCircularArc = (node: Node): node is NodeOf<'ellipse'> =>
  node.type === 'ellipse' && node.from !== undefined && node.to !== undefined && Math.abs(node.rx - node.ry) < 1e-6 && !node.rotation

/** What can be joined: a line, an open polyline (straight or with arcs), or a circular arc. */
export const canJoin = (node: Node): node is Joinable =>
  node.type === 'line' || (node.type === 'polyline' && !node.smooth && !node.closed) || isCircularArc(node)

/** The lines a polyline or a rectangle is drawn as, in order, in its layer and its look. */
export function explodeOps(doc: Document, ids: string[]): ExplodeResult | null {
  const ops: Op[] = []
  const made: string[] = []
  for (const id of ids) {
    const node = doc.nodes[id]
    if (!node || !canExplode(node)) continue
    const pieces: { id: string; node: Record<string, unknown> }[] = []
    const cut = (a: Vec2, b: Vec2, bulge = 0) => {
      if (dist(a, b) <= 1e-9) return
      const common = {
        id: '',
        parent: node.parent,
        order: node.order,
        ...(node.layer ? { layer: node.layer } : {}),
        ...(node.style ? { style: node.style } : {}),
      }
      const arc = bulge ? bulgeArc(a, b, bulge) : null
      if (!arc) {
        pieces.push({ id: newId(), node: { ...common, type: 'line', a, b } })
        return
      }
      pieces.push({ id: newId(), node: { ...common, type: 'ellipse', cx: arc.cx, cy: arc.cy, rx: arc.r, ry: arc.r, from: arc.from, to: arc.to } })
    }
    if (node.type === 'polyline') {
      const count = node.closed ? node.points.length : node.points.length - 1
      if (node.bulges?.some((bulge) => bulge)) {
        for (let i = 0; i < count; i++) cut(node.points[i], node.points[(i + 1) % node.points.length], node.bulges?.[i] ?? 0)
      } else {
        const points = node.smooth ? smoothPoints(node.points, !!node.closed) : node.points
        for (let i = 0; i < count; i++) cut(points[i], points[(i + 1) % points.length])
      }
    } else {
      const corners = rectCorners(node)
      for (let i = 0; i < 4; i++) cut(corners[i], corners[(i + 1) % 4])
    }
    if (pieces.length === 0) continue
    ops.push({ op: 'remove_node', id })
    for (const piece of pieces) {
      piece.node.id = piece.id
      ops.push({ op: 'add_node', node: piece.node as unknown as NodeInput })
      made.push(piece.id)
    }
  }
  return made.length > 0 ? { ops, ids: made } : null
}

interface Piece {
  id: string
  node: Joinable
  points: Vec2[]
  /** For each stretch between two points, the arc it bows by, 0 for a straight one. */
  bulges: number[]
}

/** A circular arc as one stretch: its ends, and the bow that joins them. */
function arcPiece(node: NodeOf<'ellipse'>): Piece | null {
  if (node.from === undefined || node.to === undefined) return null
  const sampled = ellipseArc({ cx: node.cx, cy: node.cy, rx: node.rx, ry: node.ry, from: node.from, to: node.to })
  const a = sampled[0]
  const b = sampled[sampled.length - 1]
  const quarter = sampled[Math.max(1, Math.floor(sampled.length / 4))]
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const side = (b.x - a.x) * (quarter.y - middle.y) - (b.y - a.y) * (quarter.x - middle.x)
  const sweep = (((node.to - node.from) % 360) + 360) % 360
  if (sweep < 1e-6 || sweep >= 360 - 1e-6) return null
  // The bow is positive to the left of a to b, as a polyline's bulges are.
  const bulge = (side < 0 ? 1 : -1) * Math.tan(((sweep * Math.PI) / 180) / 4)
  return { id: node.id, node, points: [a, b], bulges: [bulge] }
}

const piecesOf = (doc: Document, ids: string[]): Piece[] =>
  ids.flatMap((id) => {
    const node = doc.nodes[id]
    if (!node || !canJoin(node)) return []
    if (node.type === 'ellipse') return arcPiece(node) ? [arcPiece(node)!] : []
    const points = node.type === 'line' ? [node.a, node.b] : node.points
    if (points.length < 2 || dist(points[0], points[points.length - 1]) <= JOIN_TOLERANCE) return []
    const bulges = Array.from({ length: points.length - 1 }, (_, i) => (node.type === 'polyline' ? (node.bulges?.[i] ?? 0) : 0))
    return [{ id, node, points, bulges }]
  })

/**
 * The operations that join lines, open polylines and circular arcs selected together, end to end,
 * into one polyline each: closed when the chain comes back to where it began, open otherwise. An
 * arc keeps its bow as a bulge of the polyline. A corner where three or more ends meet is left
 * alone, and the pieces there counted in `skipped`.
 */
export function joinOps(doc: Document, ids: string[]): JoinResult | null {
  const pieces = piecesOf(doc, ids)
  if (pieces.length < 2) return null
  // What is joined stays where it was: pieces of another parent are left alone.
  const byParent = new Map<string, Piece[]>()
  for (const piece of pieces) byParent.set(piece.node.parent ?? '', [...(byParent.get(piece.node.parent ?? '') ?? []), piece])
  const ops: Op[] = []
  const made: string[] = []
  let skipped = 0
  for (const group of byParent.values()) {
    if (group.length < 2) {
      skipped += group.length
      continue
    }
    const result = joinGroup(group)
    ops.push(...result.ops)
    made.push(...result.ids)
    skipped += result.skipped
  }
  return made.length > 0 ? { ops, ids: made, skipped } : null
}

/** One chain, or as many as the pieces selected make. */
function joinGroup(pieces: Piece[]): { ops: Op[]; ids: string[]; joined: number; skipped: number } {
  const ends: { piece: number; end: 0 | 1; p: Vec2 }[] = []
  pieces.forEach((piece, index) => {
    ends.push({ piece: index, end: 0, p: piece.points[0] })
    ends.push({ piece: index, end: 1, p: piece.points[piece.points.length - 1] })
  })
  const cluster = new Array<number>(ends.length).fill(-1)
  let count = 0
  for (let i = 0; i < ends.length; i++) {
    if (cluster[i] !== -1) continue
    cluster[i] = count++
    for (let j = i + 1; j < ends.length; j++) if (cluster[j] === -1 && dist(ends[i].p, ends[j].p) <= JOIN_TOLERANCE) cluster[j] = cluster[i]
  }
  const members: number[][] = Array.from({ length: count }, () => [])
  ends.forEach((end, i) => members[cluster[i]].push(i))
  const branch = members.map((m) => m.length > 2)
  const touching = new Set<number>()
  members.forEach((m, c) => {
    if (branch[c]) for (const i of m) touching.add(ends[i].piece)
  })
  const links: ({ piece: number; end: 0 | 1 } | null)[][] = pieces.map(() => [null, null])
  members.forEach((m, c) => {
    if (branch[c] || m.length !== 2) return
    const [x, y] = m
    const one = ends[x]
    const two = ends[y]
    if (one.piece === two.piece) return
    links[one.piece][one.end] = { piece: two.piece, end: two.end }
    links[two.piece][two.end] = { piece: one.piece, end: one.end }
  })
  const ops: Op[] = []
  const ids: string[] = []
  let joined = 0
  let skipped = touching.size
  const seen = new Set<number>()
  for (let start = 0; start < pieces.length; start++) {
    if (seen.has(start) || touching.has(start)) continue
    const component: number[] = []
    const queue = [start]
    while (queue.length > 0) {
      const at = queue.pop()!
      if (seen.has(at) || touching.has(at)) continue
      seen.add(at)
      component.push(at)
      for (const end of [0, 1] as const) {
        const link = links[at][end]
        if (link && !seen.has(link.piece)) queue.push(link.piece)
      }
    }
    if (component.length < 2) {
      skipped += component.length
      continue
    }
    const loop = component.every((p) => links[p][0] !== null && links[p][1] !== null)
    const walked = loop ? walkClosed(component, pieces, links) : walkOpen(component, pieces, links)
    if (walked.points.length < 2) {
      skipped += component.length
      continue
    }
    const first = pieces[component[0]].node
    const id = newId()
    const closed = loop && dist(walked.points[0], walked.points[walked.points.length - 1]) <= JOIN_TOLERANCE
    const points = closed ? walked.points.slice(0, -1) : walked.points
    const bulges = walked.bulges
    // A loop of two stretches, an arc and a line, is a shape too; two straight ones are not.
    if (closed && points.length < 3 && !bulges.some((bulge) => bulge)) {
      skipped += component.length
      continue
    }
    const node = {
      id,
      type: 'polyline',
      parent: first.parent,
      order: first.order,
      ...(first.layer ? { layer: first.layer } : {}),
      ...(first.style ? { style: first.style } : {}),
      points,
      ...(bulges.some((bulge) => bulge) ? { bulges } : {}),
      ...(closed ? { closed: true } : {}),
    } as NodeInput
    for (const piece of component) ops.push({ op: 'remove_node', id: pieces[piece].id })
    ops.push({ op: 'add_node', node })
    ids.push(id)
    joined += component.length
  }
  return { ops, ids, joined, skipped }
}

/** A piece's points and bulges as they run from `entry` to its other end. */
function oriented(piece: Piece, entry: 0 | 1): { points: Vec2[]; bulges: number[] } {
  return entry === 0 ? { points: piece.points, bulges: piece.bulges } : { points: [...piece.points].reverse(), bulges: [...piece.bulges].reverse().map((bulge) => -bulge) }
}

/** The points and bulges of a chain walked from a free end, or all round when its ends meet. */
function walk(start: number, entry: 0 | 1, pieces: Piece[], links: ({ piece: number; end: 0 | 1 } | null)[][]): { points: Vec2[]; bulges: number[] } {
  const points: Vec2[] = []
  const bulges: number[] = []
  const seen = new Set<number>()
  let at = start
  let enter = entry
  for (let guard = 0; guard <= pieces.length; guard++) {
    if (seen.has(at)) break
    seen.add(at)
    const run = oriented(pieces[at], enter)
    if (points.length === 0) {
      points.push(...run.points)
      bulges.push(...run.bulges)
    } else {
      points.push(...run.points.slice(1))
      bulges.push(...run.bulges)
    }
    const exit: 0 | 1 = enter === 0 ? 1 : 0
    const link = links[at][exit]
    if (!link) break
    at = link.piece
    enter = link.end
  }
  return { points, bulges }
}

const walkOpen = (component: number[], pieces: Piece[], links: ({ piece: number; end: 0 | 1 } | null)[][]): { points: Vec2[]; bulges: number[] } => {
  const start = component.find((p) => links[p][0] === null || links[p][1] === null) ?? component[0]
  return walk(start, links[start][0] === null ? 0 : 1, pieces, links)
}

const walkClosed = (component: number[], pieces: Piece[], links: ({ piece: number; end: 0 | 1 } | null)[][]): { points: Vec2[]; bulges: number[] } => {
  const walked = walk(component[0], 0, pieces, links)
  if (walked.points.length > 1 && dist(walked.points[0], walked.points[walked.points.length - 1]) > JOIN_TOLERANCE) {
    walked.points.push(walked.points[0])
    walked.bulges.push(0)
  }
  return walked
}
