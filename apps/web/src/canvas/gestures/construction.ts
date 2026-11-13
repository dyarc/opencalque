import { add, distToSegment, hitTest, newId, norm, perp, scale, type NodeInput, type Vec2 } from '@opencalque/core'
import { t } from '../../i18n'
import { cancel, commit, layerHere, preview, useStore } from '../../store'
import { formatLength } from '../../units'
import { gridStep } from '../../view'
import { snap } from '../aim'
import type { GestureOf, Keys } from '../gesture'
import { get, syncStep, type Canvas, type Move, type Press } from '../runtime'
import { currentStyle } from '../shapes'
import { drawDown } from './drawTools'

/*
 * The construction line tool: an endless dashed guide, drawn parallel to a line taken under the
 * pointer or through two points clicked. A line taken, the pointer sets how far from it the guide
 * runs, on its side, and a distance typed in the quick bar does instead; a click places it.
 */

/** How near a line the pointer must be to take its direction, in screen pixels. */
const REACH = 6

/** The stretch of what is under the pointer nearest it: the two points a construction line takes its direction from. */
function stretchUnder(c: Canvas, world: Vec2): { a: Vec2; b: Vec2 } | null {
  const { view } = get()
  const reach = REACH / view.zoom
  // A construction line is a guide already, and the one being placed crosses the pointer: neither
  // is a line to take a direction from.
  const hit = hitTest(
    c.scene.filter((item) => item.node.type !== 'construction'),
    world,
    reach,
  )
  if (!hit) return null
  let best: { a: Vec2; b: Vec2; near: number } | null = null
  for (const prim of hit.prims) {
    if (prim.kind !== 'path' || prim.texture || prim.points.length < 2) continue
    const points = prim.closed ? [...prim.points, prim.points[0]] : prim.points
    for (let i = 0; i + 1 < points.length; i++) {
      const near = distToSegment(world, points[i], points[i + 1])
      if (near <= reach && (!best || near < best.near)) best = { a: points[i], b: points[i + 1], near }
    }
  }
  return best && { a: best.a, b: best.b }
}

/** Where the guide would go: its direction, how far it stands from the line taken, and that distance as a value to show. */
function aimed(c: Canvas, g: GestureOf<'construction'>, world: Vec2, e: Keys) {
  const { drawLocks, view } = get()
  const target = snap(c, world, e, [g.id])
  const at = target.marker ? target.p : world
  const direction = norm({ x: g.b.x - g.a.x, y: g.b.y - g.a.y })
  const across = perp(direction)
  const beside = (at.x - g.a.x) * across.x + (at.y - g.a.y) * across.y
  const step = gridStep(view.zoom)
  const free = target.marker !== null || e.altKey
  const length = drawLocks.a ?? (free ? Math.abs(beside) : Math.round(Math.abs(beside) / step) * step)
  return { marker: target.marker, direction, across, length, distance: beside < 0 ? -length : length }
}

/** The node the guide is: the point it passes through, and the way it runs. */
function guide(g: GestureOf<'construction'>, across: Vec2, distance: number, direction: Vec2): NodeInput & { id: string } {
  const through = add(g.a, scale(across, distance))
  return { id: g.id, type: 'construction', parent: get().scope, ...layerHere(), ...currentStyle(), a: through, b: add(through, direction) }
}

/** Keeps the guide where the pointer, or a typed offset, puts it. */
function place(c: Canvas, g: GestureOf<'construction'>, e: Keys, world: Vec2): void {
  const { direction, across, distance } = aimed(c, g, world, e)
  if (preview([{ op: 'add_node', node: guide(g, across, distance, direction) }])) commit()
  else cancel()
  c.gesture = { kind: 'idle' }
  useStore.setState({ drawLocks: {}, drawLive: null })
  c.setOverlay({})
  syncStep(c)
}

export const constructionDown: Press = (c, e, at, world) => {
  const g = c.gesture
  if (g.kind === 'construction') return place(c, g, e, world)
  // A two-point guide is being drawn: the next click is its second point, and the line under the
  // pointer is that guide itself, which must not be taken for a line to copy.
  if (g.kind === 'draw') return drawDown(c, e, at, world)
  const stretch = stretchUnder(c, world)
  // On a line: the guide runs parallel to it, at the distance the pointer gives. Elsewhere: two points.
  if (!stretch) return drawDown(c, e, at, world)
  c.gesture = { kind: 'construction', id: newId(), a: stretch.a, b: stretch.b }
  syncStep(c)
}

export const constructionMove: Move<'construction'> = (c, g, e, _at, world, out) => {
  const { marker, direction, across, distance, length } = aimed(c, g, world, e)
  out.marker = marker
  out.previewed = preview([{ op: 'add_node', node: guide(g, across, distance, direction) }])
  out.live = { a: length, b: 0 }
  out.status = t('Offset {value}', { value: formatLength(length) })
}
