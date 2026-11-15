import { cloneOps, hitTest, len, moveOps, sub, wallFollowOps, type Op, type Snap, type Vec2 } from '@opencalque/core'
import { withPaperContents } from '../../actions/clipboard'
import { registry } from '../../extensions'
import { t } from '../../i18n'
import { cancel, commit, preview, select, useStore } from '../../store'
import { formatLength } from '../../units'
import { lineEnd, snap } from '../aim'
import type { GestureOf, Keys } from '../gesture'
import { get, type Canvas, type Move, type Press } from '../runtime'
import { constrain } from '../shapes'

/*
 * The move tool, as in CAD: a point to move the selection by, then where that point goes, both
 * snapped, so that a corner, a middle or a centre of what is moved lands exactly on one of
 * something else. Two clicks rather than a drag, so the view can be panned and zoomed between them.
 */

/**
 * Whether a click leaves a copy where it is put down instead of moving the selection there. It is a
 * switch, not a key held down (`copyMode` in the store): Ctrl (⌘) turns it on and off while the
 * move goes (the pointer then shows a +), and a copy taken from a point starts with it on. What is
 * put down stays, and the tool goes on from the same point for another, until Esc.
 */
const copying = () => get().copyMode

/**
 * What the move tool does for the pointer at `world`: the selection moved by the way from the
 * point taken to where the pointer snaps, or a length and an angle typed in the quick bar, on what
 * was there when the tool took it. Copying (`copyMode`), a copy goes there instead; with Alt the
 * pointer is taken as it is and only what is selected moves, as when it is dragged.
 */
function moveAim(c: Canvas, g: GestureOf<'displace'>, world: Vec2, e: Keys): { ops: Op[]; marker: Snap | null; link?: [Vec2, Vec2]; to: Vec2; status: string } {
  const s = get()
  const before = s.base ?? s.doc
  // Not onto what moves: it follows the pointer. An arrow key holds the way level or upright.
  const target = lineEnd(c, world, e, g.ids, g.from)
  const to = constrain('move', g.from, target.p)
  const d = sub(to, g.from)
  const ids = g.ids.filter((id) => before.nodes[id])
  const nodes = ids.map((id) => before.nodes[id])
  const copy = copying()
  const ops = copy
    ? g.copies.filter((id) => before.nodes[id]).flatMap((id) => cloneOps(before, id, d).ops)
    : [...nodes.flatMap((n) => moveOps(before, n, d)), ...(e.altKey ? [] : wallFollowOps(before, nodes, d, registry))]
  const status = copy ? t('Copy, {distance} away', { distance: formatLength(len(d)) }) : t('Move by {distance}', { distance: formatLength(len(d)) })
  return { ops, marker: target.marker, link: target.link, to, status }
}

/**
 * Moves the selection, or leaves a copy, as shown. With copying on, the tool goes on from the same
 * point, for the next one, until Ctrl turns it off or Esc ends it.
 */
export function finishMove(c: Canvas, g: GestureOf<'displace'>, world: Vec2, e: Keys): void {
  if (preview(g.ops ?? moveAim(c, g, world, e).ops)) commit()
  else cancel()
  useStore.setState({ drawLocks: {}, drawLive: null })
  if (copying()) return
  useStore.setState({ copyMode: false })
  c.setGripCursor(null)
  c.gesture = { kind: 'idle' }
  c.setOverlay({})
}

/** Two clicks: the point to move by, and where it goes. With nothing selected, a click picks what to move. */
export const moveToolDown: Press = (c, e, _at, world) => {
  const s = get()
  const g = c.gesture
  if (g.kind === 'displace') return finishMove(c, g, world, e)
  if (s.selection.length === 0) {
    const hit = hitTest(c.scene, world, 5 / s.view.zoom)
    if (hit) select([hit.id])
    return
  }
  // The point taken may be one of what is moved: a corner of it, its middle, its centre.
  c.gesture = { kind: 'displace', ids: [...s.selection], copies: withPaperContents(s.selection), from: snap(c, world, e, []).p }
  // Copying from the start (`copyFromPoint`), the pointer says so with a +.
  c.setGripCursor(s.copyMode ? 'copy' : null)
}

export const displaceMove: Move<'displace'> = (c, g, e, _at, world, out) => {
  const aimed = moveAim(c, g, world, e)
  const d = sub(aimed.to, g.from)
  const simple = g.copies.length === 0 && g.ids.every((id) => {
    const node = c.scene.find((item) => item.id === id)?.node
    return node && ['ellipse', 'polyline', 'rect', 'image', 'column', 'beam', 'construction', 'dimension', 'radialDimension', 'angleDimension', 'text', 'parametric'].includes(node.type)
  })
  if (simple) {
    g.ops = aimed.ops
    out.moved = { ids: g.ids, delta: d }
    out.previewed = true
  } else {
    g.ops = undefined
    out.previewed = preview(aimed.ops)
  }
  out.marker = aimed.marker
  if (aimed.link) out.link = aimed.link
  out.status = aimed.status
  out.measure = { a: g.from, b: aimed.to }
  out.live = { a: len(d), b: (-Math.atan2(d.y, d.x) * 180) / Math.PI }
}
