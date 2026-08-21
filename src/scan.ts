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
])

const SKIP_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'SKILL.md'])
const MAX_SOURCE_BYTES = 512 * 1024

export interface SourceMarkdown {
  abs: string
  root: string
  rel: string
}

export async function listSourceMarkdown(roots: string[], maxFiles = 600): Promise<SourceMarkdown[]> {
  const files: SourceMarkdown[] = []
  const seen = new Set<string>()
  const uniqueRoots = uniqueContainingRoots(roots)
  for (const root of uniqueRoots) {
    await walk(root, root, files, seen, maxFiles)
    if (files.length >= maxFiles) break
  }
  return files
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
  seen: Set<string>,
  maxFiles: number,
): Promise<void> {
  if (files.length >= maxFiles) return
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (files.length >= maxFiles) return
    const abs = path.join(current, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      await walk(root, abs, files, seen, maxFiles)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    if (SKIP_FILES.has(entry.name)) continue
    if (seen.has(abs)) continue
    try {
      const info = await stat(abs)
      if (info.size > MAX_SOURCE_BYTES) continue
    } catch {
      continue
    }
    seen.add(abs)
    files.push({ abs, root, rel: posixRel(root, abs) })
  }
}
