import { describe, expect, it } from 'vitest'
import { architecture } from '../../ext-architecture/src'
import { kindOf, Registry } from '../src'

const registry = new Registry().use(architecture)
const window = registry.parametric.get('arch.window')!

describe('a window', () => {
  it('draws a line for each pane of glass: single, double or triple', () => {
    // The glass runs between the two sides of the frame, 50 mm in from each end.
    const panes = (glazing: string) =>
      window.build(registry.resolveProps(window, { width: 1200, panes: 1, sill: 0, glazing }), { wallThickness: 200 }).filter((p) => p.kind === 'path' && p.points.length === 2 && p.points[0].x === 50 && p.points[1].x === 1150).length
    expect([panes('Single'), panes('Double'), panes('Triple')]).toEqual([1, 2, 3])
  })
})

const door = registry.parametric.get('arch.door')!
const extent = (prims: ReturnType<NonNullable<typeof window.front>>) => {
  const points = prims.flatMap((p) => (p.kind === 'path' ? p.points : []))
  return { left: Math.min(...points.map((q) => q.x)), right: Math.max(...points.map((q) => q.x)), top: Math.min(...points.map((q) => q.y)), bottom: Math.max(...points.map((q) => q.y)) }
}

describe('doors and windows seen from in front', () => {
  it('a window stands on its sill height, 900 unless said, as high as it is', () => {
    expect(extent(window.front!(registry.resolveProps(window, {})))).toEqual({ left: 0, right: 1200, top: -2150, bottom: -900 })
    expect(extent(window.front!(registry.resolveProps(window, { sillHeight: 0, height: 2000, width: 800 })))).toEqual({ left: 0, right: 800, top: -2000, bottom: 0 })
    // A line between each pane, inside its frame.
    const lines = (panes: number) => window.front!(registry.resolveProps(window, { panes })).filter((p) => p.kind === 'path' && !p.closed).length
    expect([lines(1), lines(2), lines(3)]).toEqual([0, 1, 2])
  })

  it('a door stands on the floor, its leaves split down the middle when it has two', () => {
    expect(extent(door.front!(registry.resolveProps(door, {})))).toEqual({ left: 0, right: 900, top: -2040, bottom: 0 })
    const middle = (type: string) => door.front!(registry.resolveProps(door, { type })).some((p) => p.kind === 'path' && p.points.every((q) => q.x === 450))
    expect([middle('Single'), middle('Double'), middle('Sliding'), middle('Opening only')]).toEqual([false, true, true, false])
  })

  it('a window with a sill height that is not a number stands at the usual one rather than failing', () => {
    expect(extent(window.front!(registry.resolveProps(window, { sillHeight: 'high' as never }))).bottom).toBe(-900)
  })
})

const doorOn = (props: Record<string, unknown>) =>
  ({ id: 'd', type: 'parametric', parent: 'page_1', order: 'a0', kind: 'arch.door', props, x: 1000, y: 2000 }) as never

describe('a door or a window on the canvas', () => {
  it('has two handles on the lines it draws at the middle of its sides when its shape is curved', () => {
    const straight = doorOn({ width: 800 })
    expect(kindOf(straight).handles!(straight, registry)).toHaveLength(2)
    const curved = doorOn({ width: 800, shape: 'Curved', bow: 0 })
    // On the two lines, half the wall to either side of the middle: 200 mm of wall, with no
    // drawing to say otherwise.
    expect(kindOf(curved).handles!(curved, registry)).toHaveLength(4)
    expect(kindOf(curved).handles!(curved, registry).slice(2)).toEqual([
      { x: 1400, y: 1900 },
      { x: 1400, y: 2100 },
    ])
    // Dragging one puts the line it is on where the pointer is: 200 mm out is a bow of 300 on
    // that side, and the same on the other side a bow of -300.
    expect(kindOf(curved).moveHandle!(curved, 2, { x: 1400, y: 2200 }, registry)).toMatchObject({ props: { shape: 'Curved', bow: 300 } })
    expect(kindOf(curved).moveHandle!(curved, 3, { x: 1400, y: 1800 }, registry)).toMatchObject({ props: { bow: -300 } })
  })
})
