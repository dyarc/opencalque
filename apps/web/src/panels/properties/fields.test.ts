import { describe, expect, it } from 'vitest'
import { applyOps, arcLengthOfChord, createDocument, snapOpeningToWall, type Document, type NodeOf, type Op } from '@opencalque/core'
import { architecture } from '@opencalque/ext-architecture'
import { registry } from '../../extensions'
import { commonFields, fieldsOf } from './fields'

registry.use(architecture)

// A 4000 mm wall, bowed 1000 mm at its middle: the circle through its ends and that point has a
// radius of 2500.
const curvedWall: Op = { op: 'add_node', node: { id: 'w', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200, bulge: -1000 } } as never
const straightWall: Op = { op: 'add_node', node: { id: 's', type: 'wall', parent: 'page_1', layer: 'layer_1', a: { x: 0, y: 3000 }, b: { x: 4000, y: 3000 }, thickness: 200 } } as never

/** A window of the given props, set in a wall as the window tool sets one under the pointer. */
function windowIn(doc: Document, id: string, props: Record<string, unknown>, at: { x: number; y: number }): Document {
  const placed = snapOpeningToWall(doc, 'page_1', registry, { kind: 'arch.window', props }, at, 2000, 10)
  if (!placed) throw new Error('no wall under the pointer')
  return applyOps(doc, [{ op: 'add_node', node: { id, type: 'parametric', parent: 'page_1', layer: 'layer_1', kind: 'arch.window', props, ...placed } } as never])
}

const fieldOf = (doc: Document, id: string, path: string) => fieldsOf(doc.nodes[id] as NodeOf<'parametric'>, doc).find((field) => field.path === path)

describe('the properties of a window in a curved wall', () => {
  const bent = windowIn(applyOps(createDocument(), [curvedWall]), 'win', { width: 1200 }, { x: 2000, y: -900 })

  it('says its width as the arc length of the wall it takes, not the chord it is kept as', () => {
    const width = fieldOf(bent, 'win', 'props.width')
    expect(width?.label).toBe('Arc length')
    // The radius the chord is measured round: the wall's own.
    expect(width?.arc).toBeCloseTo(2500, 6)
    expect(arcLengthOfChord(width!.arc!, 1200)).toBeCloseTo(2 * 2500 * Math.asin(1200 / 5000), 6)
  })

  it('says its shape is Curved, as the wall bends it, and does not offer to change it', () => {
    const shape = fieldOf(bent, 'win', 'props.shape')
    expect(shape?.fixed).toBe('Curved')
    // The choices stay, that the fixed one is shown by its own name in the language in use.
    expect(shape?.options?.map((option) => option.value)).toEqual(['Straight', 'Curved'])
  })

  it('has no bow of its own to set, the wall bending it', () => {
    expect(fieldOf(bent, 'win', 'props.bow')).toBeUndefined()
    expect(fieldOf(bent, 'win', 'props.width')).toBeDefined()
  })

  it('is measured round the curve for two windows in one wall, but is another field across a straight one', () => {
    const two = windowIn(bent, 'beside', { width: 1200 }, { x: 1200, y: -900 })
    expect(commonFields([two.nodes.win, two.nodes.beside] as NodeOf<'parametric'>[], two).find((field) => field.path === 'props.width')).toMatchObject({ label: 'Arc length', arc: 2500 })
    // A straight wall's window is wider by its chord, which is another field: neither is offered.
    const across = windowIn(applyOps(two, [straightWall]), 'flat', { width: 1200 }, { x: 2000, y: 3000 })
    expect(commonFields([across.nodes.win, across.nodes.flat] as NodeOf<'parametric'>[], across).find((field) => field.path === 'props.width')).toBeUndefined()
  })
})

describe('the properties of a window in a straight wall', () => {
  const flat = windowIn(applyOps(createDocument(), [straightWall]), 'win', { width: 1200 }, { x: 2000, y: 3000 })

  it('says its width as the width it is kept as, and lets its shape be set', () => {
    expect(fieldOf(flat, 'win', 'props.width')).toMatchObject({ label: 'Width' })
    expect(fieldOf(flat, 'win', 'props.width')?.arc).toBeUndefined()
    expect(fieldOf(flat, 'win', 'props.shape')?.fixed).toBeUndefined()
    // Off a curved wall its own bow is what bends it, so there is one to set.
    expect(fieldOf(flat, 'win', 'props.bow')).toBeDefined()
  })

  it('is bowed by its own shape when that is Curved, which is still its to set', () => {
    const own = windowIn(applyOps(createDocument(), [straightWall]), 'win', { width: 1200, shape: 'Curved', bow: 200 }, { x: 2000, y: 3000 })
    expect(fieldOf(own, 'win', 'props.width')?.label).toBe('Width')
    expect(fieldOf(own, 'win', 'props.shape')?.fixed).toBeUndefined()
  })
})

describe('the properties of a column', () => {
  const doc = applyOps(createDocument(), [
    { op: 'add_material', material: { id: 'concrete', name: 'Concrete', fill: '#c9c5c0' } },
    { op: 'add_node', node: { id: 'col', type: 'column', parent: 'page_1', layer: 'layer_1', order: 'a1', x: 0, y: 0, width: 400, height: 400 } } as never,
  ])
  const fields = fieldsOf(doc.nodes.col as NodeOf<'column'>, doc)

  it('takes its fill from a material, and has no fill of its own to set', () => {
    expect(fields.some((field) => field.path === 'style.fill')).toBe(false)
    expect(fields.find((field) => field.path === 'material')).toMatchObject({ label: 'Material', material: true })
  })

  it('offers the default material first, then the drawing’s own', () => {
    expect(fields.find((field) => field.path === 'material')?.options).toEqual([
      { value: '', label: 'Default' },
      { value: 'concrete', label: 'Concrete' },
    ])
    // Its stroke is still its own.
    expect(fields.find((field) => field.path === 'style.stroke')).toBeDefined()
  })
})
