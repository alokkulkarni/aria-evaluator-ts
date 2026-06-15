import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// The codebase uses NodeNext ESM with explicit ".js" import specifiers that
// actually point at ".ts" sources. Vite doesn't rewrite those by default, so
// this pre-resolver maps a relative "*.js" import to its "*.ts" sibling.
export default defineConfig({
  plugins: [
    {
      name: 'js-to-ts-resolver',
      enforce: 'pre',
      resolveId(source, importer) {
        if (importer && source.startsWith('.') && source.endsWith('.js')) {
          const tsPath = resolve(dirname(importer), source.replace(/\.js$/, '.ts'))
          if (existsSync(tsPath)) return tsPath
        }
        return null
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
