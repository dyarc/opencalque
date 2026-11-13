import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, X } from 'lucide-react'
import { axoDepth, axoProject, axonometricFaces } from '@opencalque/core'
import { registry } from './extensions'
import { t } from './i18n'
import { useStore } from './store'
import { useTheme } from './theme'
import { useWindows } from './windows'

/** The drawer of a point on the screen, in the space of the view. */
interface Camera {
  turn: number
  scale: number
  x: number
  y: number
}

const MARGIN = 36

/**
 * An axonometric view of the page: its walls as the blocks they stand as, and the floors of its
 * rooms, from one of four directions, without perspective. It is read-only — the plan is what is
 * edited, and this is worked out from it each time.
 */
export function AxonometricView() {
  const open = useWindows((s) => s.axonometric)
  const doc = useStore((s) => s.doc)
  const scope = useStore((s) => s.scope)
  const { dark } = useTheme()
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState<Camera>({ turn: 0, scale: 0.05, x: 0, y: 0 })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const drag = useRef<{ at: { x: number; y: number }; camera: Camera } | null>(null)

  const faces = useMemo(() => (open ? axonometricFaces(doc, scope, registry) : []), [open, doc, scope])

  // The window's own size, followed as it is resized.
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

  /** Puts the whole drawing in the window, from the direction shown. */
  const fit = (turn = camera.turn) => {
    if (size.width === 0 || size.height === 0) return
    const points = faces.flatMap((face) => face.points.map((p) => axoProject(p, turn, 1, { x: 0, y: 0 })))
    if (points.length === 0) return setCamera({ turn, scale: 0.05, x: size.width / 2, y: size.height / 2 })
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const scale = Math.min((size.width - MARGIN * 2) / Math.max(1, maxX - minX), (size.height - MARGIN * 2) / Math.max(1, maxY - minY))
    setCamera({ turn, scale, x: size.width / 2 - ((minX + maxX) / 2) * scale, y: size.height / 2 - ((minY + maxY) / 2) * scale })
  }

  // The drawing shows as the window opens, changes direction or is resized.
  useEffect(() => {
    if (open) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, size.width, size.height])

  // Painted on every change of the drawing, the light or the view.
  useEffect(() => {
    const element = canvas.current
    if (!open || !element || size.width === 0) return
    const dpr = window.devicePixelRatio || 1
    element.width = Math.round(size.width * dpr)
    element.height = Math.round(size.height * dpr)
    element.style.width = `${size.width}px`
    element.style.height = `${size.height}px`
    const ctx = element.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = dark ? '#121419' : '#eef0f3'
    ctx.fillRect(0, 0, size.width, size.height)
    // What is further from the camera first.
    const ordered = faces
      .map((face) => {
        const points = face.points.map((p) => axoProject(p, camera.turn, camera.scale, { x: camera.x, y: camera.y }))
        const depth = face.points.reduce((sum, p) => sum + axoDepth(p, camera.turn), 0) / face.points.length
        return { face, points, depth }
      })
      .sort((a, b) => a.depth - b.depth)
    for (const { face, points } of ordered) {
      const value = face.kind === 'floor' ? 0.82 : face.kind === 'top' ? 1 : 0.45 + 0.45 * face.light
      const [r, g, b] = dark ? [42 + value * 34, 46 + value * 36, 54 + value * 40] : [190 + value * 55, 193 + value * 55, 200 + value * 52]
      ctx.beginPath()
      points.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
      ctx.closePath()
      ctx.fillStyle = `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
      ctx.fill()
      if (camera.scale > 0.01) {
        ctx.strokeStyle = dark ? '#0b0c0e' : '#8a93a3'
        ctx.lineWidth = 0.75
        ctx.stroke()
      }
    }
  }, [open, faces, camera, dark, size])

  if (!open) return null
  const close = () => useWindows.setState({ axonometric: false })
  const turn = (step: number) => {
    const next = (((camera.turn + step) % 4) + 4) % 4
    fit(next)
  }

  return (
    <div className="axo-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="axo-window" role="dialog" aria-label={t('3D view')} onPointerDown={(e) => e.stopPropagation()}>
        <header className="axo-bar">
          <strong>{t('3D view')}</strong>
          <span className="axo-hint">{t('Axonometric: parallel lines stay parallel, and there is no perspective')}</span>
          <button title={t('Turn the view a quarter to the left')} onClick={() => turn(-1)}>
            <ChevronLeft size={15} />
          </button>
          <button title={t('Turn the view a quarter to the right')} onClick={() => turn(1)}>
            <ChevronRight size={15} />
          </button>
          <button title={t('Fit the view')} onClick={() => fit()}>
            <Maximize size={14} />
          </button>
          <button title={t('Close')} onClick={close}>
            <X size={15} />
          </button>
        </header>
        <div className="axo-frame" ref={frame}>
          <canvas
            ref={canvas}
            onWheel={(e) => {
              e.preventDefault()
              const box = e.currentTarget.getBoundingClientRect()
              const at = { x: e.clientX - box.left, y: e.clientY - box.top }
              const factor = Math.exp(-e.deltaY * 0.0015)
              const scale = Math.min(2, Math.max(0.001, camera.scale * factor))
              const k = scale / camera.scale
              setCamera({ ...camera, scale, x: at.x - (at.x - camera.x) * k, y: at.y - (at.y - camera.y) * k })
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { at: { x: e.clientX, y: e.clientY }, camera }
            }}
            onPointerMove={(e) => {
              if (!drag.current) return
              setCamera({ ...drag.current.camera, x: drag.current.camera.x + e.clientX - drag.current.at.x, y: drag.current.camera.y + e.clientY - drag.current.at.y })
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          />
        </div>
      </div>
    </div>
  )
}
