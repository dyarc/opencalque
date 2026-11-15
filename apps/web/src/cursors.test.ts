import { describe, expect, it } from 'vitest'
import { POINTER_NAMES, pointer, pointerImage } from './cursors'

// The canvas's own pointers: what CSS is given for each, and that the same string is given again,
// so the browser keeps one image and React sees no change.
describe('the pointer set', () => {
  it('gives CSS a picture with its hot spot, and a keyword to fall back on', () => {
    expect(pointer('copy')).toMatch(/^url\("data:image\/svg\+xml,/)
    expect(pointer('copy').endsWith(', copy')).toBe(true)
    expect(pointer('nwse-resize').endsWith(', nwse-resize')).toBe(true)
    expect(pointer('copy')).toBe(pointer('copy'))
  })

  it('is the arrow for a name it does not know, and for none', () => {
    expect(pointer('no such pointer')).toBe(pointer('default'))
    expect(pointer(undefined)).toBe(pointer('default'))
    expect(pointer(null)).toBe(pointer('default'))
  })

  it('has a pointer for every state the canvas asks for', () => {
    for (const name of ['default', 'crosshair', 'grab', 'grabbing', 'move', 'copy', 'pointer', 'nwse-resize', 'nesw-resize', 'ns-resize', 'ew-resize', 'brush']) expect(POINTER_NAMES).toContain(name)
    for (const name of POINTER_NAMES) expect(pointerImage(name)).toMatch(/^<svg /)
  })
})
