import { describe, expect, it } from 'vitest'
import { applyOps, createDocument, nodePrimitives, parseDocument, Registry, serializeDocument, type Document, type NodeOf, type Op } from '../src'

const registry = new Registry()
const add = (node: Record<string, unknown>): Op => ({ op: 'add_node', node: { parent: 'page_1', ...node } }) as Op

/** A page with a radius dimension and an angle dimension. */
const plan = (): Document =>
  applyOps(createDocument('Plan'), [
    add({ type: 'radialDimension', id: 'r', centre: { x: 0, y: 0 }, radius: 1000, angle: 0 }),
    add({ type: 'angleDimension', id: 'a', vertex: { x: 0, y: 0 }, from: { x: 1000, y: 0 }, to: { x: 0, y: 1000 }, radius: 500 }),
  ])

const prims = (doc: Document, id: string) => nodePrimitives(doc.nodes[id] as NodeOf<'radialDimension'>, { doc, registry, depth: 0 })

describe('measuring dimensions', () => {
  it('writes a radius as R and its value, on a leader that starts at the arc and runs out to the words', () => {
    const drawn = prims(plan(), 'r')
    const texts = drawn.flatMap((prim) => (prim.kind === 'text' ? [prim.text] : []))
    expect(texts).toEqual(['R 1000'])
    // A leader out from the arc to the words, and nothing through the centre.
    const paths = drawn.flatMap((prim) => (prim.kind === 'path' ? [prim.points] : []))
    expect(paths[0][0]).toEqual({ x: 1000, y: 0 })
    expect(paths[0][1].x).toBeGreaterThan(1000)
    expect(paths.some((points) => points[0].x === 0 && points[0].y === 0 && points[1].x === 1000)).toBe(false)
    // The arrow is filled with the line's colour.
    expect(drawn.some((prim) => prim.kind === 'path' && prim.closed && prim.fill === prim.stroke)).toBe(true)
  })

  it('writes an angle as its degrees, with its arc at the radius chosen', () => {
    const doc = plan()
    const drawn = nodePrimitives(doc.nodes.a as NodeOf<'angleDimension'>, { doc, registry, depth: 0 })
    const text = drawn.find((prim) => prim.kind === 'text')
    expect(text).toMatchObject({ text: '90°' })
    const arc = drawn.find((prim) => prim.kind === 'path' && prim.points.length > 5)
    if (arc?.kind !== 'path') throw new Error('no arc')
    expect(arc.points[0]).toEqual({ x: 500, y: 0 })
    expect(arc.points.at(-1)!.x).toBeCloseTo(0, 6)
    expect(arc.points.at(-1)!.y).toBeCloseTo(500, 6)
    expect(arc.points.length).toBeGreaterThan(5)
  })

  it('keeps them in a drawing of the version that knows them, and reads them back', () => {
    const text = serializeDocument(plan())
    expect(JSON.parse(text).version).toBe(5)
    const read = parseDocument(JSON.parse(text))
    expect(read.nodes.r).toMatchObject({ type: 'radialDimension', radius: 1000 })
    expect(read.nodes.a).toMatchObject({ type: 'angleDimension', radius: 500 })
  })

  it('is placed by moving and turning like anything else', () => {
    const doc = plan()
    expect(doc.nodes.r).toMatchObject({ type: 'radialDimension' })
    // The text of a radius dimension follows its leader's angle: a turn rounds it back to reading upright.
    const turned = applyOps(doc, [{ op: 'update_node', id: 'r', patch: { angle: 180 } }])
    expect(turned.nodes.r).toMatchObject({ angle: 180 })
  })
})

describe('measuring dimensions in a style', () => {
  const styled = (): Document =>
    applyOps(createDocument('Plan'), [
      { op: 'add_dimension_style', dimensionStyle: { id: 'std', name: 'Office', style: { stroke: '#c00' }, markerSize: 40, size: 200, font: 'serif', textColor: '#0a0' } } as never,
      add({ type: 'radialDimension', id: 'r', centre: { x: 0, y: 0 }, radius: 1000, angle: 0, dimensionStyle: 'std' }),
      add({ type: 'angleDimension', id: 'a', vertex: { x: 0, y: 0 }, from: { x: 1000, y: 0 }, to: { x: 0, y: 1000 }, radius: 500, dimensionStyle: 'std' }),
    ])

  it('takes what its dimension style defines, as a linear dimension does', () => {
    const doc = styled()
    const text = (id: string) => {
      const drawn = nodePrimitives(doc.nodes[id] as NodeOf<'radialDimension'>, { doc, registry, depth: 0 })
      return drawn.find((prim) => prim.kind === 'text') as { size?: number; stroke?: string; font?: string; text: string }
    }
    expect(text('r')).toMatchObject({ size: 200, stroke: '#0a0', font: 'serif' })
    expect(text('a')).toMatchObject({ size: 200, stroke: '#0a0', font: 'serif' })
    // The arrow comes from the style too.
    const drawn = nodePrimitives(doc.nodes.r as NodeOf<'radialDimension'>, { doc, registry, depth: 0 })
    const arrow = drawn.find((prim) => prim.kind === 'path' && prim.closed) as { stroke?: string }
    expect(arrow.stroke).toBe('#c00')
  })

  it('keeps its look when the style it was in is removed', () => {
    const without = applyOps(styled(), [{ op: 'remove_dimension_style', id: 'std' }])
    const node = without.nodes.r as NodeOf<'radialDimension'>
    expect(node.dimensionStyle).toBeUndefined()
    expect(node).toMatchObject({ size: 200, font: 'serif', textColor: '#0a0' })
  })
})
