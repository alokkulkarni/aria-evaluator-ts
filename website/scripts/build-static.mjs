#!/usr/bin/env node
/**
 * Build the website as a fully-static export (output: 'export').
 *
 * API routes are incompatible with static export, so this script temporarily
 * moves them aside, runs `next build`, and restores them afterwards.
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const apiDir = resolve(root, 'src/app/api')
const tempDir = resolve(root, '.api-routes-backup')

function moveAside() {
  if (existsSync(apiDir)) {
    mkdirSync(tempDir, { recursive: true })
    renameSync(apiDir, resolve(tempDir, 'api'))
    console.log('  ▸ Moved src/app/api/ aside for static export')
  }
}

function restore() {
  const backedUp = resolve(tempDir, 'api')
  if (existsSync(backedUp)) {
    renameSync(backedUp, apiDir)
    try { rmdirSync(tempDir) } catch { /* ignore */ }
    console.log('  ▸ Restored src/app/api/')
  }
}

try {
  moveAside()
  console.log('  ▸ Running next build with output: export ...')
  execSync('npx next build', { cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_BUILD_MODE: 'export' } })
  console.log('  ✓ Static export complete → out/')
} finally {
  restore()
}
