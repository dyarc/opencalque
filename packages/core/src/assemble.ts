import { newId } from './document'
import { dist, smoothPoints, type Vec2 } from './geometry'
import { rectCorners } from './kinds'
import type { NodeInput, Op } from './ops'
import type { Document, Node, NodeOf } from './schema'

/*
 * Taking drawings apart and putting them together again: a polyline or a rectangle exploded into
 * the lines it is drawn as, and lines and open polylines joined end to end into one polyline, or
 * into a closed shape when the ends meet back where they began.
 */

/** How near two ends must be, in mm, to be taken as one when joining. */
export const JOIN_TOLERANCE = 0.01

export interface ExplodeResult {
  ops: Op[]
  /** The lines made, for the editor to leave selected. */
  ids: string[]
}

export interface JoinResult {
  ops: Op[]
  /** The polylines and shapes made, for the editor to leave selected. */
  ids: string[]
  /** The lines left as they were: they touch a corner three or more meet at, and do not join end to end. */
  skipped: number
}

/** What can be exploded into lines: a polyline, closed or open, or a rectangle. */
export const canExplode = (node: Node): node is NodeOf<'polyline'> | NodeOf<'rect'> => node.type === 'polyline' || node.type === 'rect'

/** What can be joined: a line, or a polyline that lies open. */
export const canJoin = (node: Node): node is NodeOf<'line'> | NodeOf<'polyline'> => node.type === 'line' || (node.type === 'polyline' && !node.smooth && !node.closed)

/** The lines a polyline or a rectangle is drawn as, in order, in its layer and its look. */
export function explodeOps(doc: Document, ids: string[]): ExplodeResult | null {
  const ops: Op[] = []
  const made: string[] = []
  for (const id of ids) {
    const node = doc.nodes[id]
    if (!node || !canExplode(node)) continue
    const paths: [Vec2, Vec2][] = []
    if (node.type === 'polyline') {
      const points = node.smooth ? smoothPoints(node.points, !!node.closed) : node.points
      const count = node.closed ? points.length : points.length - 1
      for (let i = 0; i < count; i++) paths.push([points[i], points[(i + 1) % points.length]])
    } else {
      const corners = rectCorners(node)
      for (let i = 0; i < 4; i++) paths.push([corners[i], corners[(i + 1) % 4]])
    }
    const pieces = paths
      .filter(([a, b]) => dist(a, b) > 1e-9)
      .map(([a, b]) => ({
        id: newId(),
        node: {
          id: '',
          type: 'line' as const,
          parent: node.parent,
          order: node.order,
          ...(node.layer ? { layer: node.layer } : {}),
          ...(node.style ? { style: node.style } : {}),
          a,
          b,
        },
      }))
    if (pieces.length === 0) continue
    ops.push({ op: 'remove_node', id })
    for (const piece of pieces) {
      piece.node.id = piece.id
      ops.push({ op: 'add_node', node: piece.node as NodeInput })
      made.push(piece.id)
    }
  }
  return made.length > 0 ? { ops, ids: made } : null
}

interface Piece {
  id: string
  node: NodeOf<'line'> | NodeOf<'polyline'>
  points: Vec2[]
}

const piecesOf = (doc: Document, ids: string[]): Piece[] =>
  ids.flatMap((id) => {
    const node = doc.nodes[id]
    if (!node || !canJoin(node)) return []
    const points = node.type === 'line' ? [node.a, node.b] : node.points
    return points.length >= 2 && dist(points[0], points[points.length - 1]) > JOIN_TOLERANCE ? [{ id, node, points }] : []
  })

/**
 * The operations that join lines and open polylines selected together, end to end, into one
 * polyline each: closed when the chain comes back to where it began, open otherwise. A corner
 * where three or more ends meet is left alone, and the lines there counted in `skipped`.
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
    // The chain this piece is in.
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
    const points = loop ? walkClosed(component, pieces, links) : walkOpen(component, pieces, links)
    if (points.length < 2) {
      skipped += component.length
      continue
    }
    const first = pieces[component[0]].node
    const id = newId()
    const closed = loop && dist(points[0], points[points.length - 1]) <= JOIN_TOLERANCE
    const shape = closed ? points.slice(0, -1) : points
    if (closed && shape.length < 3) {
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
      points: shape,
      ...(closed ? { closed: true } : {}),
    } as NodeInput
    for (const piece of component) ops.push({ op: 'remove_node', id: pieces[piece].id })
    ops.push({ op: 'add_node', node })
    ids.push(id)
    joined += component.length
  }
  return { ops, ids, joined, skipped }
}

/** The points of a chain walked from a free end, or all round when its ends meet. */
function walk(start: number, entry: 0 | 1, pieces: Piece[], links: ({ piece: number; end: 0 | 1 } | null)[][]): Vec2[] {
  const points: Vec2[] = []
  const seen = new Set<number>()
  let at = start
  let enter = entry
  for (let guard = 0; guard <= pieces.length; guard++) {
    if (seen.has(at)) break
    seen.add(at)
    const points0 = enter === 0 ? pieces[at].points : [...pieces[at].points].reverse()
    points.push(...(points.length === 0 ? points0 : points0.slice(1)))
    const exit: 0 | 1 = enter === 0 ? 1 : 0
    const link = links[at][exit]
    if (!link) break
    at = link.piece
    enter = link.end
  }
  return points
}

const walkOpen = (component: number[], pieces: Piece[], links: ({ piece: number; end: 0 | 1 } | null)[][]): Vec2[] => {
  const start = component.find((p) => links[p][0] === null || links[p][1] === null) ?? component[0]
  return walk(start, links[start][0] === null ? 0 : 1, pieces, links)
}

const walkClosed = (component: number[], pieces: Piece[], links: ({ piece: number; end: 0 | 1 } | null)[][]): Vec2[] => {
  const points = walk(component[0], 0, pieces, links)
  if (points.length > 1 && dist(points[0], points[points.length - 1]) > JOIN_TOLERANCE) points.push(points[0])
  return points
}
