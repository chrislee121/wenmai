import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { isUnderRoot, posixRel } from './paths.js'

export const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'images',
  'html',
  'dist',
  '.cursor',
  '.claude',
  '.agents',
  '.vscode',
  '.idea',
  'raw',
])

export const SKIP_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'SKILL.md', 'SCHEMA.md', 'index.md', 'log.md'])
export const MAX_SOURCE_BYTES = 512 * 1024
export const MAX_SOURCE_FILES = 600

export interface SourceMarkdown {
  abs: string
  root: string
  rel: string
}

export type SkipReason = 'skip-file' | 'too-large' | 'unreadable'

export interface ScanSkip {
  abs: string
  rel: string
  reason: SkipReason
}

export interface SourceScanResult {
  files: SourceMarkdown[]
  skipped: ScanSkip[]
  truncated: boolean
  maxFiles: number
  notMarkdownCount: number
}

export interface ScanOptions {
  extraExtensions?: readonly string[]
  maxExtraBytes?: number
}

export async function listSourceMarkdown(roots: string[], maxFiles = MAX_SOURCE_FILES): Promise<SourceMarkdown[]> {
  const scan = await scanSourceMarkdown(roots, maxFiles)
  return scan.files
}

export async function scanSourceMarkdown(
  roots: string[],
  maxFiles = MAX_SOURCE_FILES,
  options: ScanOptions = {},
): Promise<SourceScanResult> {
  const files: SourceMarkdown[] = []
  const skipped: ScanSkip[] = []
  const seen = new Set<string>()
  let truncated = false
  let notMarkdownCount = 0
  const extra = new Set((options.extraExtensions ?? []).map((ext) => ext.toLowerCase()))
  const maxExtraBytes = options.maxExtraBytes ?? MAX_SOURCE_BYTES
  const uniqueRoots = uniqueContainingRoots(roots)
  for (const root of uniqueRoots) {
    const hitCap = await walk(root, root, files, skipped, seen, maxFiles, extra, maxExtraBytes, (n) => {
      notMarkdownCount += n
    })
    if (hitCap) {
      truncated = true
      break
    }
  }
  return { files, skipped, truncated, maxFiles, notMarkdownCount }
}

function uniqueContainingRoots(roots: string[]): string[] {
  const resolved = [...new Set(roots.map((item) => path.resolve(item)))]
  return resolved.filter((root, index) =>
    resolved.every((other, otherIndex) => otherIndex === index || !isUnderRoot(other, root)),
  )
}

async function walk(
  root: string,
  current: string,
  files: SourceMarkdown[],
  skipped: ScanSkip[],
  seen: Set<string>,
  maxFiles: number,
  extraExtensions: Set<string>,
  maxExtraBytes: number,
  onNotMarkdown: (count: number) => void,
): Promise<boolean> {
  if (files.length >= maxFiles) return true
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (files.length >= maxFiles) return true
    const abs = path.join(current, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      const hitCap = await walk(root, abs, files, skipped, seen, maxFiles, extraExtensions, maxExtraBytes, onNotMarkdown)
      if (hitCap) return true
      continue
    }
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    const extra = extraExtensions.has(ext)
    if (ext !== '.md' && !extra) {
      onNotMarkdown(1)
      continue
    }
    const rel = posixRel(root, abs)
    if (SKIP_FILES.has(entry.name)) {
      skipped.push({ abs, rel, reason: 'skip-file' })
      continue
    }
    if (seen.has(abs)) continue
    try {
      const info = await stat(abs)
      const limit = extra ? maxExtraBytes : MAX_SOURCE_BYTES
      if (info.size > limit) {
        skipped.push({ abs, rel, reason: 'too-large' })
        continue
      }
    } catch {
      skipped.push({ abs, rel, reason: 'unreadable' })
      continue
    }
    seen.add(abs)
    files.push({ abs, root, rel })
  }
  return files.length >= maxFiles
}
