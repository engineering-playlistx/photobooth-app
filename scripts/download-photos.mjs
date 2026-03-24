/**
 * Bulk download all photos from Supabase photobooth-bucket/public/
 *
 * Usage:
 *   node scripts/download-photos.mjs
 *
 * Reads env from apps/web/.env (SUPABASE_URL + SUPABASE_SERVICE_KEY required)
 * Downloads files to ./downloads/photos/ by default
 * Override output dir: node scripts/download-photos.mjs ./my-output-dir
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const BUCKET = 'photobooth-bucket'
const FOLDER = 'public'
const CONCURRENCY = 5           // simultaneous downloads
const PAGE_SIZE = 1000          // files per list call (Supabase max)

const outputDir = resolve(process.argv[2] ?? join(ROOT, 'downloads', 'photos'))

// ---------------------------------------------------------------------------
// Load .env from apps/web/.env
// ---------------------------------------------------------------------------

function loadEnv(envPath) {
  if (!existsSync(envPath)) {
    console.error(`❌  .env file not found at: ${envPath}`)
    process.exit(1)
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnv(join(ROOT, 'apps', 'web', '.env'))

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in apps/web/.env')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function listAllFiles() {
  const files = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(FOLDER, { limit: PAGE_SIZE, offset, sortBy: { column: 'created_at', order: 'asc' } })

    if (error) {
      console.error('❌  Failed to list files:', error.message)
      process.exit(1)
    }

    if (!data || data.length === 0) break

    // Filter out folder placeholders (no id = empty folder entry)
    const actual = data.filter((f) => f.id !== null)
    files.push(...actual)

    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return files
}

async function downloadFile(file) {
  const filePath = `${FOLDER}/${file.name}`
  const destPath = join(outputDir, file.name)

  const { data, error } = await supabase.storage.from(BUCKET).download(filePath)

  if (error) {
    return { name: file.name, ok: false, error: error.message }
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  writeFileSync(destPath, buffer)
  return { name: file.name, ok: true }
}

async function runWithConcurrency(tasks, concurrency) {
  const results = []
  let idx = 0

  async function worker() {
    while (idx < tasks.length) {
      const current = idx++
      const result = await tasks[current]()
      results[current] = result
      const status = result.ok ? '✅' : '❌'
      console.log(`  ${status} [${current + 1}/${tasks.length}] ${result.name}${result.ok ? '' : ' — ' + result.error}`)
    }
  }

  const workers = Array.from({ length: concurrency }, worker)
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n📸  Photobooth Bulk Downloader`)
  console.log(`   Bucket : ${BUCKET}/${FOLDER}`)
  console.log(`   Output : ${outputDir}`)
  console.log(`   Project: ${SUPABASE_URL}\n`)

  mkdirSync(outputDir, { recursive: true })

  console.log('🔍  Listing files…')
  const files = await listAllFiles()

  if (files.length === 0) {
    console.log('ℹ️   No files found in the bucket folder.')
    return
  }

  console.log(`📦  Found ${files.length} file(s). Starting download with concurrency=${CONCURRENCY}…\n`)

  const tasks = files.map((file) => () => downloadFile(file))
  const results = await runWithConcurrency(tasks, CONCURRENCY)

  const succeeded = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length

  console.log(`\n🏁  Done! ${succeeded} downloaded, ${failed} failed.`)
  if (succeeded > 0) console.log(`   Saved to: ${outputDir}`)
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err)
  process.exit(1)
})
