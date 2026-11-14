import { describe, expect, it } from 'vitest'
import { curvedDoor, curvedWindow } from '../../ext-architecture/src/openings'

describe('curved doors and windows', () => {
  it('follow the wall when they are built on a curved one', () => {
    const env = { wallThickness: 200, wallCurve: { radius: 3000, half: 500, side: 1 as const } }
    for (const kind of [curvedDoor, curvedWindow]) {
      const prims = kind.build!({ width: 1000, height: 1200, sillHeight: 900, type: 'Single', shape: 'Curved' }, env)
      expect(prims.length).toBeGreaterThan(0)
      const paths = prims.filter((prim) => prim.kind === 'path') as { points: unknown[]; closed?: boolean }[]
      expect(paths.some((path) => path.points.length > 2)).toBe(true)
    }
  })
})
