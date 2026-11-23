import { roundCorners, type ParametricKind, type Primitive } from '@opencalque/core'
import { drawer, rect } from './fronts'
import { atLeast, clamp, DEPTH, line, mirrorAlong, outline, pt, roundBox, sizedBox, THIN, WIDTH } from './shared'

/** What a corner sofa's frame takes behind its seats and at the end of each side, in mm. */
const SOFA_BACK = 170
const SOFA_ARM = 170
/** About how wide a seat of a corner sofa is: each side takes as many as its length holds. */
const SOFA_SEAT = 650

/** The sizes a corner sofa is drawn at: deep enough to sit on, each side long enough for a seat beyond the corner. */
function cornerSofaSize({ length, returnLength, depth }: Record<string, any>) {
  const d = clamp(depth, 2 * SOFA_BACK + 200, 1500)
  const least = d + SOFA_ARM + 300
  return { l: atLeast(least, length), r: atLeast(least, returnLength), d, least }
}

/**
 * A corner sofa, its backs along the top and down one side, the left or the right: a frame round
 * its backs and the arms at its two ends, back cushions along both backs, a seat in the corner and
 * along each side as many seats as it holds.
 */
export const cornerSofa: ParametricKind = {
  kind: 'arch.sofa.corner',
  label: 'Corner sofa',
  category: 'living',
  description: 'Its backs go against two walls. Pull its sides to make it longer: each side takes a seat for about every 65 cm.',
  params: [
    { key: 'length', label: 'Length', type: 'number', default: 2600, unit: 'length' },
    { key: 'returnLength', label: 'Return length', type: 'number', default: 1800, unit: 'length' },
    DEPTH(900),
    { key: 'corner', label: 'Corner', type: 'string', default: 'Left', options: ['Left', 'Right'] },
  ],
  box: {
    bounds: (props) => {
      const { l, r } = cornerSofaSize(props)
      return { left: 0, top: 0, right: l, bottom: r }
    },
    resize: (props, size) => {
      const { least } = cornerSofaSize(props)
      return {
        ...(size.width === undefined ? {} : { length: Math.round(atLeast(least, size.width)) }),
        ...(size.height === undefined ? {} : { returnLength: Math.round(atLeast(least, size.height)) }),
      }
    },
  },
  build(props) {
    const { l, r, d } = cornerSofaSize(props)
    const [back, arm] = [SOFA_BACK, SOFA_ARM]
    // Drawn with the corner on the left, and mirrored for one on the right.
    const frame = outline(
      roundCorners(
        [pt(0, 0), pt(l, 0), pt(l, d), pt(l - arm, d), pt(l - arm, back), pt(back, back), pt(back, r - arm), pt(d, r - arm), pt(d, r), pt(0, r)],
        [60, 60, 50, 50, 10, 10, 10, 50, 50, 60],
      ),
    )
    // Each cushion fills its cell but for a gap round it.
    const cushion = (x0: number, y0: number, x1: number, y1: number, radius: number) => roundBox(x0 + 6, y0 + 6, x1 - 6, y1 - 6, radius)
    const inner = back + 172
    const along = (from: number, to: number) => {
      const n = Math.max(1, Math.round((to - from) / SOFA_SEAT))
      return Array.from({ length: n }, (_, i) => [from + ((to - from) * i) / n, from + ((to - from) * (i + 1)) / n] as const)
    }
    const top = along(d, l - arm)
    const side = along(d, r - arm)
    const prims: Primitive[] = [
      frame,
      // The backs: down the side from the corner, and along the top beyond it.
      cushion(back, back, inner, d, 40),
      ...side.map(([y0, y1]) => cushion(back, y0, inner, y1, 40)),
      cushion(inner, back, d, inner, 40),
      ...top.map(([x0, x1]) => cushion(x0, back, x1, inner, 40)),
      // The seats: in the corner, then along each side.
      cushion(inner, inner, d, d, 45),
      ...top.map(([x0, x1]) => cushion(x0, inner, x1, d, 45)),
      ...side.map(([y0, y1]) => cushion(inner, y0, d, y1, 45)),
    ]
    return props.corner === 'Right' ? mirrorAlong(prims, l) : prims
  },
}


/** How high a banquette's base is, the top of its seat, its plinth and an end panel, in mm. */
const BANQUETTE_BASE = 370
const BANQUETTE_SEAT = 450
const BANQUETTE_PLINTH = 80
const BANQUETTE_END_TOP = 650
/** About how wide a seat of a banquette is: it takes as many as its length holds. */
const BANQUETTE_PLACE = 600
/** How thick its back is, of cushions or of a panel, and an end panel, in mm. */
const BANQUETTE_BACK = { Cushions: 150, Panel: 60 } as Record<string, number>
const BANQUETTE_END = 40
/** The least it is made long and deep, in mm. */
const MIN_BANQUETTE = 600
const MIN_BANQUETTE_DEPTH = 350
/** The most places drawn: a length typed by mistake must not draw a thousand cushions. */
const MAX_PLACES = 30

/** A banquette's sizes and parts, from its parameters: what its ends and its back take, and the stretches of its places. */
function banquetteParts({ width, depth, height, back, ends }: Record<string, any>) {
  const w = atLeast(MIN_BANQUETTE, width)
  const d = atLeast(MIN_BANQUETTE_DEPTH, depth)
  const left = ends === 'Left' || ends === 'Both' ? BANQUETTE_END : 0
  const right = ends === 'Right' || ends === 'Both' ? BANQUETTE_END : 0
  const [a, b] = [left, w - right]
  const n = Math.min(MAX_PLACES, Math.max(1, Math.round((b - a) / BANQUETTE_PLACE)))
  const places = Array.from({ length: n }, (_, i) => [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n] as const)
  const thick = BANQUETTE_BACK[back] ?? 0
  const top = thick > 0 ? Math.max(BANQUETTE_SEAT + 100, Number(height) || 0) : BANQUETTE_SEAT
  return { w, d, left, right, a, b, places, thick, top }
}

/**
 * A banquette: a bench built along a wall, its back against it, as long as it is made, with a seat
 * cushion for about every 60 cm and, behind them, back cushions, a panel or nothing. Its base is
 * closed, holds a drawer under each place, or stands on legs; a panel may close either end. Seen
 * from in front and from its side, it shows all of it.
 */
export const banquette: ParametricKind = {
  kind: 'arch.banquette',
  label: 'Banquette',
  category: 'dining',
  description: 'A bench built along the wall, its back against it. Pull its sides to make it longer: it takes a seat for about every 60 cm.',
  params: [
    { ...WIDTH, label: 'Length', default: 1800 },
    DEPTH(500),
    { key: 'height', label: 'Height', type: 'number', default: 900, unit: 'length', shown: ({ back }) => back !== 'None' },
    { key: 'back', label: 'Back', type: 'string', default: 'Cushions', options: ['Cushions', 'Panel', 'None'] },
    { key: 'base', label: 'Base', type: 'string', default: 'Closed', options: ['Closed', 'Drawers', 'Legs'] },
    { key: 'ends', label: 'End panels', type: 'string', default: 'None', options: ['None', 'Left', 'Right', 'Both'] },
  ],
  box: sizedBox('width', 'depth', MIN_BANQUETTE, MIN_BANQUETTE_DEPTH),
  mount: { on: 'floor' },
  height: (props) => banquetteParts(props).top,
  build(props) {
    const { w, d, left, right, places, thick, back } = { ...banquetteParts(props), back: props.back }
    const prims: Primitive[] = [outline([pt(0, 0), pt(w, 0), pt(w, d), pt(0, d)])]
    if (left) prims.push(line([pt(left, 0), pt(left, d)]))
    if (right) prims.push(line([pt(w - right, 0), pt(w - right, d)]))
    for (const [x0, x1] of places) {
      if (back === 'Cushions') prims.push(roundBox(x0 + 6, 6, x1 - 6, thick - 6, 40))
      prims.push(roundBox(x0 + 6, thick + 6, x1 - 6, d - 8, 40))
    }
    if (back === 'Panel') prims.push(line([pt(left, thick), pt(w - right, thick)], THIN))
    return prims
  },
  front(props) {
    const { w, a, b, places, top, left, right } = banquetteParts(props)
    const prims: Primitive[] = []
    // The base, under the seat.
    if (props.base === 'Legs') {
      const rail = BANQUETTE_BASE - 70
      prims.push(rect(a, -rail, b, -BANQUETTE_BASE))
      // A leg at each end, and one about every 1.2 m between.
      const between = Math.max(0, Math.round((b - a) / 1200) - 1)
      const legs = [a + 30, ...Array.from({ length: between }, (_, i) => a + ((b - a) * (i + 1)) / (between + 1) - 20), b - 70]
      for (const x of legs) prims.push(rect(x, 0, x + 40, -rail, THIN))
    } else {
      prims.push(outline([pt(a + 50, 0), pt(b - 50, 0), pt(b - 50, -BANQUETTE_PLINTH), pt(b, -BANQUETTE_PLINTH), pt(b, -BANQUETTE_BASE), pt(a, -BANQUETTE_BASE), pt(a, -BANQUETTE_PLINTH), pt(a + 50, -BANQUETTE_PLINTH)]))
      // The plinth set back under it.
      prims.push(line([pt(a + 50, -BANQUETTE_PLINTH), pt(b - 50, -BANQUETTE_PLINTH)], THIN))
      if (props.base === 'Drawers') for (const [x0, x1] of places) prims.push(...drawer(x0 + 20, x1 - 20, -BANQUETTE_PLINTH - 30, -BANQUETTE_BASE + 30))
    }
    // The seat cushions on it, and the back over them.
    for (const [x0, x1] of places) {
      prims.push(roundBox(x0 + 4, -BANQUETTE_BASE, x1 - 4, -BANQUETTE_SEAT, 15))
      if (props.back === 'Cushions') prims.push(roundBox(x0 + 4, -BANQUETTE_SEAT - 10, x1 - 4, -top, 30))
    }
    if (props.back === 'Panel') prims.push(rect(a, -BANQUETTE_SEAT, b, -top), line([pt(a, -top + 40), pt(b, -top + 40)], THIN))
    // The end panels, from the floor.
    const end = Math.min(top, BANQUETTE_END_TOP)
    if (left) prims.push(rect(0, 0, left, -end))
    if (right) prims.push(rect(w - right, 0, w, -end))
    return prims
  },
  side(props) {
    const { d, thick, top, left, right } = banquetteParts(props)
    const prims: Primitive[] = []
    if (props.base === 'Legs') {
      const rail = BANQUETTE_BASE - 70
      prims.push(rect(0, -rail, d, -BANQUETTE_BASE), rect(30, 0, 70, -rail, THIN), rect(d - 70, 0, d - 30, -rail, THIN))
    } else prims.push(outline([pt(0, 0), pt(d - 50, 0), pt(d - 50, -BANQUETTE_PLINTH), pt(d, -BANQUETTE_PLINTH), pt(d, -BANQUETTE_BASE), pt(0, -BANQUETTE_BASE)]))
    prims.push(roundBox(thick, -BANQUETTE_BASE, d, -BANQUETTE_SEAT, 15))
    // Back cushions lean back against the wall; a panel stands upright.
    if (props.back === 'Cushions') prims.push(outline([pt(0, -BANQUETTE_SEAT), pt(thick, -BANQUETTE_SEAT), pt(thick * 0.55, -top), pt(0, -top)]))
    else if (props.back === 'Panel') prims.push(rect(0, -BANQUETTE_SEAT, thick, -top))
    // An end panel is what is seen of it from that end.
    if (left || right) prims.push(rect(0, 0, d, -Math.min(top, BANQUETTE_END_TOP), THIN))
    return prims
  },
}
