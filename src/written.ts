import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { PAGE_DIRS } from './layout.js'
import { posixRel } from './paths.js'
import { SKIP_DIRS } from './scan.js'
import { listMarkdownFiles } from './store.js'

export interface WrittenHit {
  kind: 'page' | 'source'
  path: string
  title: string
  snippet: string
}

function matches(query: string, ...parts: string[]): boolean {
  const q = query.toLowerCase()
  return parts.some((part) => part.toLowerCase().includes(q))
}

export async function findWritten(
  root: string,
  sourceRoots: string[],
  query: string,
  limit = 20,
): Promise<WrittenHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const hits: WrittenHit[] = []

  const pages = await listMarkdownFiles(root, PAGE_DIRS)
  for (const abs of pages) {
    const text = await readFile(abs, 'utf8')
    const parsed = parseFrontmatter(text)
    const title = String(parsed.frontmatter.title ?? path.basename(abs, '.md'))
    if (!matches(trimmed, title, path.basename(abs), parsed.body.slice(0, 2000))) continue
    hits.push({
      kind: 'page',
      path: posixRel(root, abs),
      title,
      snippet: parsed.body.replace(/\s+/g, ' ').trim().slice(0, 160),
    })
    if (hits.length >= limit) return hits
  }

  for (const sourceRoot of sourceRoots) {
    await walkSources(sourceRoot, sourceRoot, trimmed, hits, limit)
    if (hits.length >= limit) break
  }
  return hits.slice(0, limit)
}

async function walkSources(
  root: string,
  current: string,
  query: string,
  hits: WrittenHit[],
  limit: number,
): Promise<void> {
  if (hits.length >= limit) return
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (hits.length >= limit) return
    const abs = path.join(current, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walkSources(root, abs, query, hits, limit)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    try {
      const info = await stat(abs)
      if (info.size > 512 * 1024) continue
    } catch {
      continue
    }
    const rel = posixRel(root, abs)
    if (!matches(query, entry.name, rel)) {
      const text = await readFile(abs, 'utf8').catch(() => '')
      const heading = text.match(/^#\s+(.+)$/m)?.[1] ?? ''
      if (!matches(query, heading, text.slice(0, 400))) continue
      hits.push({
        kind: 'source',
        path: abs,
        title: heading || path.basename(abs, '.md'),
        snippet: heading || rel,
      })
      continue
    }
    hits.push({
      kind: 'source',
      path: abs,
      title: path.basename(abs, '.md'),
      snippet: rel,
    })
  }
}
