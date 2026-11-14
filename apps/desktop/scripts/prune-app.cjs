// Runs after the Electron app is assembled: the interface is written in the app's own languages,
// so Chromium's strings for the other hundred are dead weight. Keeping only the languages the app
// offers (and their regional variants) takes about 45 MB off the installed app.
const { readdirSync, rmSync, statSync } = require('node:fs')
const { join } = require('node:path')

const KEEP = new Set([
  'en.lproj',
  'en_GB.lproj',
  'de.lproj',
  'es.lproj',
  'es_419.lproj',
  'fr.lproj',
  'ja.lproj',
  'ko.lproj',
  'tr.lproj',
  'zh_CN.lproj',
  'zh_TW.lproj',
  'zh_HK.lproj',
])

function pruneLocales(bundle) {
  const resources = join(bundle, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources')
  let names = []
  try {
    names = readdirSync(resources)
  } catch {
    return
  }
  for (const name of names) {
    if (!name.endsWith('.lproj') || KEEP.has(name)) continue
    const path = join(resources, name)
    if (statSync(path).isDirectory()) rmSync(path, { recursive: true, force: true })
  }
}

if (require.main === module) {
  const bundle = process.argv[2]
  if (!bundle) {
    console.error('usage: node scripts/prune-app.cjs <App.app>')
    process.exit(1)
  }
  pruneLocales(bundle)
  console.log('pruned Electron locales')
}

module.exports = { pruneLocales, KEEP }
