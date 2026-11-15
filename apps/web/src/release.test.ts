import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { REPOSITORY, parseChangelog } from './release'

const root = resolve(__dirname, '../../..')
const versionOf = (file: string) => JSON.parse(readFileSync(resolve(root, file), 'utf8')).version

test('the changelog is read into versions, headings and changes', () => {
  const [latest, first] = parseChangelog('# Changelog\n\nIntro.\n\n## 1.2.0 — 2026-01-02\n\n### New\n- One\n- Two\n\n### Fixed\n- Three\n\n## 1.1.0 — 2025-12-01\n- Loose')
  expect(latest).toEqual({ version: '1.2.0', date: '2026-01-02', sections: [{ title: 'New', items: ['One', 'Two'] }, { title: 'Fixed', items: ['Three'] }] })
  expect(first.sections).toEqual([{ title: '', items: ['Loose'] }])
})

test('the newest version in the changelog is the version of the app', () => {
  const releases = parseChangelog(readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'))
  expect(releases[0].sections.some((section) => section.items.length > 0)).toBe(true)
  // The installers take their version from the desktop package, the release from the tag, and
  // `opencalque --version` from the CLI's: every package of the workspace carries the same one.
  const packages = ['package.json', ...['packages', 'apps'].flatMap((dir) => readdirSync(resolve(root, dir)).map((name) => `${dir}/${name}/package.json`))]
  expect(packages).toContain('apps/desktop/package.json')
  for (const file of packages) expect([file, versionOf(file)]).toEqual([file, releases[0].version])
})

test('the app looks for its releases where the installers are published', () => {
  const desktop = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8'))
  const { owner, repo } = desktop.build.publish
  // A fork that leaves these as they were asks the project it came from: that repository's
  // newest release can be older than the version installed, and the app then says it is current.
  expect(REPOSITORY).toBe(`https://github.com/${owner}/${repo}`)
  const updates = readFileSync(resolve(root, 'apps/desktop/src/main/updates.ts'), 'utf8')
  expect(updates).toContain(`const REPOSITORY = '${owner}/${repo}'`)
})
