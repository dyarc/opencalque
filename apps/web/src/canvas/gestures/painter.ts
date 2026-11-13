import { hitTest, rootOf, type Node, type Op } from '@opencalque/core'
import { withoutFill } from '../../materials'
import { t } from '../../i18n'
import { apply, useStore } from '../../store'
import { get, type Canvas } from '../runtime'

/*
 * The format painter: an object is clicked to take its layer and its look — the stroke, its weight
 * and dashes, what fills it, and the symbols at its ends — and then each object clicked after it
 * takes that layer and look, keeping its shape, its name and everything else of its own.
 */

/** The kinds of object that have symbols at their ends. */
const ENDED = new Set(['line', 'polyline', 'annotation', 'dimension', 'radialDimension', 'angleDimension'])

/** What the brush holds: the object it was taken from, as it was. */
let held: { id: string; node: Node } | null = null

// Putting another tool in hand puts the brush down.
useStore.subscribe((state, previous) => {
  if (previous.tool === 'formatPainter' && state.tool !== 'formatPainter') held = null
})

/** The object under the pointer, of the drawing as it is rather than as a preview shows it. */
function nodeUnder(c: Canvas, world: { x: number; y: number }): Node | null {
  const { base, doc, view } = get()
  const hit = hitTest(c.scene, world, 6 / view.zoom)
  return (hit && (base ?? doc).nodes[hit.id]) || null
}

/** What the target takes from the brush: its layer, its look, and the symbols at its ends. */
function paint(doc: ReturnType<typeof get>['doc'], source: Node, target: Node): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const root = rootOf(doc, target.id)
  // What a component holds is on no layer, and a placement has no look of its own.
  if (target.type !== 'instance' && root?.type !== 'component' && source.layer !== undefined) patch.layer = source.layer
  if (target.type !== 'instance') {
    // A wall's and a room's fill come from their material: the look of theirs is the rest.
    const style = target.type === 'wall' || target.type === 'room' ? withoutFill(source.style) : source.style
    patch.style = style ?? null
  }
  if (ENDED.has(target.type)) {
    const from = source as unknown as Record<string, unknown>
    for (const key of ['startMarker', 'endMarker', 'markerSize']) patch[key] = from[key] ?? null
  }
  return patch
}

export const painterDown = (c: Canvas, _e: unknown, _at: unknown, world: { x: number; y: number }): void => {
  if (get().tool !== 'formatPainter') {
    held = null
    return
  }
  const node = nodeUnder(c, world)
  if (!node) return
  if (held === null) {
    held = { id: node.id, node }
    useStore.setState({ status: t('Brush loaded: click what to paint') })
    return
  }
  if (node.id === held.id) return
  if (node.type === 'instance') {
    useStore.setState({ status: t('A component looks as it is drawn, in the colour of its layer: change the component, or put it on another layer.') })
    return
  }
  const patch = paint(get().doc, held.node, node)
  const ops: Op[] = [{ op: 'update_node', id: node.id, patch }]
  if (apply(ops)) useStore.setState({ status: t('Painted') })
}

/** Before a click: the object the brush would take, or paint. */
export function painterHover(c: Canvas, world: { x: number; y: number }, out: { lit?: string; status?: string }): void {
  if (get().tool !== 'formatPainter') {
    held = null
    return
  }
  const node = nodeUnder(c, world)
  if (!node) return
  if (held === null || node.id !== held.id) out.lit = node.id
}
