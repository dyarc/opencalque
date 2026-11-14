import { arcPoints, type ParametricKind, type Primitive } from '@opencalque/core'
import { atLeast, clamp, count, curveLine, curveOutline, curvePoint, HEAVY, HEIGHT, line, LOOSE_WALL, mirrorAcross, mirrorAlong, OTHER_SIDE, outline, pt, THIN, WIDTH } from './shared'

/* Doors and windows: openings that cut the wall they are placed on, drawn along +X, the wall's line, and told its thickness. */

export const door: ParametricKind = {
  kind: 'arch.door',
  category: 'architecture',
  label: 'Door',
  description: 'Place it on a wall: it cuts the opening and follows the wall. Off a wall it stands alone.',
  params: [
    WIDTH,
    HEIGHT(2040),
    { key: 'type', label: 'Type', type: 'string', default: 'Single', options: ['Single', 'Double', 'Sliding', 'Opening only'] },
    { key: 'shape', label: 'Shape', type: 'string', default: 'Straight', options: ['Straight', 'Curved'] },
    { key: 'bow', label: 'Bow', type: 'number', default: 120, unit: 'length' },
    { key: 'hinge', label: 'Hinge', type: 'string', default: 'Left', options: ['Left', 'Right'] },
    { key: 'angle', label: 'Open angle', type: 'number', default: 90, unit: 'angle' },
    OTHER_SIDE,
  ],
  opening: ({ width }) => ({ from: 0, to: atLeast(1, width) }),
  size: { x: 'width' },
  build({ width, type, hinge, angle, flip, shape, bow }, env) {
    const w = atLeast(1, width)
    const h = (env.wallThickness ?? LOOSE_WALL) / 2
    const curve = shape === 'Curved' ? env.wallCurve ?? curveOf(w, bow) : undefined
    const open = clamp(angle, 5, 180)
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
    else if (type === 'Sliding') {
      const offset = h * 0.3
      prims.push(curveLine(0, w * 0.55, -offset, curve, HEAVY), curveLine(w * 0.45, w, offset, curve, HEAVY))
    }
    if (hinge === 'Right') prims = mirrorAlong(prims, w)
    return flip ? mirrorAcross(prims) : prims
  },
  // Seen from in front: its frame from the floor to its height, the leaves, and a handle on the side that opens.
  front({ width, height, type, hinge }) {
    const w = atLeast(1, width)
    const top = -atLeast(1, height)
    const prims: Primitive[] = [outline([pt(0, 0), pt(w, 0), pt(w, top), pt(0, top)])]
    if (type === 'Double' || type === 'Sliding') prims.push(line([pt(w / 2, 0), pt(w / 2, top)], THIN))
    const handle = (x: number, toward: 1 | -1) => line([pt(x, -1000), pt(x + toward * 100, -1000)], HEAVY)
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
  sill: 'sillHeight',
  build({ width, panes, glazing, sill, flip, shape, bow }, env) {
    const w = atLeast(1, width)
    const h = (env.wallThickness ?? LOOSE_WALL) / 2
    const curve = shape === 'Curved' ? env.wallCurve ?? curveOf(w, bow) : undefined
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
  params: door.params.map((param) => (param.key === 'shape' ? { ...param, default: 'Curved' } : param)),
}

/** The same window, following a curved wall by default. */
export const curvedWindow: ParametricKind = {
  ...windowKind,
  kind: 'arch.window.curved',
  label: 'Curved window',
  params: windowKind.params.map((param) => (param.key === 'shape' ? { ...param, default: 'Curved' } : param)),
}


/** A curve of a chosen bow when an opening is not in a curved wall: the sagitta sets the radius. */
function curveOf(width: number, bow: unknown): { radius: number; half: number; side: 1 } | undefined {
  const b = Number(bow)
  const half = atLeast(1, width) / 2
  if (!Number.isFinite(b) || b <= 0) return undefined
  return { radius: (half * half + b * b) / (2 * b), half, side: 1 }
}
