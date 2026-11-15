/*
 * The pointers of the drawing area, drawn here rather than taken from the system: a small set of
 * SVGs that say what the canvas does where the pointer is. Each is handed to CSS as a data URI
 * with its hot spot and a keyword of the same meaning to fall back on.
 *
 * What it costs: nothing that matters. A cursor is painted by the browser and the window system,
 * not by our canvas; each image is decoded once and kept, and this module makes each `url(...)`
 * string once (the map at the end is filled on demand and kept). What is left is a style change
 * when the pointer's meaning changes — not on every frame or every pointer move. The one rule is
 * to keep them small and still: a big or animated cursor is what gets expensive.
 */

/** One pointer: the drawing, and the point in it that is where the pointer itself is (its hot spot). */
interface Pointer {
  /** Drawn twice, in whatever colours it is given: once wide and white underneath, so it reads on any ground. */
  draw: (ink: string, paper: string, width: number) => string
  x: number
  y: number
  /** What to show if this browser will not take the image: the keyword it stands for. */
  fallback: string
}

const INK = '#1a1d23'
const PAPER = '#ffffff'
/** How large a pointer is on screen, in pixels: small enough to be precise, large enough to read. */
const SIZE = 20

/** The drawing of one pointer, in a box of 24 × 24: a white copy of it, wide, under the dark one. */
const svg = ({ draw }: Pointer, halo = true): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">${halo ? draw(PAPER, PAPER, 4.2) : ''}${draw(INK, PAPER, 1.4)}</svg>`

/** A filled arrow, its tip at the first point of its path. */
const arrow =
  (points: string) =>
  (ink: string, paper: string, width: number): string =>
    `<path d="${points}" fill="${paper}" stroke="${ink}" stroke-width="${width}" stroke-linejoin="round"/>`

/** A line drawing: nothing filled, the paper only showing where a shape closes. */
const line =
  (points: string) =>
  (ink: string, paper: string, width: number): string =>
    `<path d="${points}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`

/** The several parts of a line drawing, drawn as one. */
const lines =
  (...parts: string[]) =>
  (ink: string, paper: string, width: number): string =>
    parts.map((d) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`).join('')

/** A hand, open or closed, its palm at the hot spot. */
const hand =
  (points: string) =>
  (ink: string, paper: string, width: number): string =>
    `<path d="${points}" fill="${paper}" stroke="${ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`

const HAND = 'M9 13V6.6a1.6 1.6 0 0 1 3.2 0V12m0-5.6a1.6 1.6 0 0 1 3.2 0V12m0-4.4a1.6 1.6 0 0 1 3.2 0V14c0 4-2.4 6.6-6.2 6.6h-1.2c-1.6 0-2.8-.7-3.7-2l-2.6-3.7a1.5 1.5 0 0 1 2.4-1.9L9 14.5'
const FIST = 'M8.2 20.6v-2.8l-1.7-2.5a1.5 1.5 0 0 1 2.5-1.7L10 15V8.6a1.6 1.6 0 0 1 3.2 0V13m0-2.4a1.6 1.6 0 0 1 3.2 0V13m0-1.2a1.6 1.6 0 0 1 3.2 0V14c0 4-2.4 6.6-6.2 6.6h-1.2c-1.6 0-2.8-.7-3.7-2'

const POINTERS: Record<string, Pointer> = {
  // The selection pointer: the tip of its arrow is where the click is.
  default: { draw: arrow('M3.5 2.5 3.5 19 7.8 14.9 10.3 20.8 13.1 19.4 10.7 13.7 16 13.7Z'), x: 3, y: 2, fallback: 'default' },
  // What a tool that draws shows: a cross whose middle is the point.
  crosshair: { draw: lines('M12 2.5v6.5', 'M12 15v6.5', 'M2.5 12H9', 'M15 12h6.5'), x: 12, y: 12, fallback: 'crosshair' },
  // Dragging the view about.
  grab: { draw: hand(HAND), x: 12, y: 11, fallback: 'grab' },
  grabbing: { draw: hand(FIST), x: 12, y: 11, fallback: 'grabbing' },
  // Moving something: four ways out of the middle.
  move: {
    draw: (ink, paper, width) =>
      `<g stroke="${ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.5 15.2 6.2H8.8Z" fill="${paper}"/><path d="M12 21.5 8.8 17.8h6.4Z" fill="${paper}"/><path d="M2.5 12 6.2 8.8v6.4Z" fill="${paper}"/><path d="M21.5 12 17.8 15.2V8.8Z" fill="${paper}"/><path d="M12 5.6v12.8M5.6 12h12.8" fill="none"/></g>`,
    x: 12,
    y: 12,
    fallback: 'move',
  },
  // Copying while moving: the arrow with a plus of its own.
  copy: {
    draw: (ink, paper, width) =>
      `${arrow('M3.5 2.5 3.5 18 7.6 14.1 10 19.6 12.6 18.3 10.3 13 15.2 13Z')(ink, paper, width)}<g fill="${paper}" stroke="${ink}" stroke-width="${width}" stroke-linecap="round"><circle cx="18.4" cy="18.4" r="4.4"/><path d="M18.4 16v4.8M16 18.4h4.8" stroke-width="1.5"/></g>`,
    x: 3,
    y: 2,
    fallback: 'copy',
  },
  // Pointing at something a click answers (a temporary dimension's length).
  pointer: { draw: arrow('M8 3.5 8 15 10.8 12.6 12.4 16.4 14.3 15.6 12.7 11.9 16.6 11.9Z'), x: 8, y: 4, fallback: 'pointer' },
  // The sides and corners of a box, each way it can be pulled.
  'nwse-resize': { draw: lines('M6.5 6.5 17.5 17.5M6.5 6.5h4M6.5 6.5v4M17.5 17.5h-4M17.5 17.5v-4'), x: 12, y: 12, fallback: 'nwse-resize' },
  'nesw-resize': { draw: lines('M17.5 6.5 6.5 17.5M17.5 6.5h-4M17.5 6.5v4M6.5 17.5h4M6.5 17.5v-4'), x: 12, y: 12, fallback: 'nesw-resize' },
  'ns-resize': { draw: lines('M12 4v16M12 4 9 7.2M12 4l3 3.2M12 20l-3-3.2M12 20l3-3.2'), x: 12, y: 12, fallback: 'ns-resize' },
  'ew-resize': { draw: lines('M4 12h16M4 12l3.2-3M4 12l3.2 3M20 12l-3.2-3M20 12l-3.2 3'), x: 12, y: 12, fallback: 'ew-resize' },
  // The format painter: a brush once it holds an object's look, an eyedropper before that. Both
  // stand upright, the point that does the work at their foot, and are shaped apart: a wide head
  // against a thin tube and a bulb, so that the two halves of the work read at once.
  brush: {
    draw: (ink, paper, width) =>
      `<g fill="${paper}" stroke="${ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.4v8.8" stroke-width="${Math.max(2.4, width)}" fill="none"/><rect x="9" y="11.2" width="6" height="2.8" rx="0.8"/><path d="M9.4 14h5.2l1.4 5.4H8z"/><path d="M10.6 14.8v4M12 14.8v4.4M13.4 14.8v4" fill="none" stroke-width="0.8"/></g>`,
    x: 12,
    y: 20,
    fallback: 'copy',
  },
  eyedropper: {
    draw: (ink, paper, width) =>
      `<g stroke="${ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="6.2" r="3.3" fill="${paper}"/><path d="M10.4 9.2h3.2v6.2h-3.2z" fill="${paper}"/><path d="M10.4 15.4h3.2L12 21z" fill="${paper}"/><path d="M10.4 12.2h3.2" fill="none" stroke-width="0.9"/></g>`,
    x: 12,
    y: 21,
    fallback: 'crosshair',
  },
}

/** Each pointer as CSS takes it, made once: the image, where its hot spot is, and the keyword to fall back on. */
const CSS = new Map<string, string>()

export function pointer(name: string | null | undefined): string {
  const key = name && POINTERS[name] ? name : 'default'
  let css = CSS.get(key)
  if (css === undefined) {
    const one = POINTERS[key]
    // The hot spot is given in the drawing's own 24 × 24, and the picture is drawn at SIZE.
    const at = (v: number) => Math.round((v * SIZE * 10) / 24) / 10
    css = `url("data:image/svg+xml,${encodeURIComponent(svg(one))}") ${at(one.x)} ${at(one.y)}, ${one.fallback}`
    CSS.set(key, css)
  }
  return css
}

/** Every pointer there is, by name, for a page that shows them (the guide, or a test). */
export const POINTER_NAMES = Object.keys(POINTERS)

/** The drawing of a pointer as a picture, for showing it where no pointer can be (a screenshot). */
export const pointerImage = (name: string): string => svg(POINTERS[name] ?? POINTERS.default)
