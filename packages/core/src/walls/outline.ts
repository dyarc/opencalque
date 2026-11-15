import { isVisible } from '../document'
import { dist, mid, perp, scale, type Vec2 } from '../geometry'
import type { Op } from '../ops'
import type { Registry } from '../registry'
import type { Document, NodeOf, WallEdge } from '../schema'
import { courseOf, cross, dot, wallArc, wallPoints, wallSides, type Wall } from './course'
import { cap, cornerJoin, wallEndsAt, wallEndsOf, type Stop } from './joints'
import { openingIndex, openingSpan, overlap } from './openings'
import { current, drawnWith } from './spatial'

/* What a wall draws: its outline in solid stretches, the lines across its ends, and which of its lines are shown. */

/** One solid stretch of a wall, between its ends and the doors and windows set in it. */
export interface WallPiece {
  /** Across its start, from the left face to the right face as the wall runs from `a` to `b`. */
  start: Vec2[]
  /** Across its end, from the right face to the left face. */
  end: Vec2[]
  /** Where along the wall's line it starts and stops: 0 and the wall's length at the wall's own ends. */
  from: number
  to: number
  /** Its outline: the start, the right face, the end, and back along the left face. */
  outline: Vec2[]
}

/** A wall in solid stretches, and what each of its ends stops against, if anything (`Stop`). */
export interface WallParts {
  pieces: WallPiece[]
  stops: { a?: Stop; b?: Stop }
}

/**
 * A stretch of a wall taken out of it (distances along its line), and where the cut runs on its two
 * faces. A door or a window cuts square across; a column is cut along its own sides, so its footprint
 * is what is missing from the wall, `start` being the left face's point then the right's, and `end`
 * the right's then the left's, as a piece's ends are.
 */
interface WallCut {
  from: number
  to: number
  start?: [Vec2, Vec2]
  end?: [Vec2, Vec2]
}

/** The four corners of a column's footprint, in the drawing. */
function columnCorners(node: NodeOf<'column'>): Vec2[] {
  const angle = ((node.rotation ?? 0) * Math.PI) / 180
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
  return [
    [0, 0],
    [node.width, 0],
    [node.width, node.height],
    [0, node.height],
  ].map(([x, y]) => ({ x: node.x + x * cos - y * sin, y: node.y + x * sin + y * cos }))
}

/**
 * Where a straight wall's left and right faces cross a column's own outline, as distances along the
 * wall and the face each is on. Four of them when the column goes through the wall as a door would,
 * two on each face; fewer when it only reaches into it, and none for a curved wall.
 */
function columnCrossings(wall: Wall, node: NodeOf<'column'>): { along: number; left: boolean; p: Vec2 }[] {
  const course = courseOf(wall)
  const { left, right } = wallSides(wall)
  const dir = course.dir(0)
  const normal = perp(dir)
  const corners = columnCorners(node)
  const found: { along: number; left: boolean; p: Vec2 }[] = []
  for (let i = 0; i < 4; i++) {
    const p = corners[i]
    const q = corners[(i + 1) % 4]
    const edge = { x: q.x - p.x, y: q.y - p.y }
    const denom = cross(edge, dir)
    if (Math.abs(denom) < 1e-9) continue
    for (const [across, isLeft] of [
      [-left, true],
      [right, false],
    ] as const) {
      const o = { x: wall.a.x + normal.x * across, y: wall.a.y + normal.y * across }
      const u = cross({ x: o.x - p.x, y: o.y - p.y }, dir) / denom
      if (u < -1e-9 || u > 1 + 1e-9) continue
      const at = { x: p.x + edge.x * u, y: p.y + edge.y * u }
      const along = dot({ x: at.x - wall.a.x, y: at.y - wall.a.y }, dir)
      if (along < -1e-6 || along > course.length + 1e-6) continue
      found.push({ along, left: isLeft, p: at })
    }
  }
  return found
}

/** How the two ends of a column's cut run across a straight wall: along its own sides, or square across when that cannot be told. */
function columnCaps(wall: Wall, node: NodeOf<'column'>): { start?: [Vec2, Vec2]; end?: [Vec2, Vec2] } {
  if (wallArc(wall)) return {}
  const found = columnCrossings(wall, node)
  if (found.length !== 4) return {}
  found.sort((a, b) => a.along - b.along)
  const [one, two, three, four] = found
  // Each end of the cut is one stretch of the column's own outline, from one face to the other.
  if (one.left === two.left || three.left === four.left) return {}
  // A piece's own ends are told apart: it starts on its left face and ends on its right, so the cut
  // that ends the piece before this one is given the right first, and the cut that starts the piece
  // after it, the left first.
  const faces = (a: typeof one, b: typeof two) => ({ left: (a.left ? a : b).p, right: (a.left ? b : a).p })
  const [entry, exit] = [faces(one, two), faces(three, four)]
  return { start: [entry.right, entry.left], end: [exit.left, exit.right] }
}

/** Where a column's footprint crosses a wall's line, as stretches of the line (distances from `a`), cut along its own sides where the wall is straight. */
function columnCuts(wall: Wall, doc: Document): WallCut[] {
  const out: WallCut[] = []
  const points = wallPoints(wall)
  for (const node of drawnWith(doc, wall.parent)) {
    if (node.type !== 'column' || !isVisible(doc, node)) continue
    const angle = ((node.rotation ?? 0) * Math.PI) / 180
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
    const local = (p: Vec2): Vec2 => {
      const [dx, dy] = [p.x - node.x, p.y - node.y]
      return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
    }
    let along = 0
    for (let i = 0; i + 1 < points.length; i++) {
      const [a, b] = [local(points[i]), local(points[i + 1])]
      const length = dist(points[i], points[i + 1])
      if (length < 1e-9) continue
      // Liang-Barsky: the stretch of this piece inside the column's [0, width] × [0, height] box.
      let [enter, leave] = [0, 1]
      let inside = true
      const d = { x: b.x - a.x, y: b.y - a.y }
      for (const [p, q] of [
        [-d.x, a.x],
        [d.x, node.width - a.x],
        [-d.y, a.y],
        [d.y, node.height - a.y],
      ]) {
        if (Math.abs(p) < 1e-12) {
          if (q < 0) inside = false
        } else {
          const t = q / p
          if (p < 0) enter = Math.max(enter, t)
          else leave = Math.min(leave, t)
        }
      }
      if (inside && enter < leave - 1e-9) out.push({ from: along + enter * length, to: along + leave * length, ...columnCaps(wall, node) })
      along += length
    }
  }
  return out
}

/** The doors, windows and columns of a wall, as the stretches of its line they take (distances from `a`), in order. */
function openingCuts(wall: Wall, doc: Document, registry: Registry): WallCut[] {
  const cuts: WallCut[] = []
  if (current(doc, wall)) {
    for (const cut of openingIndex(doc, wall.parent, registry).cuts.get(wall.id) ?? []) if (cut.visible) cuts.push({ from: cut.from, to: cut.to })
  } else {
    for (const node of drawnWith(doc, wall.parent)) {
      const span = isVisible(doc, node) ? openingSpan(node, registry) : null
      const cut = span && overlap(wall, span)
      if (cut) cuts.push({ from: cut[0], to: cut[1] })
    }
  }
  cuts.push(...columnCuts(wall, doc))
  return cuts.sort((x, y) => x.from - y.from)
}

/**
 * The outline of a wall as one polygon per solid stretch: ends mitred into the walls they meet,
 * and gaps left for the doors and windows placed on it.
 */
export function wallPolygons(wall: Wall, doc: Document, registry: Registry): Vec2[][] {
  // A wall of the drawing as it is is worked out once for each state of it: the lines between
  // materials ask again for the outlines of the walls around each wall. Not to be changed in place.
  if (!current(doc, wall)) return wallParts(wall, doc, registry).pieces.map((piece) => piece.outline)
  let entry = outlines.get(doc.nodes)
  if (!entry || entry.layers !== doc.layers || entry.version !== registry.version || entry.registry !== registry) {
    outlines.set(doc.nodes, (entry = { layers: doc.layers, version: registry.version, registry, byWall: new Map() }))
  }
  let found = entry.byWall.get(wall.id)
  if (!found) entry.byWall.set(wall.id, (found = wallParts(wall, doc, registry).pieces.map((piece) => piece.outline)))
  return found
}

/** The outlines of the walls of a drawing, for each state of it (`wallPolygons`); the layers decide which doors and windows show. */
const outlines = new WeakMap<Document['nodes'], { layers: Document['layers']; version: number; registry: Registry; byWall: Map<string, Vec2[][]> }>()

/** A wall in solid stretches, with the ends of each, as `wallPolygons` draws it. */
export function wallParts(wall: Wall, doc: Document, registry: Registry): WallParts {
  if (dist(wall.a, wall.b) < 1e-6) return { pieces: [], stops: {} }
  return wallPieces(wall, doc, openingCuts(wall, doc, registry))
}

/**
 * The whole outline of a wall as it is drawn, its ends mitred into the walls it meets, with no
 * gaps for its doors and windows: what bounds a room. Empty for a wall of no length.
 */
export function wallOutline(wall: Wall, doc: Document): Vec2[] {
  return dist(wall.a, wall.b) < 1e-6 ? [] : (wallPieces(wall, doc, []).pieces[0]?.outline ?? [])
}

/**
 * A closed outline without the points where it goes back on itself, and without points repeated.
 * Two walls making an L whose outer faces run on from one another (the line of one along the
 * outer face of the other) are mitred with the whole corner in one of them: the other's face runs
 * out to the outer corner and straight back to the joint. That stretch has no area and changes
 * nothing that is filled, but it was drawn wherever the outline is (a selection, a hatch cut to
 * it, the export), as a line running on under the other wall.
 */
function withoutSpikes(points: Vec2[]): Vec2[] {
  let out = points
  for (let changed = true; changed && out.length > 3; ) {
    changed = false
    const n = out.length
    for (let i = 0; i < n; i++) {
      const a = out[(i + n - 1) % n]
      const b = out[i]
      const c = out[(i + 1) % n]
      const u = { x: b.x - a.x, y: b.y - a.y }
      const v = { x: c.x - b.x, y: c.y - b.y }
      const lu = Math.hypot(u.x, u.y)
      const lv = Math.hypot(v.x, v.y)
      // A point on top of the one before, or one where the outline turns right back.
      const back = lu > 1e-6 && lv > 1e-6 && Math.abs(u.x * v.y - u.y * v.x) < 1e-6 * lu * lv && u.x * v.x + u.y * v.y < 0
      if (lu <= 1e-6 || back) {
        out = [...out.slice(0, i), ...out.slice(i + 1)]
        changed = true
        break
      }
    }
  }
  return out
}

/** The outline of a wall in solid stretches, between the given cuts (distances along it, in order). */
function wallPieces(wall: Wall, doc: Document, cuts: WallCut[]): WallParts {
  const course = courseOf(wall)
  const length = course.length
  const { left: l, right: r } = wallSides(wall)
  const stopA: { stop?: Stop } = {}
  const stopB: { stop?: Stop } = {}
  const capA = cap(wall.a, wall, course.dir(0), doc, undefined, stopA)
  const capB = cap(wall.b, wall, scale(course.dir(length), -1), doc, undefined, stopB)

  const pieces: WallPiece[] = []
  // `after` is where the cut before this one left the wall, when it did not leave it square across:
  // a column's own side, which the piece then starts from.
  const piece = (from: number, to: number, after?: [Vec2, Vec2], before?: [Vec2, Vec2]) => {
    const start = after ?? (from <= 0 ? capA : [course.offset(from, -l), course.offset(from, r)])
    const end = before ?? (to >= length ? capB : [course.offset(to, r), course.offset(to, -l)])
    // Between its two ends a curved wall follows its curve, along one face and back along the
    // other. Each face starts where the end before it left off, which at a mitred corner is some
    // way along the wall, or behind its end.
    const face = (side: 1 | -1, begin: Vec2, stop: Vec2): Vec2[] => {
      const lo = from <= 0 ? course.project(begin).along : from
      const hi = to >= length ? course.project(stop).along : to
      return course.stops.filter((s) => s > lo + 1e-3 && s < hi - 1e-3).map((s) => course.offset(s, side > 0 ? r : -l))
    }
    pieces.push({ start, end, from, to, outline: withoutSpikes([...start, ...face(1, start[start.length - 1], end[0]), ...end, ...face(-1, start[0], end[end.length - 1]).reverse()]) })
  }
  let start = 0
  let after: [Vec2, Vec2] | undefined
  for (const cut of cuts) {
    if (cut.from > start + 1e-6) piece(start, cut.from, after, cut.start)
    if (cut.to > start + 1e-6) {
      after = cut.end
      start = cut.to
    }
  }
  if (start < length - 1e-6) piece(start, length, after)
  return { pieces, stops: { ...(stopA.stop ? { a: stopA.stop } : {}), ...(stopB.stop ? { b: stopB.stop } : {}) } }
}

/**
 * The lines to draw across a wall where it stops against another that runs through: the one place
 * where two joined walls show the line between them.
 */
export function wallSeams(wall: Wall, doc: Document): { points: [Vec2, Vec2]; end: 'a' | 'b' }[] {
  // Asked of every wall: the line at a joint may be wanted by the other wall alone.
  if (dist(wall.a, wall.b) < 1e-6) return []
  const course = courseOf(wall)
  const atA: [Vec2, Vec2][] = []
  const atB: [Vec2, Vec2][] = []
  cap(wall.a, wall, course.dir(0), doc, atA)
  cap(wall.b, wall, scale(course.dir(course.length), -1), doc, atB)
  return [...atA.map((points) => ({ points, end: 'a' as const })), ...atB.map((points) => ({ points, end: 'b' as const }))]
}

/**
 * The outline of a wall as the lines of it that are drawn, when some are not: null for a wall
 * that shows all its edges, and is then drawn as the outline of its pieces. Each run is a string
 * of edges that follow one another. A face is told from an end by where an edge lies: along the
 * wall at half its thickness to one side, or across it at one of its two ends. The sides of an
 * opening are always drawn.
 */
export function wallOutlineRuns(wall: Wall, pieces: Vec2[][]): { points: Vec2[]; edge: 'left' | 'right' | 'a' | 'b' | 'opening' }[] | null {
  const edges = wall.edges
  const set = (edge: WallEdge | undefined) => !!edge && (edge.show === false || edge.stroke !== undefined || edge.strokeWidth !== undefined || edge.dash !== undefined)
  if (!edges || ![edges.left, edges.right, edges.a, edges.b].some(set)) return null
  const course = courseOf(wall)
  const { left, right } = wallSides(wall)
  const near = Math.max(0.5, wall.thickness * 0.01)
  /** Which edge of the wall the stretch from `from` to `to` belongs to. */
  const edgeOf = (from: Vec2, to: Vec2): 'left' | 'right' | 'a' | 'b' | 'opening' => {
    const points = [from, mid(from, to), to]
    const places = points.map((q) => course.project(q))
    // Along a face: both ends and the middle are where that face is across the line (to the right as the wall runs from a to b is positive).
    if (places.every((place) => Math.abs(place.across - right) < near)) return 'right'
    if (places.every((place) => Math.abs(place.across + left) < near)) return 'left'
    // Across an end: at the very start or the very end of the wall. Anything else is the side of an opening.
    if (places[1].along < near) return 'a'
    if (places[1].along > course.length - near) return 'b'
    return 'opening'
  }
  const hidden = (edge: ReturnType<typeof edgeOf>) => edge !== 'opening' && edges[edge]?.show === false
  const runs: { points: Vec2[]; edge: ReturnType<typeof edgeOf> }[] = []
  for (const piece of pieces) {
    const count = piece.length
    const kinds = Array.from({ length: count }, (_, i) => edgeOf(piece[i], piece[(i + 1) % count]))
    // Start going round where the edge changes, so that no run is cut in two by where the outline begins.
    const first = kinds.findIndex((kind, i) => kind !== kinds[(i + count - 1) % count])
    const start = first < 0 ? 0 : first
    let run: { points: Vec2[]; edge: ReturnType<typeof edgeOf> } | null = null
    for (let k = 0; k < count; k++) {
      const i = (start + k) % count
      const [from, to, kind] = [piece[i], piece[(i + 1) % count], kinds[i]]
      if (hidden(kind)) {
        if (run) runs.push(run)
        run = null
      } else if (run && run.edge === kind) run.points.push(to)
      else {
        if (run) runs.push(run)
        run = { points: [from, to], edge: kind }
      }
    }
    if (run) runs.push(run)
  }
  return runs
}

/**
 * Where one line of a wall lies, to point it out: a face as the stretches of the wall's outline
 * along it (between openings), an end as the wall's outline there, as it is drawn: square at a
 * free end, along the joint where it meets other walls.
 */
export function wallEdgeLines(wall: Wall, doc: Document, registry: Registry, edge: 'left' | 'right' | 'a' | 'b'): Vec2[][] {
  if (dist(wall.a, wall.b) < 1e-6) return []
  const course = courseOf(wall)
  if (edge === 'a' || edge === 'b') {
    return [edge === 'a' ? cap(wall.a, wall, course.dir(0), doc) : cap(wall.b, wall, scale(course.dir(course.length), -1), doc)]
  }
  // A face: the outline of the wall drawn edge by edge, as if every edge had a look of its own, keeping this face's runs.
  const marked = { ...wall, edges: { ...wall.edges, [edge]: { ...wall.edges?.[edge], show: true, strokeWidth: 1 } } }
  return (wallOutlineRuns(marked, wallPolygons(wall, doc, registry)) ?? []).filter((run) => run.edge === edge).map((run) => run.points)
}

/** Whether the line across an end of a wall is drawn, as things stand: at a free end, and at a joint with one other wall, by what the two ask and how they are joined. */
export function endLineShown(doc: Document, wall: Wall, end: 'a' | 'b'): boolean {
  const ends = wallEndsOf(doc, wall, end)
  if (ends.length === 1) return wall.edges?.[end]?.show !== false
  if (ends.length !== 2) return false
  const asked = ends.map((other) => other.wall.edges?.[other.end]?.show)
  return asked.includes(true) ? true : asked.includes(false) ? false : cornerJoin(ends) === 'butt'
}

/** Whether the line across an end of a wall is drawn when nobody has said: at a free end, and where the wall stops against another. */
export function endLineUsual(doc: Document, wall: Wall, end: 'a' | 'b'): boolean {
  const ends = wallEndsOf(doc, wall, end)
  return ends.length === 1 ? true : ends.length === 2 && cornerJoin(ends) === 'butt'
}

/**
 * The operations that draw or hide the line across an end of a wall. At a joint with another
 * wall both are told, so that they cannot disagree; what is the usual for the joint is said by
 * saying nothing.
 */
export function endLineOps(doc: Document, wall: Wall, end: 'a' | 'b', shown: boolean): Op[] {
  const ends = wallEndsOf(doc, wall, end)
  const usual = endLineUsual(doc, wall, end)
  return (ends.length <= 2 ? ends : []).map((other): Op => {
    // The end keeps its look; only whether it is drawn changes.
    const { show: _, ...look } = other.wall.edges?.[other.end] ?? {}
    const edge = shown === usual ? look : { ...look, show: shown }
    return { op: 'update_node', id: other.wall.id, patch: { edges: withEdge(other.wall.edges, other.end, edge) } }
  })
}

/** The edges of a wall with one of them replaced, null when none is left saying anything. */
export function withEdge(edges: Wall['edges'], key: 'left' | 'right' | 'a' | 'b', edge: WallEdge): Wall['edges'] | null {
  const next: Record<string, WallEdge> = { ...edges }
  if (Object.keys(edge).length > 0) next[key] = edge
  else delete next[key]
  return Object.keys(next).length > 0 ? next : null
}

/** The edges of a wall without what it says of one end. */
export function withoutEnd(edges: Wall['edges'], end: 'a' | 'b'): NonNullable<Wall['edges']> {
  const { [end]: _, ...rest } = edges ?? {}
  return rest
}
