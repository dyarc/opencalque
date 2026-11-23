/*
 * Where the eye of the 3D view stands, and where it looks: a point of the drawing's space (millimetres,
 * z up from the floor) that it turns around, the way it is turned, and how far off it is. No engine
 * is needed to work any of this out, so it is tried on its own (`orbit.test.ts`).
 */

/** A point of the drawing's space: x and y on the plan, z up from the floor, in millimetres. */
export interface Point {
  x: number
  y: number
  z: number
}

/** A box around something, in the drawing's space. */
export interface Box {
  min: Point
  max: Point
}

/** The views of the toolbar: straight down, from each side, and the usual turned one. */
export type ViewName = 'iso' | 'top' | 'front' | 'back' | 'left' | 'right'

/** Where the eye stands and what it looks at. */
export interface Orbit {
  /** The middle of what is looked at. */
  target: Point
  /** How far round the vertical the eye has gone, in radians: an eye on the +X side is 0. */
  yaw: number
  /** How high above the floor the eye is, in radians: 0 is level with the target, π/2 straight above it. */
  pitch: number
  /** How far the eye is from the target, in millimetres. */
  distance: number
}

/** The angle the view takes in, as a lens would: 45°, in radians. */
export const FOV = (45 * Math.PI) / 180

/** How near the top the eye may go: looking straight down leaves nothing to say which way is up. */
const LEVEL = Math.PI / 2 - 1e-6

/** How much room is left around what is fitted, so that it does not touch the edges of the window. */
const ROOM = 1.15

export const clampPitch = (pitch: number): number => Math.max(-LEVEL, Math.min(LEVEL, pitch))

/** How far the eye may go: not through what it looks at, and not out of sight of it. */
export const clampDistance = (distance: number): number => Math.max(200, Math.min(200000, distance))

/** Where the eye stands: `distance` off the target, turned `yaw` round it and `pitch` above it. */
export function eyeOf(orbit: Orbit): Point {
  const level = Math.cos(orbit.pitch) * orbit.distance
  return {
    x: orbit.target.x + level * Math.cos(orbit.yaw),
    y: orbit.target.y + level * Math.sin(orbit.yaw),
    z: orbit.target.z + Math.sin(orbit.pitch) * orbit.distance,
  }
}

/** The eye of one of the views, at `distance` from `target`. */
export function orbitOf(name: ViewName, target: Point, distance: number): Orbit {
  // An eye on the -Y side looks north, which is the front of a plan.
  const turn: Record<ViewName, [number, number]> = {
    iso: [-Math.PI / 4, 0.6],
    top: [-Math.PI / 2, LEVEL],
    front: [-Math.PI / 2, 0],
    back: [Math.PI / 2, 0],
    right: [0, 0],
    left: [Math.PI, 0],
  }
  const [yaw, pitch] = turn[name]
  return { target, yaw, pitch, distance }
}

/** The eye turned about the target by however far the pointer was dragged across the window. */
export function turned(orbit: Orbit, dx: number, dy: number): Orbit {
  // A quarter of the window across is a quarter turn, whatever the window is.
  return { ...orbit, yaw: orbit.yaw - dx * 0.0075, pitch: clampPitch(orbit.pitch + dy * 0.0075) }
}

/** The eye moved across the window, as the drawing follows the pointer: what it looked at goes the other way. */
export function panned(orbit: Orbit, dx: number, dy: number, height: number, fov: number): Orbit {
  const perPixel = (2 * Math.tan(fov / 2) * orbit.distance) / Math.max(1, height)
  const [right, up] = acrossOf(orbit)
  const target = {
    x: orbit.target.x - right.x * dx * perPixel + up.x * dy * perPixel,
    y: orbit.target.y - right.y * dx * perPixel + up.y * dy * perPixel,
    z: orbit.target.z - right.z * dx * perPixel + up.z * dy * perPixel,
  }
  return { ...orbit, target }
}

/** The eye nearer to what it looks at, as the wheel rolls. */
export function zoomed(orbit: Orbit, delta: number): Orbit {
  return { ...orbit, distance: clampDistance(orbit.distance * Math.exp(delta * 0.0015)) }
}

/** The two ways across the window where the eye stands: to the right and up, as the drawing sees them. */
export function acrossOf(orbit: Orbit): [Point, Point] {
  const away = unit({ x: Math.cos(orbit.yaw) * Math.cos(orbit.pitch), y: Math.sin(orbit.yaw) * Math.cos(orbit.pitch), z: Math.sin(orbit.pitch) })
  const right = unit(cross({ x: 0, y: 0, z: 1 }, away))
  return [right, cross(away, right)]
}

/** An eye far enough off to take all of `box` in, and turned `yaw` and `pitch` as asked. */
export function fitted(box: Box, fov: number, aspect: number, yaw = -Math.PI / 4, pitch = 0.6): Orbit {
  const target = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 }
  // However wide the window is, the box has to fit across it and up it: the narrower of the two decides.
  const across = Math.max(1, box.max.x - box.min.x)
  const deep = Math.max(1, box.max.y - box.min.y)
  const high = Math.max(1, box.max.z - box.min.z)
  const half = Math.hypot(across, deep, high) / 2
  const narrow = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * Math.max(0.2, aspect)))
  return { target, yaw, pitch, distance: clampDistance((half / Math.sin(narrow / 2)) * ROOM) }
}

const cross = (a: Point, b: Point): Point => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })

function unit(a: Point): Point {
  const length = Math.hypot(a.x, a.y, a.z) || 1
  return { x: a.x / length, y: a.y / length, z: a.z / length }
}
