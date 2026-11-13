import { create } from 'zustand'
import { platform } from './platform'
import { setPrefs, usePrefs } from './prefs'

/**
 * Light or dark, as the interface is drawn right now: the preference, with 'system' resolved
 * against the computer's setting. The page's colours are CSS variables switched by
 * `data-theme` on <html> (styles.css); the canvas reads `dark` and `darkCanvas` from here.
 */
export const useTheme = create<{ dark: boolean; darkCanvas: boolean }>(() => ({ dark: false, darkCanvas: false }))

const system = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
/** What the host was last told, so it is told at start whatever the theme, and again only on a change. */
let told = ''

/** The palettes drawn dark, for the canvas and the host window. */
const DARK_THEMES = new Set(['dark', 'graphite', 'blueprint', 'ink'])

function update(): void {
  const { theme, darkCanvas } = usePrefs.getState()
  const chosen = theme === 'system' ? (system?.matches ? 'dark' : 'light') : theme
  const dark = DARK_THEMES.has(chosen)
  document.documentElement.dataset.theme = chosen
  const state = useTheme.getState()
  // The host is told the first time too: a window left to the system's dark setting under a light
  // interface draws its buttons for the wrong one.
  if (told !== `${dark} ${theme}`) platform.setTheme?.(dark, theme === 'system')
  told = `${dark} ${theme}`
  if (state.dark !== dark || state.darkCanvas !== (dark && darkCanvas)) useTheme.setState({ dark, darkCanvas: dark && darkCanvas })
}

/** Follows the preference and the system setting from now on. Called once, before the first render. */
export function startTheme(): void {
  update()
  system?.addEventListener('change', update)
  usePrefs.subscribe((prefs, previous) => {
    if (prefs.theme !== previous.theme || prefs.darkCanvas !== previous.darkCanvas) update()
  })
}

/** Switches to the theme that is not showing, as an explicit choice rather than the system's. */
export function toggleTheme(): void {
  setPrefs({ theme: useTheme.getState().dark ? 'light' : 'dark' })
}
