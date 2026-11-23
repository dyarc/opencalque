import { arcPoints, type BuildEnv, type ParametricKind, type Primitive, type Vec2 } from '@opencalque/core'
import { atLeast, clamp, count, curveLine, curveOutline, curvePoint, HEAVY, HEIGHT, line, LOOSE_WALL, mirrorAcross, mirrorAlong, OTHER_SIDE, outline, pt, THIN, WIDTH } from './shared'

/* Doors and windows: openings that cut the wall they are placed on, drawn along +X, the wall's line, and told its thickness. */

/**
 * How the door and the window are bowed: their Shape says whether they are, and the two handles
 * that set it sit on the two lines they draw, half the wall to either side of their own middle,
 * so that dragging one drags that line.
 */
const BOW = {
  shapeKey: 'shape',
  curved: 'Curved',
  bowKey: 'bow',
  points(props: Record<string, any>, env: BuildEnv): [Vec2, Vec2] {
    const w = atLeast(1, props.width)
    const h = (env.wallThickness ?? LOOSE_WALL) / 2
    const curve = curveOf(w, props.bow)
    return [curvePoint(w / 2, -h, curve), curvePoint(w / 2, h, curve)]
  },
  drag(props: Record<string, any>, index: number, p: Vec2, env: BuildEnv): Record<string, unknown> {
    const h = (env.wallThickness ?? LOOSE_WALL) / 2
    // The line a handle is on stands half the wall to one side of the bow's own middle: what
    // is left of the pointer once that half is taken off is the bow.
    return { bow: Math.round((p.y + (index === 0 ? h : -h)) * 1000) / 1000 }
  },
}

/*
 * The kinds of door. Hinged: 'Single', 'Double'. Sliding: 'Sliding on wall', a leaf hung in front
 * of the wall's +Y face that slides along it; 'Double sliding on wall', two that part; 'Pocket', a
 * leaf that slides into the wall; and 'Sliding', the glazed door of an outside wall, its leaves on
 * rails in its frame (the only sliding door before, and what the value still means).
 */
const HINGED = ['Single', 'Double']
/** Those that slide one way, which `slide` says. */
const ONE_WAY = ['Sliding on wall', 'Pocket']
/** How far a hung leaf stands in front of the face: its inner and outer lines, in mm. */
const HUNG = [10, 50]
/** A dash for what shows where something goes rather than where it is. */
const OPEN = [40, 25]

/** A rectangle, dashed when it shows where something goes rather than where it is. */
const box = (x0: number, y0: number, x1: number, y1: number, dash?: number[]): Primitive => ({
  kind: 'path',
  points: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)],
  closed: true,
  ...(dash ? { dash, ...THIN } : {}),
})

/** An arrow along +X from `x0` to `x1`, at `y`. */
const arrow = (x0: number, x1: number, y: number): Primitive[] => {
  const head = Math.min(60, Math.abs(x1 - x0) / 3) * Math.sign(x1 - x0)
  return [line([pt(x0, y), pt(x1, y)], THIN), line([pt(x1 - head, y - Math.abs(head) / 2), pt(x1, y), pt(x1 - head, y + Math.abs(head) / 2)], THIN)]
}

export const door: ParametricKind = {
  kind: 'arch.door',
  category: 'architecture',
  label: 'Door',
  description: 'Place it on a wall: it cuts the opening and follows the wall. Off a wall it stands alone.',
  params: [
    WIDTH,
    HEIGHT(2040),
    // A door can start above the floor, as a window does: a raised threshold, or room under it for a floor's finish.
    { key: 'sillHeight', label: 'Sill height', type: 'number', default: 0, unit: 'length' },
    { key: 'type', label: 'Type', type: 'string', default: 'Single', options: ['Single', 'Double', 'Sliding on wall', 'Double sliding on wall', 'Pocket', 'Sliding', 'Opening only'] },
    { key: 'shape', label: 'Shape', type: 'string', default: 'Straight', options: ['Straight', 'Curved'] },
    { key: 'bow', label: 'Bow', type: 'number', default: 120, unit: 'length' },
    // A door shows only what means something for its type: a hinge and an open angle for a hinged
    // one, and which way a sliding one slides.
    { key: 'hinge', label: 'Hinge', type: 'string', default: 'Left', options: ['Left', 'Right'], shown: ({ type }) => type === 'Single' },
    { key: 'angle', label: 'Open angle', type: 'number', default: 90, unit: 'angle', shown: ({ type }) => HINGED.includes(type) },
    { key: 'slide', label: 'Slides to', type: 'string', default: 'Right', options: ['Left', 'Right'], shown: ({ type }) => ONE_WAY.includes(type) },
    OTHER_SIDE,
  ],
  opening: ({ width }) => ({ from: 0, to: atLeast(1, width) }),
  size: { x: 'width' },
  bow: BOW,
  sill: 'sillHeight',
  build({ width, type, hinge, angle, slide, flip, shape, bow }, env) {
    const w = atLeast(1, width)
    const h = (env.wallThickness ?? LOOSE_WALL) / 2
    // In a curved wall it is curved by the wall; off one, by its own shape and bow.
    const curve = env.wallCurve ?? (shape === 'Curved' ? curveOf(w, bow) : undefined)
    const open = clamp(angle, 5, 180)
    // A leaf hung in front of the +Y face over `x0`-`x1`, a little wider than what it closes, drawn
    // shut, then dashed where it slides to (by `by`), an arrow saying which way.
    const hung = (x0: number, x1: number, by: number): Primitive[] => {
      const over = Math.min(50, w / 10)
      const [a, b] = [x0 === 0 ? -over : x0, x1 === w ? w + over : x1]
      const [near, far] = [h + HUNG[0], h + HUNG[1]]
      const mid = (a + b) / 2
      return [box(a, near, b, far), box(a + by, near, b + by, far, OPEN), ...arrow(mid, mid + by * 0.6, far + 60)]
    }
    // A leaf hinged on the +Y face. `dir` is +1 when it closes towards +X, -1 towards -X.
    const leaf = (hingeX: number, length: number, dir: 1 | -1): Primitive[] => {
      const hingePoint = curvePoint(hingeX, h, curve)
      const closed = dir === 1 ? 0 : 180
      const opened = closed + dir * open
      const tip = arcPoints(hingePoint, length, opened, opened, 1)[0]
      if (!curve) return [line([hingePoint, tip], HEAVY), line(arcPoints(hingePoint, length, closed, opened), THIN)]
      // A curved leaf keeps a bow of its own as it swings: a quadratic from the hinge to the tip,
      // bent by the wall's curvature, beside the arc it sweeps.
      const sag = curve.radius - Math.sqrt(Math.max(0, curve.radius * curve.radius - (length / 2) ** 2))
      const mid = { x: (hingePoint.x + tip.x) / 2, y: (hingePoint.y + tip.y) / 2 }
      const side = { x: -(tip.y - hingePoint.y), y: tip.x - hingePoint.x }
      const size = Math.hypot(side.x, side.y) || 1
      const bow = { x: mid.x + (side.x / size) * sag * curve.side * 0.55, y: mid.y + (side.y / size) * sag * curve.side * 0.55 }
      const steps = 12
      const curvedLeaf = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps
        const u = 1 - t
        return { x: u * u * hingePoint.x + 2 * u * t * bow.x + t * t * tip.x, y: u * u * hingePoint.y + 2 * u * t * bow.y + t * t * tip.y }
      })
      return [line(curvedLeaf, HEAVY), line(arcPoints(hingePoint, length, closed, opened), THIN)]
    }
    let prims: Primitive[] = [curveLine(0, w, -h, curve, THIN), curveLine(0, w, h, curve, THIN)]
    if (type === 'Single') prims.push(...leaf(0, w, 1))
    else if (type === 'Double') prims.push(...leaf(0, w / 2, 1), ...leaf(w, w / 2, -1))
    else if (type === 'Sliding on wall') prims.push(...hung(0, w, w))
    else if (type === 'Double sliding on wall') prims.push(...hung(0, w / 2, -w / 2), ...hung(w / 2, w, w / 2))
    else if (type === 'Pocket') {
      // In the middle of the wall: shut across the opening, and dashed in the wall where it goes.
      const t = Math.min(20, h / 2)
      prims.push(box(0, -t, w, t), box(w, -t, 2 * w, t, OPEN), ...arrow(w * 0.3, w * 0.7, h + 60))
    } else if (type === 'Sliding') {
      const offset = h * 0.3
      prims.push(curveLine(0, w * 0.55, -offset, curve, HEAVY), curveLine(w * 0.45, w, offset, curve, HEAVY))
    }
    if (type === 'Single' && hinge === 'Right') prims = mirrorAlong(prims, w)
    if (ONE_WAY.includes(type) && slide === 'Left') prims = mirrorAlong(prims, w)
    return flip ? mirrorAcross(prims) : prims
  },
  // Seen from in front: its frame from its sill (the floor, unless it is raised) to its height, the
  // leaves, and a handle on the side that opens.
  front({ width, height, type, hinge, sillHeight }) {
    const w = atLeast(1, width)
    const bottom = -Math.max(0, Number(sillHeight) || 0) || 0
    const top = bottom - atLeast(1, height)
    const prims: Primitive[] = [outline([pt(0, bottom), pt(w, bottom), pt(w, top), pt(0, top)])]
    if (type === 'Double' || type === 'Double sliding on wall' || type === 'Sliding') prims.push(line([pt(w / 2, bottom), pt(w / 2, top)], THIN))
    const handle = (x: number, toward: 1 | -1) => line([pt(x, bottom - 1000), pt(x + toward * 100, bottom - 1000)], HEAVY)
    if (type === 'Single') prims.push(hinge === 'Right' ? handle(80, 1) : handle(w - 80, -1))
    else if (type === 'Double') prims.push(handle(w / 2 - 80, -1), handle(w / 2 + 80, 1))
    return prims
  },
}

export const windowKind: ParametricKind = {
  kind: 'arch.window',
  category: 'architecture',
  label: 'Window',
  description: 'Place it on a wall: it cuts the opening and follows the wall. The sill marks the outside.',
  params: [
    { ...WIDTH, default: 1200 },
    { key: 'shape', label: 'Shape', type: 'string', default: 'Straight', options: ['Straight', 'Curved'] },
    { key: 'bow', label: 'Bow', type: 'number', default: 120, unit: 'length' },
    { key: 'panes', label: 'Panes', type: 'number', default: 2 },
    { key: 'glazing', label: 'Glazing', type: 'string', default: 'Double', options: ['Single', 'Double', 'Triple'] },
    HEIGHT(1250),
    { key: 'sill', label: 'Sill depth', type: 'number', default: 50, unit: 'length' },
    { key: 'sillHeight', label: 'Sill height', type: 'number', default: 900, unit: 'length' },
    OTHER_SIDE,
  ],
  opening: ({ width }) => ({ from: 0, to: atLeast(1, width) }),
  size: { x: 'width' },
  bow: BOW,
  sill: 'sillHeight',
  build({ width, panes, glazing, sill, flip, shape, bow }, env) {
    const w = atLeast(1, width)
    const h = (env.wallThickness ?? LOOSE_WALL) / 2
    // In a curved wall it is curved by the wall; off one, by its own shape and bow.
    const curve = env.wallCurve ?? (shape === 'Curved' ? curveOf(w, bow) : undefined)
    const frame = Math.min(50, w / 4)
    // A line for each pane of glass, evenly across the middle of the wall.
    const gap = Math.min(h * 0.3, 25)
    const glass = glazing === 'Triple' ? [-gap, 0, gap] : glazing === 'Double' ? [-gap, gap] : [0]
    const n = count(panes)
    const prims: Primitive[] = [
      curveLine(0, w, -h, curve),
      curveLine(0, w, h, curve),
      line([curvePoint(frame, -h, curve), curvePoint(frame, h, curve)], THIN),
      line([curvePoint(w - frame, -h, curve), curvePoint(w - frame, h, curve)], THIN),
      ...glass.map((y) => curveLine(frame, w - frame, y, curve, THIN)),
    ]
    for (let i = 1; i < n; i++) {
      const x = frame + ((w - 2 * frame) * i) / n
      prims.push(line([curvePoint(x, -h, curve), curvePoint(x, h, curve)], THIN))
    }
    if (sill > 0) prims.push(curveOutline(-30, w + 30, -h, -h - sill, curve, THIN))
    return flip ? mirrorAcross(prims) : prims
  },
  // Seen from in front: from its sill height up, its frame, and a line between each pane.
  front({ width, height, panes, sillHeight }) {
    const w = atLeast(1, width)
    const bottom = -Math.max(0, Number(sillHeight) || 0) || 0
    const top = bottom - atLeast(1, height)
    const frame = Math.min(50, w / 4)
    const prims: Primitive[] = [outline([pt(0, bottom), pt(w, bottom), pt(w, top), pt(0, top)]), outline([pt(frame, bottom - frame), pt(w - frame, bottom - frame), pt(w - frame, top + frame), pt(frame, top + frame)], THIN)]
    const n = count(panes)
    for (let i = 1; i < n; i++) {
      const x = frame + ((w - 2 * frame) * i) / n
      prims.push(line([pt(x, bottom - frame), pt(x, top + frame)], THIN))
    }
    return prims
  },
}

/** The same door, starting as a curved leaf: the shape can still be changed in Properties. */
export const curvedDoor: ParametricKind = {
  ...door,
  kind: 'arch.door.curved',
  label: 'Curved door',
  hidden: true,
  params: door.params.map((param) => (param.key === 'shape' ? { ...param, default: 'Curved' } : param)),
}

/** The same window, following a curved wall by default. */
export const curvedWindow: ParametricKind = {
  ...windowKind,
  kind: 'arch.window.curved',
  label: 'Curved window',
  hidden: true,
  params: windowKind.params.map((param) => (param.key === 'shape' ? { ...param, default: 'Curved' } : param)),
}


/** A curve of a chosen bow when an opening is not in a curved wall: the sagitta sets the radius. */
function curveOf(width: number, bow: unknown): { radius: number; half: number; side: 1 | -1 } | undefined {
  const b = Number(bow)
  const half = atLeast(1, width) / 2
  // How far the middle of the opening stands out of its own line, on the side the sign says.
  if (!Number.isFinite(b) || b === 0) return undefined
  const sag = Math.abs(b)
  return { radius: (half * half + sag * sag) / (2 * sag), half, side: b > 0 ? 1 : -1 }
}
