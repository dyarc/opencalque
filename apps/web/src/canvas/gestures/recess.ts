import { pointInPolygon, rectCorners, rotate, sub, type NodeOf } from '@opencalque/core'
import { t } from '../../i18n'
import { apply, select, useStore } from '../../store'
import { get, type Press } from '../runtime'

/*
 * The sunken-box tool: a pit cut into a slab. It is a click inside a rectangle that has a top and a
 * bottom, and the pit is a rectangle of its own, its floor and underside measured from the slab's
 * bottom. A rectangle without thickness has nothing to sink into, and the tool says so.
 */

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export const recessDown: Press = (_c, _e, _at, world) => {
  const { base, doc } = get()
  const nodes = Object.values((base ?? doc).nodes)
  // The last rectangle under the pointer that has a thickness: the one drawn over the others.
  const slab = nodes
    .filter((node): node is NodeOf<'rect'> => node.type === 'rect' && node.top !== undefined && node.bottom !== undefined && Math.abs(node.top - node.bottom) > 1e-6 && pointInPolygon(world, rectCorners(node)))
    .at(-1)
  if (!slab || slab.top === undefined || slab.bottom === undefined) {
    useStore.setState({ status: t('Sink a pit into a rectangle that has a top and a bottom') })
    return
  }
  const local = rotate(sub(world, slab), -(slab.rotation ?? 0))
  const size = Math.min(1000, slab.width * 0.6, slab.height * 0.6)
  const thickness = Math.abs(slab.top - slab.bottom)
  if (size < 100 || thickness < 50) {
    useStore.setState({ status: t('This slab is too thin or too small for a sunken pit') })
    return
  }
  const top = thickness - Math.min(50, thickness / 2)
  const bottom = top - Math.max(100, thickness / 2)
  if (apply([{ op: 'update_node', id: slab.id, patch: { recess: { x: clamp(local.x - size / 2, 0, slab.width - size), y: clamp(local.y - size / 2, 0, slab.height - size), width: size, height: size, top, bottom } } }])) {
    select([slab.id])
    useStore.setState({ status: t('Sunken pit cut') })
  }
}
