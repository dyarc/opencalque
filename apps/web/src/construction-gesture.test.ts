import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildScene, createDocument, hitTest, nodePrimitives, Registry, type Document, type Node, type NodeOf } from '@opencalque/core'
import type { Canvas } from './canvas/runtime'

/*
 * The construction line tool as the canvas runs it: the presses, the move between them, and what
 * is in the drawing after the second click. A bare browser stands in for the store's platform.
 */

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })
  vi.stubGlobal('navigator', { language: 'en' })
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) })
})

const registry = new Registry()
const at = (x: number, y: number) => ({ clientX: x, clientY: y, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false })
const keys = { altKey: false, shiftKey: false }

/** A canvas over the store's drawing, its scene the drawing as the canvas last showed it. */
function canvas(doc: Document): Canvas {
  const scene = buildScene(doc, 'page_1', registry)
  return {
    gesture: { kind: 'idle' },
    scene,
    snappable: scene,
    setOverlay: () => {},
    lastClick: null,
    ended: null,
    endedLine: null,
    lastWorld: { world: { x: 0, y: 0 }, altKey: false, shiftKey: false },
    tracked: { tool: 'construction', points: [], resting: null },
  } as unknown as Canvas
}

describe('the construction line tool', () => {
  it('ends a two-point guide on the second click, though the pointer moved over its own preview', async () => {
    const { useStore } = await import('./store')
    const { constructionDown } = await import('./canvas/gestures/construction')
    const { drawMove } = await import('./canvas/gestures/drawTools')
    useStore.setState({
      doc: createDocument('Plan'),
      scope: 'page_1',
      tool: 'construction',
      view: { x: 0, y: 0, zoom: 0.1 },
      viewport: { width: 1000, height: 800 },
      drawLocks: {},
      drawStep: 0,
      selection: [],
    })
    const c = canvas(useStore.getState().doc)
    const refresh = () => {
      const scene = buildScene(useStore.getState().doc, 'page_1', registry)
      c.scene = scene
      c.snappable = scene
    }
    // First point, a move that draws the preview through the pointer, then the second point, which
    // lies on that preview: taking the line under the pointer must not take the guide being drawn.
    constructionDown(c, at(100, 100) as never, { x: 100, y: 100 }, { x: 1000, y: 1000 })
    refresh()
    drawMove(c, c.gesture as never, keys as never, { x: 200, y: 200 }, { x: 2000, y: 1500 }, {} as never)
    refresh()
    expect(hitTest(c.scene, { x: 3000, y: 2000 }, 60)?.node.type).toBe('construction')
    constructionDown(c, at(300, 200) as never, { x: 300, y: 200 }, { x: 3000, y: 2000 })

    const state = useStore.getState()
    // Committed, not a preview left behind.
    expect(state.base).toBeNull()
    const guides = Object.values(state.doc.nodes).filter((node) => node.type === 'construction')
    expect(guides).toHaveLength(1)
    expect(guides[0]).toMatchObject({ a: { x: 1000, y: 1000 }, b: { x: 3000, y: 2000 } })
    const prims = nodePrimitives(guides[0] as NodeOf<'construction'>, { doc: state.doc, registry, depth: 0 })
    expect(prims).toHaveLength(1)
    const path = prims[0]
    if (path.kind !== 'path') throw new Error('not a path')
    expect(path.points[0].x).toBeLessThan(1000)
    expect(path.points[1].x).toBeGreaterThan(3000)
  })
})
