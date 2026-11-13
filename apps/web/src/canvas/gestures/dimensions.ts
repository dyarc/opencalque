import { add, dist, hitTest, newId, norm, scale, sub, type FilletTarget, type Node, type Vec2 } from '@opencalque/core'
import { t } from '../../i18n'
import { formatLength } from '../../units'
import { cancel, commit, layerHere, preview, useStore } from '../../store'
import type { GestureOf, Keys } from '../gesture'
import { get, syncStep, type Canvas, type Move, type Press } from '../runtime'
import { currentStyle } from '../shapes'

/*
 * The measuring dimensions: a radius taken from an arc or a circle, and an angle taken from two
 * stretches of line. A radius dimension is placed by its leader, an angle by the radius of its arc.
 */

/** How near something the pointer must be to take it, in screen pixels. */
const REACH = 6

const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
const tidy = (n: number): number => Math.round(n * 1e6) / 1e6

/** What is under the pointer in the drawing itself, taken back to the node. */
function nodeUnder(c: Canvas, world: Vec2): Node | null {
  const { base, doc, view } = get()
  const hit = hitTest(c.scene, world, REACH / view.zoom)
  return (hit && (base ?? doc).nodes[hit.id]) || null
}

/** The centre and radius of a circular arc or a circle under the pointer. */
function arcUnder(c: Canvas, world: Vec2): { centre: Vec2; radius: number } | null {
  const node = nodeUnder(c, world)
  if (!node || node.type !== 'ellipse' || Math.abs(node.rx - node.ry) > 1e-6) return null
  return { centre: { x: node.cx, y: node.cy }, radius: node.rx }
}

/** The two ends of the stretch of a line or polyline clicked, and which stretch it is. */
function stretchUnder(c: Canvas, world: Vec2): { target: FilletTarget; a: Vec2; b: Vec2 } | null {
  const node = nodeUnder(c, world)
  if (!node) return null
  if (node.type === 'line') return { target: { node, at: world }, a: node.a, b: node.b }
  if (node.type !== 'polyline' || node.smooth) return null
  let best: { segment: number; near: number } | null = null
  for (let i = 0; i < node.points.length; i++) {
    const a = node.points[i]
    const b = node.points[(i + 1) % node.points.length]
    const near = pointToSegment(world, a, b)
    if (!best || near < best.near) best = { segment: i, near }
  }
  if (!best || node.bulges?.[best.segment]) return null
  const a = node.points[best.segment]
  const b = node.points[(best.segment + 1) % node.points.length]
  return { target: { node, at: world, segment: best.segment }, a, b }
}

const pointToSegment = (p: Vec2, a: Vec2, b: Vec2): number => {
  const d = sub(b, a)
  const l2 = d.x * d.x + d.y * d.y
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2))
  return dist(p, { x: a.x + t * d.x, y: a.y + t * d.y })
}

const radialNode = (g: GestureOf<'radiusDimension'>, at: Vec2): Record<string, unknown> => ({
  id: g.id,
  type: 'radialDimension',
  parent: get().scope,
  ...layerHere(),
  ...currentStyle(),
  centre: g.centre,
  radius: g.radius,
  angle: (Math.atan2(at.y - g.centre.y, at.x - g.centre.x) * 180) / Math.PI,
})

export const radialDimensionDown: Press = (c, _e, _at, world) => {
  const g = c.gesture
  if (g.kind === 'radiusDimension') {
    if (preview([{ op: 'add_node', node: radialNode(g, world) as never }])) commit()
    else cancel()
    c.gesture = { kind: 'idle' }
    useStore.setState({ drawLocks: {}, drawLive: null })
    c.setOverlay({})
    syncStep(c)
    return
  }
  const arc = arcUnder(c, world)
  if (!arc) {
    useStore.setState({ status: t('Only arcs and circles can carry a radius dimension') })
    return
  }
  c.gesture = { kind: 'radiusDimension', id: newId(), centre: arc.centre, radius: arc.radius }
  syncStep(c)
}

export const radialDimensionMove: Move<'radiusDimension'> = (c, g, _e, _at, world, out) => {
  out.previewed = preview([{ op: 'add_node', node: radialNode(g, world) as never }])
  out.status = t('Radius {value}', { value: formatLength(g.radius) })
}

const angleNode = (g: GestureOf<'anglePlace'>, radius: number): Record<string, unknown> => ({
  id: g.id,
  type: 'angleDimension',
  parent: get().scope,
  ...layerHere(),
  ...currentStyle(),
  vertex: g.vertex,
  from: g.from,
  to: g.to,
  radius,
})

const angleRadius = (g: GestureOf<'anglePlace'>, world: Vec2): number => Math.max(100, dist(g.vertex, world))

export const angleDimensionDown: Press = (c, _e, _at, world) => {
  const g = c.gesture
  if (g.kind === 'anglePlace') {
    if (preview([{ op: 'add_node', node: angleNode(g, angleRadius(g, world)) as never }])) commit()
    else cancel()
    c.gesture = { kind: 'idle' }
    useStore.setState({ drawLocks: {}, drawLive: null })
    c.setOverlay({})
    syncStep(c)
    return
  }
  if (g.kind === 'angleDimension') {
    const second = stretchUnder(c, world)
    if (!second) return
    if (second.target.node.id === g.first.node.id && second.target.segment === g.first.segment) return
    const d1 = sub(g.b, g.a)
    const d2 = sub(second.b, second.a)
    const denom = cross(d1, d2)
    if (Math.abs(denom) < 1e-9 * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) {
      useStore.setState({ status: t('These lines run parallel: there is no angle between them') })
      return
    }
    const vertex = add(g.a, scale(d1, cross(sub(second.a, g.a), d2) / denom))
    const arm = (a: Vec2, b: Vec2, at: Vec2): Vec2 => {
      const dir = norm(sub(b, a))
      const side = Math.sign(dot(sub(at, vertex), dir)) || 1
      return scale(dir, side)
    }
    c.gesture = {
      kind: 'anglePlace',
      id: newId(),
      vertex: { x: tidy(vertex.x), y: tidy(vertex.y) },
      from: add(vertex, arm(g.a, g.b, g.first.at)),
      to: add(vertex, arm(second.a, second.b, world)),
    }
    syncStep(c)
    return
  }
  const first = stretchUnder(c, world)
  if (!first) return void useStore.setState({ status: t('Only straight lines and the straight stretches of a polyline can measure an angle') })
  c.gesture = { kind: 'angleDimension', first: first.target, a: first.a, b: first.b }
  syncStep(c)
}

export const angleDimensionMove: Move<'angleDimension'> = () => {}

export const anglePlaceMove: Move<'anglePlace'> = (c, g, _e, _at, world, out) => {
  const radius = angleRadius(g, world)
  out.previewed = preview([{ op: 'add_node', node: angleNode(g, radius) as never }])
  out.status = t('Arc radius {value}', { value: formatLength(radius) })
}
