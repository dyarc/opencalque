import { beforeAll, describe, expect, it, vi } from 'vitest'
import { applyOps, buildScene, createDocument, Registry, type Document } from '@opencalque/core'
import type { Canvas } from './canvas/runtime'

/*
 * The format painter, run as the canvas runs it: a click takes the layer, look and ends of one
 * object, and each click after it gives them to another, leaving its name and shape alone.
 */

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })
  vi.stubGlobal('navigator', { language: 'en' })
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) })
})

const registry = new Registry()
const at = (x: number, y: number) => ({ x, y })

/** Two lines, one red and on a layer of its own, the other blue; the brush gives the first to the second. */
const plan = (): Document =>
  applyOps(createDocument('Plan'), [
    { op: 'add_layer', layer: { id: 'layer_2', name: 'Red' } } as never,
    { op: 'add_node', node: { id: 'from', type: 'line', parent: 'page_1', layer: 'layer_2', a: at(0, 0), b: at(1000, 0), startMarker: 'arrow', endMarker: 'dot', markerSize: 80, style: { stroke: '#cc0000', strokeWidth: 2, dash: [6, 3] } } } as never,
    { op: 'add_node', node: { id: 'to', type: 'line', parent: 'page_1', layer: 'layer_1', name: 'Keep me', a: at(0, 2000), b: at(1000, 2000), style: { stroke: '#0000cc' } } } as never,
  ])

describe('the format painter', () => {
  it('gives the layer, stroke and ends of one object to another, and nothing else', async () => {
    const { useStore } = await import('./store')
    const { painterDown } = await import('./canvas/gestures/painter')
    useStore.setState({ doc: plan(), scope: 'page_1', tool: 'formatPainter', view: { x: 0, y: 0, zoom: 0.1 }, viewport: { width: 1000, height: 800 }, selection: [] })
    const c = { scene: buildScene(useStore.getState().doc, 'page_1', registry), setOverlay: () => {}, gesture: { kind: 'idle' } } as unknown as Canvas
    // Take the first line, then paint the second.
    painterDown(c, {} as never, {} as never, at(500, 0))
    painterDown(c, {} as never, {} as never, at(500, 2000))
    const target = useStore.getState().doc.nodes.to
    expect(target).toMatchObject({
      type: 'line',
      name: 'Keep me',
      a: { x: 0, y: 2000 },
      b: { x: 1000, y: 2000 },
      layer: 'layer_2',
      startMarker: 'arrow',
      endMarker: 'dot',
      markerSize: 80,
      style: { stroke: '#cc0000', strokeWidth: 2, dash: [6, 3] },
    })
    // The source is as it was.
    expect(useStore.getState().doc.nodes.from).toMatchObject({ style: { stroke: '#cc0000' } })
    // Another tool puts the brush down.
    useStore.setState({ tool: 'select' })
    useStore.setState({ tool: 'formatPainter' })
  })
})
