/**
 * The loading screen of index.html, shown from the first paint while the app's code loads. It
 * stays over the editor until the app knows what to show first (the file it was started with, or
 * the welcome window), so that nothing is drawn on an editor about to be covered. Taken away by
 * `startUp`, or by the app's `Guard` when the interface fails, so that its message can be read.
 */
const shown = typeof performance === 'undefined' ? 0 : performance.now()
/** The scene has five flashes and brings in the mark; a quick start still lets it play. */
const LEAST = 2600
let hiding = false

export function hideSplash(): void {
  if (hiding) return
  hiding = true
  const wait = Math.max(0, LEAST - (performance.now() - shown))
  setTimeout(() => {
    const splash = document.getElementById('splash')
    if (!splash) return
    // Clicks go through it at once; it is gone once it has faded.
    splash.classList.add('leaving')
    setTimeout(() => splash.remove(), 350)
  }, wait)
}
