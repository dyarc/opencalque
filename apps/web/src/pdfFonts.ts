import { pdfFontNames, readTrueType } from '@opencalque/core'

/**
 * The fonts a PDF embeds for letters the standard PDF fonts lack (see fonts/README.md). They stay
 * out of the app until a PDF needs one: the Chinese one is 10 MB. Each comes as a script holding
 * the font as base64 text, which the desktop app can load from disk where it could not fetch a file.
 */
const FONTS: Record<string, () => Promise<{ default: string }>> = {
  NotoSans: () => import('../../../fonts/NotoSans-Regular.ttf.gz?inline'),
  NotoSansSC: () => import('../../../fonts/NotoSansSC-Regular.ttf.gz?inline'),
  NotoSansJP: () => import('../../../fonts/NotoSansJP-Regular.ttf.gz?inline'),
  NotoSansKR: () => import('../../../fonts/NotoSansKR-Regular.ttf.gz?inline'),
}

const loaded = new Map<string, Promise<Uint8Array>>()

function load(name: string): Promise<Uint8Array> {
  let font = loaded.get(name)
  if (!font) {
    font = FONTS[name]().then(async ({ default: url }) => {
      const text = atob(url.slice(url.indexOf(',') + 1))
      const packed = new Uint8Array(text.length)
      for (let i = 0; i < text.length; i++) packed[i] = text.charCodeAt(i)
      // The fonts travel gzipped: a PDF has to embed the plain TrueType bytes, which only a
      // machine making one needs, so the app keeps the smaller copy.
      const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    })
    // A download that failed is tried again next time.
    font.catch(() => loaded.delete(name))
    loaded.set(name, font)
  }
  return font
}

/**
 * The fonts that print these characters, in the order they are tried (`pdfFontNames`): a font is
 * only loaded when the ones before it fall short. `language` is the interface's, which says how a
 * text in Chinese characters alone is read.
 */
export async function pdfFonts(characters: string[], language?: string): Promise<Uint8Array[]> {
  const fonts: Uint8Array[] = []
  let missing = characters
  for (const name of pdfFontNames(characters, language)) {
    if (missing.length === 0) break
    const bytes = await load(name)
    const font = readTrueType(bytes)
    const left = missing.filter((char) => font.glyph(char.codePointAt(0)!) === 0)
    if (left.length < missing.length) fonts.push(bytes)
    missing = left
  }
  return fonts
}

/** Starts loading the fonts a PDF of these characters needs, so that they are there when it is exported. */
export function preparePdfFonts(characters: string[], language?: string): void {
  if (characters.length > 0) pdfFonts(characters, language).catch(() => {})
}
