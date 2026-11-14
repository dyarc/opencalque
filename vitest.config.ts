import { defineConfig } from 'vitest/config'

// The PDF fonts are kept gzipped in the app; the tests load the same files.
export default defineConfig({
  assetsInclude: ['**/*.gz'],
})
