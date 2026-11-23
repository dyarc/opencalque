import { describe, expect, it } from 'vitest'
import { architecture } from '../../ext-architecture/src'
import { Registry, type NodeOf, type Primitive } from '../src'

const registry = new Registry().use(architecture)
const radiator = registry.parametric.get('arch.radiator')!
const drawn = (props: Record<string, unknown> = {}) => radiator.build(registry.resolveProps(radiator, props), {})
type Path = Extract<Primitive, { kind: 'path' }>
/** The lines across its body, between its sections. */
const sections = (prims: Primitive[]) => prims.filter((p): p is Path => p.kind === 'path' && !p.closed && p.strokeWidth !== undefined)
const valve = (prims: Primitive[]) => prims.find((p) => p.kind === 'ellipse') as { cx: number; rx: number }

describe('a radiator', () => {
  it('is in the object library under Heating, against the wall by its back, 80 cm long and 10 cm deep to begin with', () => {
    expect(radiator.category).toBe('heating')
    const body = drawn().find((p): p is Path => p.kind === 'path' && !!p.closed)!
    expect(body.points).toEqual([{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 100 }, { x: 0, y: 100 }])
  })

  it('keeps the width of its sections as it is made longer', () => {
    expect(sections(drawn())).toHaveLength(12)
    expect(sections(drawn({ width: 1600 }))).toHaveLength(26)
    const gaps = sections(drawn({ width: 1600 })).map((p) => p.points[0].x)
    expect(gaps[1] - gaps[0]).toBeCloseTo(1600 / 27, 6)
  })

  it('has its valve beside the end it is fed from', () => {
    expect(valve(drawn()).cx).toBeGreaterThan(800)
    expect(valve(drawn({ valve: 'Left' })).cx).toBeLessThan(0)
  })

  it('is made longer or deeper by its frame, never shorter than 20 cm nor shallower than 4 cm', () => {
    const props = registry.resolveProps(radiator, {})
    expect(radiator.box!.resize(props, { width: 1234.4, height: 120 })).toEqual({ width: 1234, depth: 120 })
    expect(radiator.box!.resize(props, { width: 50, height: 10 })).toEqual({ width: 200, depth: 40 })
  })

  it('cannot be made to draw without end', () => {
    expect(sections(drawn({ width: 1e9 })).length).toBeLessThan(200)
    const node = { id: 'r', type: 'parametric', parent: 'page_1', order: 'a0', kind: 'arch.radiator', props: { width: Number.NaN }, x: 0, y: 0, rotation: 0 } as NodeOf<'parametric'>
    expect(() => radiator.build(registry.resolveProps(radiator, node.props), {})).not.toThrow()
  })
})

const fireplace = registry.parametric.get('arch.fireplace')!
const built = (props: Record<string, unknown> = {}) => fireplace.build(registry.resolveProps(fireplace, props), {})
const front = (props: Record<string, unknown> = {}) => fireplace.front!(registry.resolveProps(fireplace, props))
const box = (prims: Primitive[]) => {
  const points = prims.flatMap((p): { x: number; y: number }[] => (p.kind === 'path' ? p.points : []))
  return { left: Math.min(...points.map((q) => q.x)), right: Math.max(...points.map((q) => q.x)), top: Math.min(...points.map((q) => q.y)), bottom: Math.max(...points.map((q) => q.y)) }
}

describe('a fireplace', () => {
  it('is under Heating, its breast against the wall by its back, a metre wide and 2.5 m tall', () => {
    expect(fireplace.category).toBe('heating')
    expect(box(built())).toMatchObject({ left: 0, right: 1000, bottom: 500 })
    expect(box(front())).toEqual({ left: 0, right: 1000, top: -2500, bottom: 0 })
  })

  it('has a cassette set flush in the breast, its glass along the front', () => {
    const prims = built()
    const [outer, inner] = prims.filter((p): p is Path => p.kind === 'path' && !!p.closed)
    expect(outer.points).toEqual([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 0, y: 500 }])
    // 15 % of the width in from each side, from a quarter of the depth to the front.
    expect(box([inner])).toEqual({ left: 150, right: 850, bottom: 500, top: 125 })
    // Its frame, 450 mm above the floor, a metre high and 1.05 m wide.
    expect(box(front({ style: 'Cassette' }))).toMatchObject({ left: 0, right: 1000, top: -2500 })
    const frames = front().filter((p): p is Path => p.kind === 'path' && !!p.closed)
    expect(box([frames[1]])).toEqual({ left: 150, right: 850, top: -1050, bottom: -450 })
  })

  it('has an open hearth with its slab on the floor in front, under a mantel and a hood', () => {
    const open = { style: 'Open hearth', hearth: 400 }
    expect(box(built(open))).toMatchObject({ bottom: 900 })
    // The mantel at 1.2 m, wider than the breast by 30 mm each side, and the hood above it.
    expect(box(front(open))).toMatchObject({ left: -30, right: 1030, top: -2500 })
    expect(front(open).some((p) => p.kind === 'path' && p.closed && p.points.every((q) => q.y <= -1200))).toBe(true)
  })

  it('is made wider or deeper by its frame, never under 40 × 25 cm', () => {
    const props = registry.resolveProps(fireplace, {})
    expect(fireplace.box!.resize(props, { width: 1234.4, height: 600 })).toEqual({ width: 1234, depth: 600 })
    expect(fireplace.box!.resize(props, { width: 50, height: 10 })).toEqual({ width: 400, depth: 250 })
  })
})
