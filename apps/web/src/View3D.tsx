import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, X } from 'lucide-react'
import { buildingSolids, resolveColor, solidsBounds } from '@opencalque/core'
import { registry } from './extensions'
import { t } from './i18n'
import { useStore } from './store'
import { useTheme } from './theme'
import { useWindows } from './windows'
import { Viewer, type Colours, type Projection } from './three/viewer'
import { FOV, fitted, orbitOf, panned, turned, zoomed, type Box, type Orbit, type ViewName } from './three/orbit'

/** The views on the toolbar, from the one turned aside to the four sides and the one straight down. */
const VIEWS: ViewName[] = ['iso', 'top', 'front', 'back', 'left', 'right']

/** What a view is called: each written out, so that every translation of it is found with the others. */
const nameOf = (view: ViewName): string =>
  view === 'iso' ? t('Isometric') : view === 'top' ? t('Plan') : view === 'front' ? t('Front') : view === 'back' ? t('Back') : view === 'left' ? t('Left') : t('Right')

const START: Orbit = { target: { x: 0, y: 0, z: 0 }, yaw: -Math.PI / 4, pitch: 0.6, distance: 20000 }

/**
 * The drawing as it stands, in three dimensions: its walls cut where its doors and windows are, its
 * slabs, columns, beams and floors, turned round by dragging and cut at a height. Read-only: the
 * plan is what is edited, and this is worked out from it each time.
 */
export function View3D() {
  const open = useWindows((s) => s.view3d)
  const doc = useStore((s) => s.doc)
  const scope = useStore((s) => s.scope)
  const { dark } = useTheme()
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const fittedFor = useRef<Box | null>(null)
  const drag = useRef<{ at: { x: number; y: number }; orbit: Orbit; pan: boolean } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [orbit, setOrbit] = useState<Orbit>(START)
  const [projection, setProjection] = useState<Projection>('perspective')
  const [wireframe, setWireframe] = useState(false)
  /** How high the drawing is cut through, or null when it is not cut. */
  const [cut, setCut] = useState<number | null>(null)

  const solids = useMemo(() => (open ? buildingSolids(doc, scope, registry) : []), [open, doc, scope])
  const box = useMemo(() => solidsBounds(solids), [solids])
  // What the drawing is made of, in the colours the drawing gives it: a shared colour is followed here.
  const colours = useMemo(() => {
    const out: Colours = {}
    for (const [id, material] of Object.entries(doc.materials ?? {})) {
      const colour = resolveColor(doc, material.fill)
      if (colour) out[id] = colour
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.materials, doc.colors])

  // The window the view is drawn in, followed as it is resized.
  useEffect(() => {
    if (!open) return
    const element = frame.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open])

  // The engine, for as long as the window is open.
  useEffect(() => {
    if (!open) return
    const element = canvas.current
    if (!element) return
    const made = new Viewer(element, useTheme.getState().dark)
    viewer.current = made
    return () => {
      made.dispose()
      viewer.current = null
    }
  }, [open])

  // The drawing, worked out again whenever it or its colours change.
  useEffect(() => {
    viewer.current?.setModel(solids, colours)
    // Says what the plan handed the view, so that a wall that is not drawn can be told from one that
    // the plan does not hold: the console line is the whole of what the view has to draw.
    console.debug('[3D]', solids.length, 'solids —', solids.map((solid) => `${solid.kind}:${solid.id}(${solid.faces.length}w)`).join(' '))
  }, [solids, colours, size.width])

  // Where the eye stands, and the two ways of looking.
  useEffect(() => {
    viewer.current?.setView(orbit, projection)
  }, [orbit, projection, size])

  useEffect(() => {
    viewer.current?.resize(size.width, size.height)
  }, [size])

  useEffect(() => {
    viewer.current?.setCut(cut)
  }, [cut])

  useEffect(() => {
    viewer.current?.setWireframe(wireframe)
  }, [wireframe])

  useEffect(() => {
    viewer.current?.setDark(dark)
  }, [dark])

  // Every time the drawing changes, it is put in the window as a whole.
  useEffect(() => {
    if (!box || size.width === 0) return
    if (fittedFor.current === box) return
    fittedFor.current = box
    setOrbit(fitted(box, FOV, size.width / size.height))
  }, [box, size.width, size.height])

  if (!open) return null
  const close = () => useWindows.setState({ view3d: false })
  const fit = () => box && setOrbit(fitted(box, FOV, size.width / Math.max(1, size.height), orbit.yaw, orbit.pitch))
  const to = (name: ViewName) => {
    if (!box) return
    setOrbit(orbitOf(name, { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 }, orbit.distance))
  }
  const high = Math.ceil((box?.max.z ?? 3000) / 100) * 100

  return (
    <div className="axo-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="axo-window" role="dialog" aria-label={t('3D view')} onPointerDown={(e) => e.stopPropagation()}>
        <header className="axo-bar">
          <strong>{t('3D view')}</strong>
          <span className="axo-hint">{t('Drag to turn it, drag with the right button to move it, and roll the wheel to draw nearer')}</span>
          {VIEWS.map((view) => (
            <button key={view} className="axo-text" title={nameOf(view)} onClick={() => to(view)}>
              {nameOf(view)}
            </button>
          ))}
          <button title={t('Fit the view')} onClick={fit}>
            <Maximize size={14} />
          </button>
          <button className="axo-text" title={t('Perspective or orthographic')} onClick={() => setProjection(projection === 'perspective' ? 'orthographic' : 'perspective')}>
            {projection === 'perspective' ? t('Perspective') : t('Orthographic')}
          </button>
          <button className="axo-text" title={t('The drawing as lines only')} onClick={() => setWireframe(!wireframe)} aria-pressed={wireframe}>
            {t('Wireframe')}
          </button>
          <label className="axo-cut" title={t('Cut the drawing through at a height, as a plan cuts it')}>
            {t('Cut at')}
            <input
              type="range"
              min={0}
              max={high}
              step={100}
              value={cut ?? high}
              onChange={(e) => setCut(Number(e.currentTarget.value) >= high ? null : Number(e.currentTarget.value))}
            />
            <span>{cut === null ? t('all') : `${Math.round(cut)}`}</span>
          </label>
          <button title={t('Close')} onClick={close}>
            <X size={15} />
          </button>
        </header>
        <div className="axo-frame" ref={frame}>
          <canvas
            ref={canvas}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={(e) => setOrbit(zoomed(orbit, e.deltaY))}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { at: { x: e.clientX, y: e.clientY }, orbit, pan: e.button !== 0 }
            }}
            onPointerMove={(e) => {
              const start = drag.current
              if (!start) return
              const [dx, dy] = [e.clientX - start.at.x, e.clientY - start.at.y]
              setOrbit(start.pan ? panned(start.orbit, dx, dy, size.height, FOV) : turned(start.orbit, dx, dy))
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          />
        </div>
      </div>
    </div>
  )
}
