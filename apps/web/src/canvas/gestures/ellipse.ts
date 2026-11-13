import { add, dist, newId, norm, perp, sub, type Vec2 } from '@opencalque/core'
import { t } from '../../i18n'
import { cancel, commit, layerHere, preview, useStore } from '../../store'
import { formatLength } from '../../units'
import { snap } from '../aim'
import type { GestureOf } from '../gesture'
import { get, syncStep, type Canvas, type Move, type Press } from '../runtime'
import { currentStyle } from '../shapes'

/*
 * An ellipse set by its two axes: the two ends of one, then the two ends of the other. Its middle
 * and its first axis come from the first pair; the second pair sets how wide it is the other way.
 * The four points make it easier to line an ellipse up with a drawing than a box does.
 */

const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y

/** The ellipse the points give, or null before its first axis is set. */
export function ellipseOf(points: Vec2[]): { cx: number; cy: number; rx: number; ry: number; rotation: number } | null {
  if (points.length < 2) return null
  const [one, two] = points
  const middle = { x: (one.x + two.x) / 2, y: (one.y + two.y) / 2 }
  const rx = dist(one, two) / 2
  if (rx < 1e-6) return null
  const axis = norm(sub(two, one))
  const across = perp(axis)
  const widths = points.slice(2, 4).map((p) => Math.abs(dot(sub(p, middle), across)))
  const ry = Math.max(1, widths.length > 0 ? widths.reduce((sum, width) => sum + width, 0) / widths.length : 0)
  return { cx: middle.x, cy: middle.y, rx, ry, rotation: (Math.atan2(axis.y, axis.x) * 180) / Math.PI }
}

const ellipseNode = (points: Vec2[], id: string): Record<string, unknown> => {
  const shape = ellipseOf(points)!
  return { id, type: 'ellipse', parent: get().scope, ...layerHere(), ...currentStyle(true), ...shape }
}

/** Shows the ellipse as far as the points and the pointer have taken it. */
function show(c: Canvas, g: GestureOf<'ellipse'>, world: Vec2): void {
  if (g.points.length < 2) return
  const points = [...g.points, world].slice(0, 4)
  const shape = ellipseOf(points)
  if (!shape) return
  preview([{ op: 'add_node', node: { ...ellipseNode(points, g.id), ...shape } as never }])
}

export const ellipseDown: Press = (c, e, _at, world) => {
  const g = c.gesture
  const snapped = snap(c, world, e, g.kind === 'ellipse' ? [g.id] : []).p
  if (g.kind !== 'ellipse') {
    c.gesture = { kind: 'ellipse', id: newId(), points: [snapped] }
    syncStep(c)
    return
  }
  if (dist(snapped, g.points[g.points.length - 1]) < 1e-6) return
  g.points.push(snapped)
  if (g.points.length === 4) {
    const node = ellipseNode(g.points, g.id)
    if (preview([{ op: 'add_node', node: node as never }])) commit()
    else cancel()
    c.gesture = { kind: 'idle' }
    c.setOverlay({})
    syncStep(c)
    return
  }
  show(c, g, snapped)
  syncStep(c)
}

export const ellipseMove: Move<'ellipse'> = (c, g, _e, _at, world, out) => {
  show(c, g, world)
  const shape = ellipseOf([...g.points, world].slice(0, 4))
  if (shape) out.status = `${formatLength(shape.rx * 2)} × ${formatLength(shape.ry * 2)}`
  else if (g.points.length === 1) out.status = t('Click the other end of the first axis')
}
