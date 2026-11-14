import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, X } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { axonometricFaces, moveOps, type AxoFace, type Document, type Node, type Vec3 } from '@opencalque/core'
import { registry } from './extensions'
import { t } from './i18n'
import { apply, select, useStore } from './store'
import { useTheme } from './theme'
import { useWindows } from './windows'

/** Plan millimetres to three.js: the plan's Y (down the sheet) is the world's Z, and its Z is up. */
const at = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p.x, p.z, p.y)

/** A triangulated face, kept in the world coordinates the drawing gives it. */
function faceGeometry(face: AxoFace): THREE.BufferGeometry | null {
  const points = face.points.filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y || p.z !== all[i - 1].z)
  if (points.length < 3) return null
  const [a, b, c] = points
  const normal = new THREE.Vector3(b.x - a.x, b.z - a.z, b.y - a.y).cross(new THREE.Vector3(c.x - a.x, c.z - a.z, c.y - a.y))
  if (normal.lengthSq() < 1e-9) return null
  normal.normalize()
  // Two axes that span the face, choosing the plane it most nearly lies in.
  const [drop, u, v] =
    Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z)
      ? [0, 1, 2]
      : Math.abs(normal.y) >= Math.abs(normal.z)
        ? [1, 0, 2]
        : [2, 0, 1]
  // Three's axes are (plan x, height, plan y); take the pair that spans this face.
  const flat = points.map((p) => (drop === 0 ? new THREE.Vector2(p.z, p.y) : drop === 1 ? new THREE.Vector2(p.x, p.y) : new THREE.Vector2(p.x, p.z)))
  let triangles: number[][]
  try {
    triangles = THREE.ShapeUtils.triangulateShape(flat, [])
  } catch {
    triangles = []
  }
  if (triangles.length === 0) for (let i = 1; i + 1 < points.length; i++) triangles.push([0, i, i + 1])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, p.z, p.y]), 3))
  geometry.setIndex(triangles.flat())
  geometry.computeVertexNormals()
  return geometry
}

function faceColor(face: AxoFace, dark: boolean): THREE.Color {
  const light = 0.55 + 0.45 * face.light
  if (face.kind === 'floor') return new THREE.Color(dark ? 0x4e5867 : 0xc8d0db).multiplyScalar(light)
  if (face.kind === 'top') return new THREE.Color(dark ? 0x6f7784 : 0xe2ddd4).multiplyScalar(light)
  return new THREE.Color(dark ? 0x59616d : 0xb9b5ae).multiplyScalar(light)
}

/**
 * A real three.js view of the drawing: its solids stand in space, and the person can orbit,
 * zoom, select a solid and drag it over the floor. Moving a solid is one ordinary drawing edit.
 */
export function ThreeView() {
  const open = useWindows((s) => s.axonometric)
  const doc = useStore((s) => s.doc)
  const scope = useStore((s) => s.scope)
  const selection = useStore((s) => s.selection)
  const { dark } = useTheme()
  const frame = useRef<HTMLDivElement>(null)
  const renderer = useRef<THREE.WebGLRenderer | null>(null)
  const scene = useRef<THREE.Scene | null>(null)
  const camera = useRef<THREE.PerspectiveCamera | null>(null)
  const orbit = useRef<OrbitControls | null>(null)
  const transform = useRef<TransformControls | null>(null)
  const objects = useRef(new Map<string, THREE.Group>())
  const root = useRef<THREE.Group | null>(null)
  const proxy = useRef<THREE.Object3D | null>(null)
  const drag = useRef<{ start: THREE.Vector3; positions: Map<string, THREE.Vector3> } | null>(null)
  const [ready, setReady] = useState(false)
  const fitted = useRef(false)

  const faces = useMemo(() => (open ? axonometricFaces(doc, scope, registry) : []), [open, doc, scope])

  // Renderer, camera, light and orbit, once for the life of the window.
  useEffect(() => {
    if (!open || !frame.current) return
    const element = frame.current
    const webgl = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    webgl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    webgl.setSize(element.clientWidth, element.clientHeight)
    element.appendChild(webgl.domElement)
    webgl.domElement.style.display = 'block'
    webgl.domElement.style.width = '100%'
    webgl.domElement.style.height = '100%'
    renderer.current = webgl

    const world = new THREE.Scene()
    world.background = new THREE.Color(dark ? 0x121419 : 0xeef0f3)
    const perspective = new THREE.PerspectiveCamera(42, element.clientWidth / Math.max(1, element.clientHeight), 20, 500000)
    perspective.position.set(7000, 7000, 9000)
    camera.current = perspective
    world.add(new THREE.HemisphereLight(0xffffff, 0x4a4d55, 1.9))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(-4000, 9000, 5000)
    world.add(sun)
    const fill = new THREE.DirectionalLight(0xaac4ff, 0.65)
    fill.position.set(6000, 3000, -6000)
    world.add(fill)
    scene.current = world

    const controls = new OrbitControls(perspective, webgl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.09
    controls.screenSpacePanning = true
    controls.maxPolarAngle = Math.PI * 0.495
    controls.target.set(0, 0, 0)
    orbit.current = controls

    const gizmo = new TransformControls(perspective, webgl.domElement)
    gizmo.setMode('translate')
    gizmo.setSpace('world')
    gizmo.setSize(0.75)
    gizmo.showY = false
    gizmo.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value
      if (!event.value) finishDrag()
    })
    gizmo.addEventListener('objectChange', () => {
      if (!drag.current || !proxy.current) return
      const delta = proxy.current.position.clone().sub(drag.current.start)
      for (const [id, start] of drag.current.positions) {
        const group = objects.current.get(id)
        if (group) group.position.copy(start).add(delta)
      }
      webgl.render(world, perspective)
    })
    world.add(gizmo.getHelper())
    transform.current = gizmo
    const marker = new THREE.Object3D()
    marker.visible = false
    world.add(marker)
    proxy.current = marker

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = element
      if (width === 0 || height === 0) return
      webgl.setSize(width, height)
      perspective.aspect = width / height
      perspective.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)

    const pick = (event: MouseEvent) => {
      if (!scene.current || !camera.current || !renderer.current || gizmo.dragging) return
      const rect = webgl.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      const ray = new THREE.Raycaster()
      ray.setFromCamera(pointer, perspective)
      const hits = ray.intersectObjects([...objects.current.values()], true)
      const hit = hits.find((one) => one.object.userData.nodeId)?.object
      select(hit ? [hit.userData.nodeId as string] : [])
    }
    const remember = (event: PointerEvent) => {
      const start = { x: event.clientX, y: event.clientY }
      const up = (end: PointerEvent) => {
        window.removeEventListener('pointerup', up)
        if (Math.hypot(end.clientX - start.x, end.clientY - start.y) < 3 && !gizmo.dragging) pick(end)
      }
      window.addEventListener('pointerup', up, { once: true })
    }
    webgl.domElement.addEventListener('pointerdown', remember)

    let frameId = 0
    const tick = () => {
      frameId = requestAnimationFrame(tick)
      controls.update()
      webgl.render(world, perspective)
    }
    tick()
    setReady(true)
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      webgl.domElement.removeEventListener('pointerdown', remember)
      gizmo.dispose()
      controls.dispose()
      webgl.dispose()
      webgl.domElement.remove()
      renderer.current = null
      scene.current = null
      camera.current = null
      orbit.current = null
      transform.current = null
      proxy.current = null
      objects.current.clear()
      root.current = null
      fitted.current = false
      setReady(false)
    }
    // The camera and renderer last as long as the window is open; the drawing is rebuilt below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Rebuild the solids when the drawing, the scope or the light changes.
  useEffect(() => {
    if (!open || !scene.current || !camera.current || !renderer.current) return
    const world = scene.current
    if (root.current) {
      world.remove(root.current)
      root.current.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose())
          else object.material.dispose()
        }
      })
    }
    const all = new THREE.Group()
    objects.current.clear()
    const materials = new Map<string, THREE.MeshStandardMaterial[]>()
    for (const face of faces) {
      if (!face.id) continue
      const geometry = faceGeometry(face)
      if (!geometry) continue
      let group = objects.current.get(face.id)
      if (!group) {
        group = new THREE.Group()
        group.userData.nodeId = face.id
        objects.current.set(face.id, group)
        all.add(group)
      }
      const material = new THREE.MeshStandardMaterial({ color: faceColor(face, dark), roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide, flatShading: true })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData.nodeId = face.id
      group.add(mesh)
      const list = materials.get(face.id) ?? []
      list.push(material)
      materials.set(face.id, list)
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 20),
        new THREE.LineBasicMaterial({ color: dark ? 0x171b22 : 0x8b877f }),
      )
      group.add(edge)
    }
    world.add(all)
    root.current = all
    // A grid on the floor, sized to the drawing.
    const gridSize = Math.max(8000, Math.ceil((new THREE.Box3().setFromObject(all).getSize(new THREE.Vector3()).length() || 8000) / 2000) * 2000)
    const grid = new THREE.GridHelper(gridSize, 40, dark ? 0x3b4250 : 0xcfd4db, dark ? 0x272c35 : 0xe2e5ea)
    world.add(grid)
    // Keep the previous view; fit once, when the drawing first has something to see.
    if (all.children.length > 0 && !fitted.current) {
      fitted.current = true
      fit()
    }
    setReady(true)
    // The grid is removed with the next rebuild by scanning the root's siblings.
    return () => {
      if (grid.parent === world) {
        world.remove(grid)
        grid.geometry.dispose()
        ;(grid.material as THREE.Material).dispose()
      }
    }
    // fit is stable for the life of this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faces, dark, open])

  // The selection: light it, and put the move gizmo at its middle.
  useEffect(() => {
    if (!open || !ready || !transform.current || !proxy.current) return
    const selected = selection.filter((id) => objects.current.has(id))
    for (const [id, group] of objects.current) {
      const on = selected.includes(id)
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const material = object.material
        if (!(material instanceof THREE.MeshStandardMaterial)) return
        material.emissive.setHex(on ? 0x2c5bd7 : 0x000000)
        material.emissiveIntensity = on ? 0.5 : 0
      })
    }
    if (selected.length === 0) {
      transform.current.detach()
      return
    }
    const box = new THREE.Box3()
    for (const id of selected) {
      const group = objects.current.get(id)
      if (group) box.expandByObject(group)
    }
    if (box.isEmpty()) {
      transform.current.detach()
      return
    }
    const centre = box.getCenter(new THREE.Vector3())
    proxy.current.position.copy(centre)
    transform.current.attach(proxy.current)
  }, [selection, ready, open, faces])

  const fit = () => {
    if (!root.current || !camera.current || !orbit.current) return
    const box = new THREE.Box3().setFromObject(root.current)
    if (box.isEmpty()) return
    const centre = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const distance = Math.max(2000, size.length() * 1.6)
    camera.current.position.copy(centre.clone().add(new THREE.Vector3(distance, distance * 0.9, distance)))
    camera.current.near = Math.max(10, distance / 100)
    camera.current.far = distance * 20
    camera.current.updateProjectionMatrix()
    orbit.current.target.copy(centre)
    orbit.current.update()
  }

  function finishDrag(): void {
    if (!drag.current || !proxy.current || !scene.current) {
      drag.current = null
      return
    }
    const delta = proxy.current.position.clone().sub(drag.current.start)
    const moved = selection.flatMap((id) => {
      const node = doc.nodes[id]
      return node ? moveOps(doc, node, { x: delta.x, y: delta.z }) : []
    })
    drag.current = null
    if (Math.hypot(delta.x, delta.z) > 0.5 && moved.length > 0) apply(moved)
  }

  // Begin a move when the transform gizmo is taken: what is selected stays where it was until
  // the pointer is let go, then the drawing gets the ordinary move.
  useEffect(() => {
    if (!transform.current) return
    const onDown = () => {
      if (!proxy.current || selection.length === 0) return
      const positions = new Map<string, THREE.Vector3>()
      for (const id of selection) {
        const group = objects.current.get(id)
        if (group) positions.set(id, group.position.clone())
      }
      drag.current = { start: proxy.current.position.clone(), positions }
    }
    transform.current.addEventListener('mouseDown', onDown)
    return () => transform.current?.removeEventListener('mouseDown', onDown)
  }, [selection, ready])

  if (!open) return null
  const close = () => useWindows.setState({ axonometric: false })
  const title = t('3D model')

  return (
    <div className="axo-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="axo-window" role="dialog" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <header className="axo-bar">
          <strong>{title}</strong>
          <span className="axo-hint">{t('Drag to orbit, scroll to zoom. Select a solid, then drag the arrows to move it over the floor.')}</span>
          <button title={t('Fit the view')} onClick={fit}>
            <Maximize size={14} />
          </button>
          <button title={t('Close')} onClick={close}>
            <X size={15} />
          </button>
        </header>
        <div className="axo-frame" ref={frame} />
      </div>
    </div>
  )
}
