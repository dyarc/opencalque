import type { ParametricKind, Primitive } from '@opencalque/core'
import { rect } from './fronts'
import { atLeast, circle, DEPTH, HEIGHT, line, outline, pt, sizedBox, THIN, WIDTH } from './shared'

// A radiator stands against the wall by its top edge, as the kitchen pieces do.

/** The least a radiator is made long by pulling its sides, and the least it is made deep, in mm. */
const MIN_LENGTH = 200
const MIN_DEPTH = 40
/** How wide a section of a radiator is drawn, in mm: about that of a column or cast-iron radiator. */
const SECTION = 60
/** The most sections drawn: a length typed by mistake must not draw a million lines. */
const MAX_SECTIONS = 200

/**
 * A heating radiator against a wall: its body, cut into sections that keep their width as it is
 * made longer, and, beside the end it is fed from, its valve on the pipe that comes to it.
 */
export const radiator: ParametricKind = {
  kind: 'arch.radiator',
  label: 'Radiator',
  category: 'heating',
  description: 'Against the wall by its back. Pull its sides to make it longer: its sections keep their width. Its valve is at one end.',
  params: [{ ...WIDTH, label: 'Length', default: 800 }, DEPTH(100), { key: 'valve', label: 'Valve', type: 'string', default: 'Right', options: ['Right', 'Left'] }],
  box: sizedBox('width', 'depth', MIN_LENGTH, MIN_DEPTH),
  build({ width, depth, valve }) {
    const w = atLeast(1, width)
    const d = atLeast(1, depth)
    const sections = Math.min(MAX_SECTIONS, Math.max(1, Math.round(w / SECTION)))
    const prims: Primitive[] = [outline([pt(0, 0), pt(w, 0), pt(w, d), pt(0, d)])]
    for (let i = 1; i < sections; i++) prims.push(line([pt((i * w) / sections, 0), pt((i * w) / sections, d)], THIN))
    const r = Math.min(20, d / 3)
    const end = valve === 'Left' ? 0 : w
    const out = valve === 'Left' ? -1 : 1
    prims.push(line([pt(end, d / 2), pt(end + out * 10, d / 2)]), circle(end + out * (10 + r), d / 2, r))
    return prims
  },
}

/** The least a fireplace's breast is made, wide and deep, in mm. */
const MIN_FIREPLACE = 400
const MIN_FIREPLACE_DEPTH = 250
/** How high the mantel of an open fireplace is, and its opening under it, in mm. */
const MANTEL = 1200
const OPENING = 800
/** How high above the floor a cassette's frame starts, and how high it is, in mm. */
const CASSETTE_SILL = 450
const CASSETTE_HEIGHT = 600
/** The frame round a cassette's glass, in mm. */
const CASSETTE_FRAME = 50

/**
 * A fireplace ("cheminée"): its chimney breast against the wall by its back, as wide and deep as
 * its parameters, and in it either a cassette, a closed insert behind glass set flush with the
 * front of the breast, or an open hearth, the firebox splayed towards the room with the hearth
 * slab laid on the floor in front of it. Seen from in front, the cassette's glass in the breast, or
 * the opening under the mantel with the hood rising over it.
 */
export const fireplace: ParametricKind = {
  kind: 'arch.fireplace',
  label: 'Fireplace',
  category: 'heating',
  description: 'Its chimney breast goes against the wall by its back. A cassette is a closed insert behind glass, set in the breast; an open hearth has its slab on the floor in front. Pull its sides to make it wider or deeper.',
  params: [
    { ...WIDTH, default: 1000 },
    DEPTH(500),
    HEIGHT(2500),
    { key: 'style', label: 'Style', type: 'string', default: 'Cassette', options: ['Cassette', 'Open hearth'] },
    { key: 'hearth', label: 'Hearth', type: 'number', default: 400, unit: 'length', shown: ({ style }) => style === 'Open hearth' },
  ],
  box: sizedBox('width', 'depth', MIN_FIREPLACE, MIN_FIREPLACE_DEPTH),
  mount: { on: 'floor' },
  height: ({ height }) => atLeast(1, height),
  build({ width, depth, style, hearth }) {
    const w = atLeast(1, width)
    const d = atLeast(1, depth)
    if (style === 'Open hearth') {
      // The masonry round the firebox, open at the front, and the slab in front of it.
      const slab = Math.max(0, Number(hearth) || 0)
      const prims: Primitive[] = [outline([pt(w * 0.2, d), pt(0, d), pt(0, 0), pt(w, 0), pt(w, d), pt(w * 0.8, d), pt(w * 0.7, d * 0.25), pt(w * 0.3, d * 0.25)])]
      if (slab > 0) prims.push(outline([pt(0, d), pt(w, d), pt(w, d + slab), pt(0, d + slab)], THIN))
      return prims
    }
    // The cassette, flush with the front of the breast, its glass along the front.
    const m = Math.min(150, w * 0.15)
    const glass = d - Math.min(30, d * 0.08)
    return [outline([pt(0, 0), pt(w, 0), pt(w, d), pt(0, d)]), outline([pt(m, d * 0.25), pt(w - m, d * 0.25), pt(w - m, d), pt(m, d)]), line([pt(m, glass), pt(w - m, glass)], THIN)]
  },
  front: ({ width, height, style }) => {
    const w = atLeast(1, width)
    const h = atLeast(1, height)
    if (style === 'Open hearth') {
      const mantel = Math.min(MANTEL, h)
      const opening = Math.min(OPENING, mantel * 0.7)
      const prims: Primitive[] = [rect(0, 0, w, -mantel), line([pt(w * 0.2, 0), pt(w * 0.2, -opening), pt(w * 0.8, -opening), pt(w * 0.8, 0)]), rect(-30, -mantel, w + 30, -mantel - 50, THIN)]
      // The hood, narrower than the mantel, up to the top of the breast.
      if (h > mantel + 50) prims.push(rect(w * 0.15, -mantel - 50, w * 0.85, -h))
      return prims
    }
    const m = Math.min(150, w * 0.15)
    const sill = Math.min(CASSETTE_SILL, h / 3)
    const top = Math.min(sill + CASSETTE_HEIGHT, h * 0.8)
    const frame = Math.min(CASSETTE_FRAME, (top - sill) / 4, (w - 2 * m) / 4)
    return [rect(0, 0, w, -h), rect(m, -sill, w - m, -top), rect(m + frame, -sill - frame, w - m - frame, -top + frame, THIN)]
  },
}
