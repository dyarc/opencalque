import { describe, expect, it } from 'vitest'
import { looksLikeTrackpad, wheelMove } from './wheel'

const event = (deltaY: number, more: Partial<{ deltaX: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({ deltaX: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, deltaY, ...more })
/** A notch of a mouse wheel in Chromium, and steps of two fingers on a trackpad. */
const notch = event(100)
const swipe = event(7.5, { deltaX: -3 })

describe('scrolling over the drawing', () => {
  it('tells a trackpad from a mouse wheel by its steps', () => {
    expect(looksLikeTrackpad(notch)).toBe(false)
    expect(looksLikeTrackpad(event(120))).toBe(false)
    expect(looksLikeTrackpad(swipe)).toBe(true)
    expect(looksLikeTrackpad(event(4))).toBe(true)
    expect(looksLikeTrackpad(event(3, { deltaMode: 1 }))).toBe(false)
  })

  it('moves the view with a trackpad and zooms with a mouse wheel, with nothing to choose', () => {
    expect(wheelMove(swipe, null, 0, 800).move).toEqual({ pan: { x: 3, y: -7.5 } })
    expect(wheelMove(notch, null, 0, 800).move).toHaveProperty('zoom')
  })

  it('keeps doing what a swipe started with, even when a step of it is large', () => {
    const first = wheelMove(swipe, null, 0, 800)
    expect(wheelMove(event(120), first.stream, 50, 800).move).toHaveProperty('pan')
    // Long after, a notch is a notch again.
    expect(wheelMove(event(120), first.stream, 2000, 800).move).toHaveProperty('zoom')
  })

  it('always zooms with a pinch or Ctrl, in at a pace that feels alike from both', () => {
    const pinch = wheelMove(event(-5, { ctrlKey: true }), null, 0, 800).move as { zoom: number }
    const wheel = wheelMove(event(-33, { ctrlKey: true, deltaMode: 1 }), null, 0, 800).move as { zoom: number }
    expect(pinch.zoom).toBeGreaterThan(1)
    expect(wheel.zoom).toBeGreaterThan(1)
    expect(wheelMove(event(100, { metaKey: true }), null, 0, 800).move).toHaveProperty('zoom')
  })

  it('moves sideways with Shift, as a wheel that only goes up and down is turned', () => {
    expect(wheelMove(event(100, { shiftKey: true }), null, 0, 800).move).toEqual({ pan: { x: -100, y: 0 } })
    // A sideways step with Shift moves both ways.
    expect(wheelMove(event(100, { shiftKey: true, deltaX: 20 }), null, 0, 800).move).toEqual({ pan: { x: -20, y: -100 } })
  })

  it('counts a line or a page of a wheel event as pixels, so that an old wheel zooms as a new one does', () => {
    const lines = wheelMove(event(3, { deltaMode: 1 }), null, 0, 800).move as { zoom: number }
    const pages = wheelMove(event(1, { deltaMode: 2 }), null, 0, 800).move as { zoom: number }
    expect(lines.zoom).toBeCloseTo(Math.exp(-48 * 0.0015), 9)
    expect(pages.zoom).toBeCloseTo(Math.exp(-800 * 0.0015), 9)
  })
})
