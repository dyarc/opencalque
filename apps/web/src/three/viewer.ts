import * as THREE from 'three'
import { DEFAULT_MATERIAL, solidTriangles, solidsBounds, type BuildingSolid, type SolidKind } from '@opencalque/core'
import { eyeOf, FOV, type Box, type Orbit } from './orbit'

/*
 * The three.js side of the 3D view: the solids of a drawing turned into meshes, a camera on an orbit
 * around them, a sun that casts their shadows, and a plane that cuts them at a height, so that a
 * floor is seen as a plan. Everything here is thrown away and made again when the drawing changes:
 * the plan stays the only thing edited.
 */

/** How the drawing is looked at: in perspective, as an eye sees it, or flat, as a model is measured. */
export type Projection = 'perspective' | 'orthographic'

/** The colours of what the drawing is made of, by material id. `''` is the default material. */
export type Colours = Record<string, string>

/** What a solid is drawn in when the drawing says nothing of its material. */
const PLAIN: Record<SolidKind, string> = {
  wall: '#d8d5cf',
  slab: '#c9c6c0',
  column: '#b9b5ae',
  beam: '#c4c0b9',
  floor: '#8f9aa6',
  glass: '#a8cfe0',
}

/** How far under the floor the ground and its grid are drawn, so that a floor hides the grid under it. */
const GROUND = 10

export class Viewer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly perspective = new THREE.PerspectiveCamera((FOV * 180) / Math.PI, 1, 50, 1000000)
  private readonly orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000000)
  /** What the drawing stands on: a plane to take its shadow, and the lines of a grid over it. */
  private readonly ground = new THREE.Group()
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2)
  private readonly sky = new THREE.HemisphereLight(0xffffff, 0x606060, 1.1)
  /** The lines along the edges of the drawing, and under it: the same way in all of them. */
  private readonly lines = new THREE.LineBasicMaterial({ color: 0x6f7683, transparent: true, opacity: 0.55 })
  /** The meshes of the drawing, and what was made for them: thrown away when it changes. */
  private readonly model = new THREE.Group()
  private made: { geometry: THREE.BufferGeometry; material?: THREE.Material }[] = []
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private box: Box | null = null
  private cut: THREE.Plane | null = null
  private projection: Projection = 'perspective'
  private size = { width: 1, height: 1 }
  private dark = false
  private wireframe = false

  constructor(canvas: HTMLCanvasElement, dark: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.localClippingEnabled = true
    this.dark = dark
    this.scene.add(this.sky, this.sun, this.sun.target, this.ground, this.model)
    // The drawing is x and y on the plan, z up, so the view's own up is that way as well.
    this.perspective.up.set(0, 0, 1)
    this.orthographic.up.set(0, 0, 1)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.paint()
  }

  /** The window the view is drawn in, in pixels. */
  resize(width: number, height: number): void {
    this.size = { width: Math.max(1, width), height: Math.max(1, height) }
    this.renderer.setSize(this.size.width, this.size.height, false)
    this.perspective.aspect = this.size.width / this.size.height
    this.perspective.updateProjectionMatrix()
    this.render()
  }

  /** Where the eye stands, and how it looks. */
  setView(orbit: Orbit, projection: Projection): void {
    this.projection = projection
    const eye = eyeOf(orbit)
    const target = new THREE.Vector3(orbit.target.x, orbit.target.y, orbit.target.z)
    // A flat view takes in as much of the drawing as the turned one does, however far off it stands.
    const half = Math.tan(FOV / 2) * orbit.distance
    const wide = half * (this.size.width / this.size.height)
    this.orthographic.left = -wide
    this.orthographic.right = wide
    this.orthographic.top = half
    this.orthographic.bottom = -half
    this.orthographic.updateProjectionMatrix()
    for (const camera of [this.perspective, this.orthographic]) {
      camera.position.set(eye.x, eye.y, eye.z)
      camera.lookAt(target)
      camera.updateMatrixWorld()
    }
    this.render()
  }

  /** The drawing as it stands, worked out again: its meshes, and the shadow and grid under them. */
  setModel(solids: BuildingSolid[], colours: Colours): void {
    this.clear()
    for (const solid of solids) {
      const flat = solidTriangles(solid)
      if (flat.length < 9) continue
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3))
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, this.materialOf(solid.kind, solid.material, colours))
      mesh.castShadow = solid.kind !== 'floor'
      mesh.receiveShadow = true
      this.model.add(mesh)
      this.made.push({ geometry })
      // The lines along the edges of a wall, so that one face is read from the next.
      const edges = new THREE.EdgesGeometry(geometry, 25)
      this.model.add(new THREE.LineSegments(edges, this.lines))
      this.made.push({ geometry: edges })
    }
    this.box = solidsBounds(solids)
    this.fitGround()
    this.render()
  }

  /** Cuts the drawing at a height, so that the floor is seen as a plan; null for no cut. */
  setCut(height: number | null): void {
    // What is kept is what stands below the plane.
    this.cut = height === null ? null : new THREE.Plane(new THREE.Vector3(0, 0, -1), height)
    this.clip()
    this.render()
  }

  /** The drawing as lines only, to read what stands where. */
  setWireframe(on: boolean): void {
    this.wireframe = on
    for (const material of this.materials.values()) material.wireframe = on
    this.render()
  }

  /** The light of the window it is drawn in: dark walls on a dark ground, or the other way. */
  setDark(dark: boolean): void {
    this.dark = dark
    this.paint()
    this.fitGround()
    this.render()
  }

  /** Draws the view as it stands. */
  render(): void {
    this.renderer.render(this.scene, this.projection === 'perspective' ? this.perspective : this.orthographic)
  }

  dispose(): void {
    this.clear()
    for (const material of this.materials.values()) material.dispose()
    this.materials.clear()
    this.lines.dispose()
    this.renderer.dispose()
  }

  /** What is thrown away when the drawing changes. */
  private clear(): void {
    this.model.clear()
    this.ground.clear()
    for (const { geometry, material } of this.made) {
      geometry.dispose()
      material?.dispose()
    }
    this.made = []
  }

  /** The cut is put on the materials, which have to be told it changed. */
  private clip(): void {
    const planes = this.cut ? [this.cut] : []
    for (const material of this.materials.values()) {
      material.clippingPlanes = planes
      material.needsUpdate = true
    }
    this.lines.clippingPlanes = planes
    this.lines.needsUpdate = true
  }

  /** The shadow and the grid under the drawing, as wide as it is. */
  private fitGround(): void {
    this.ground.clear()
    if (!this.box) return
    const { min, max } = this.box
    const middle = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 }
    const extent = Math.max(max.x - min.x, max.y - min.y, 2000) * 1.6
    // The plane the shadow falls on, and the grid over it: both under the floor.
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), new THREE.MeshStandardMaterial({ color: this.dark ? 0x1b1e23 : 0xdfe2e6, roughness: 1, metalness: 0 }))
    plane.position.set(middle.x, middle.y, -GROUND)
    plane.receiveShadow = true
    this.ground.add(plane)
    this.made.push({ geometry: plane.geometry, material: plane.material })

    // A line every metre, stronger every ten.
    const positions: number[] = []
    const step = 1000
    const count = Math.ceil(extent / 2 / step)
    for (let i = -count; i <= count; i++) {
      const [x, y] = [middle.x + i * step, middle.y + i * step]
      const [x0, x1, y0, y1] = [middle.x - count * step, middle.x + count * step, middle.y - count * step, middle.y + count * step]
      positions.push(x, y0, -GROUND / 2, x, y1, -GROUND / 2)
      positions.push(x0, y, -GROUND / 2, x1, y, -GROUND / 2)
    }
    const grid = new THREE.BufferGeometry()
    grid.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this.ground.add(new THREE.LineSegments(grid, this.lines))
    this.made.push({ geometry: grid })

    // The sun stands over the drawing, far enough off that its shadows are not stretched.
    const high = Math.max(max.z, 3000)
    this.sun.position.set(middle.x - extent * 0.5, middle.y - extent * 0.7, high * 3 + extent)
    this.sun.target.position.set(middle.x, middle.y, 0)
    const shadow = this.sun.shadow.camera
    shadow.left = -extent * 0.8
    shadow.right = extent * 0.8
    shadow.top = extent * 0.8
    shadow.bottom = -extent * 0.8
    shadow.near = 1
    shadow.far = extent * 8 + high * 4
    shadow.updateProjectionMatrix()
  }

  /** The light, the ground and the lines of the theme. */
  private paint(): void {
    this.scene.background = new THREE.Color(this.dark ? 0x121419 : 0xeef0f3)
    this.sky.intensity = this.dark ? 0.7 : 1.1
    this.sun.intensity = this.dark ? 1.6 : 2.2
    this.lines.color = new THREE.Color(this.dark ? 0x0b0c0e : 0x6f7683)
    this.lines.opacity = this.dark ? 0.7 : 0.55
  }

  /** What a solid is drawn with, by what it is made of: one material for all its like. */
  private materialOf(kind: SolidKind, material: string | null, colours: Colours): THREE.MeshStandardMaterial {
    const key = `${kind}:${material ?? ''}`
    const found = this.materials.get(key)
    if (found) return found
    // A wall of no material is of the drawing's default one, as it is in plan.
    const given = colours[material ?? ''] ?? (kind === 'wall' || kind === 'column' ? colours[DEFAULT_MATERIAL] : undefined)
    const color = new THREE.Color(given ?? PLAIN[kind])
    const made =
      kind === 'glass'
        ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color, roughness: kind === 'floor' ? 0.9 : 0.75, metalness: 0 })
    made.wireframe = this.wireframe
    made.clippingPlanes = this.cut ? [this.cut] : []
    this.materials.set(key, made)
    return made
  }
}
