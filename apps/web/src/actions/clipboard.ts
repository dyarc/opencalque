import { buildScene, clipPlacement, copyNodes, isClipboard, pagesOf, paperContents, parseDocument, pasteNodes, pasteOffset, relocateClip, rootOf, sceneBounds, withPlacement, type Document, type Node, type Op, type Transform } from '@opencalque/core'
import { registry } from '../extensions'
import { placePicture } from '../floorplan'
import { t } from '../i18n'
import { apply, select, setTool, useStore } from '../store'
import { gridStep, visibleArea } from '../view'
import { toast } from '../windows'
import { guarded } from './common'

/* Cut, copy and paste, through the system clipboard. */

const get = useStore.getState

// Kept as well as the system clipboard, which a browser may refuse to let a page read.
let lastCopy = ''

/**
 * The given objects plus everything lying on any paper among them. A paper is copied, cut and
 * duplicated with what is on it; moving or transforming it leaves the drawing where it is.
 */
export function withPaperContents(ids: string[]): string[] {
  const { doc, scope } = get()
  if (!ids.some((id) => doc.nodes[id]?.type === 'paper')) return ids
  const scene = buildScene(doc, scope, registry)
  return [...new Set(ids.flatMap((id) => [id, ...paperContents(scene, id)]))]
}

/**
 * The component placements, outermost first, through which what is being edited is seen on its
 * page: none on a page (or in a group on one); for a component opened by double-clicking one of its
 * placements, that placement and the ones it is inside. Null for a component opened some other
 * way (from the library), which is seen nowhere in particular.
 */
function scopePlacement(): Transform[] | null {
  const { doc, scope, through } = get()
  if (rootOf(doc, scope)?.type === 'page') return []
  const chain = (through ?? []).map((id) => doc.nodes[id])
  if (chain.length === 0 || chain.some((node) => node?.type !== 'instance')) return null
  return chain.map((node) => {
    const { x, y, rotation, flipX, scale } = node as Extract<Node, { type: 'instance' }>
    return { x, y, rotation, flipX, scale }
  })
}

/** Copies the selection as JSON text, so it can be pasted into another drawing or another window. */
export const copySelection = () =>
  guarded(async () => {
    const { doc, selection } = get()
    if (selection.length === 0) return
    // It says where it was seen, so that pasted elsewhere (out of a component, onto the page) it lands there.
    lastCopy = JSON.stringify(withPlacement(copyNodes(doc, withPaperContents(selection)), scopePlacement()))
    await navigator.clipboard?.writeText(lastCopy).catch(() => {})
  })

export const cutSelection = () =>
  guarded(async () => {
    // What was copied is what goes: a paper is cut together with what is on it. It goes at once:
    // only the system clipboard is waited for, and a key pressed meanwhile (Esc, to leave a
    // component) must not find it still there, nor change what is cut.
    const ids = withPaperContents(get().selection)
    if (ids.length === 0) return
    const writing = copySelection()
    apply(ids.map((id): Op => ({ op: 'remove_node', id })))
    await writing
  })

/**
 * What the system clipboard holds: its text, and the picture on it when there is one (copied from
 * a web page, or a screenshot). Both empty when the browser does not let the page read it.
 */
async function readClipboard(): Promise<{ text: string; picture: Blob | null }> {
  const clipboard = navigator.clipboard
  if (!clipboard) return { text: '', picture: null }
  // All of it at once, which asks once; a browser that will not is asked for the text alone.
  const items = await clipboard.read?.().catch(() => null)
  if (!items) return { text: await clipboard.readText().catch(() => ''), picture: null }
  let text = ''
  let picture: Blob | null = null
  for (const item of items) {
    const image = item.types.find((type) => type.startsWith('image/'))
    if (image && !picture) picture = await item.getType(image).catch(() => null)
    if (item.types.includes('text/plain') && !text) text = await item.getType('text/plain').then((blob) => blob.text(), () => '')
  }
  return { text, picture }
}

/** The clipboard document a text holds, or null when it is not one. */
function clipOf(text: string): Document | null {
  try {
    const clip = parseDocument(JSON.parse(text))
    return isClipboard(clip) ? clip : null
  } catch {
    return null
  }
}

/**
 * Copies the selection from a point picked on the drawing (`copyFromPoint`): the copies take the
 * place the picked point is put at, so they keep their place relative to it — a corner of a table
 * clicked stays the corner under the pointer — and every click leaves a copy where it is and goes
 * on from the same point for another, until Esc. With nothing selected, the first click picks what
 * to copy. The copies are only shown until they are put down, so Esc leaves nothing behind.
 */
export const copyFromPoint = (): void => {
  setTool('move')
  useStore.setState({ copyMode: true })
}

/**
 * Pastes what is on the clipboard. From the keyboard it follows the pointer, its middle under it,
 * to be put down with a click, so that it lands where it is wanted rather than only where it was or
 * beside it; from the right-click menu it lands where the menu was opened, and in place
 * (`Mod+Shift+V`) exactly where it was copied, in view or not, which carries a thing to the same
 * place on another page. A picture copied in another program is pasted as it is (`placePicture`),
 * at the same place.
 */
export const paste = (inPlace = false) => {
  // Read now, before the clipboard is: the menu that set it is gone by the time that answers.
  const at = get().menuPoint ?? undefined
  return guarded(async () => {
    const { text, picture } = await readClipboard()
    if (!clipOf(text) && picture) return placePicture(new Uint8Array(await picture.arrayBuffer()), at)
    let clip = clipOf(text || lastCopy)
    if (!clip) return toast(t('There is nothing from AxioDraw on the clipboard.'))
    // Taken from where it was seen to the same place as seen from here: out of a component it was cut from, onto the page.
    const from = clipPlacement(clip)
    const to = scopePlacement()
    if (from && to) clip = relocateClip(clip, from, to, registry)
    const { doc, scope, activeLayer, view, viewport } = get()
    // A step that shows at any zoom (two grid steps are at least 16 pixels) and keeps the grid.
    const offset = at && !inPlace ? pasteOffset(doc, clip, scope, registry, { visible: visibleArea(view, viewport), step: 2 * gridStep(view.zoom, doc.settings?.grid), at }) : { x: 0, y: 0 }
    const result = pasteNodes(doc, clip, scope, offset, activeLayer)
    // Chosen from the menu where it was opened, or put down at once where it was copied: there is
    // nothing left for the pointer to say.
    if (inPlace || at) {
      if (apply(result.ops)) select(result.ids)
      return
    }
    // Else it is a paste to be put down by hand: its middle is what the pointer takes hold of
    // (`Placing` 'paste'), so nothing appears until the pointer says where.
    const page = pagesOf(clip)[0]
    const box = page ? sceneBounds(buildScene(clip, page.id, registry)) : null
    const mid = box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : { x: 0, y: 0 }
    select([])
    setTool('place', { type: 'paste', ops: result.ops, doc: result.doc, ids: result.ids, mid })
  })
}
