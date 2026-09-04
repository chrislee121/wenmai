import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isArchived, parseFrontmatter } from './frontmatter.js'
import { loadVaultPack, rawDirsOf } from './pack/index.js'
import { posixRel } from './paths.js'
import { listMarkdownFiles } from './store.js'

export interface SearchHit {
  path: string
  title: string
  snippet: string
  score: number
}

function ripgrepAvailable(): boolean {
  const result = spawnSync('rg', ['--version'], { encoding: 'utf8' })
  return result.status === 0
}

function snippetAround(text: string, query: string, max = 180): string {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const index = lower.indexOf(q)
  if (index === -1) return text.replace(/\s+/g, ' ').slice(0, max)
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + query.length + 80)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

async function nodeSearch(root: string, query: string, limit: number): Promise<SearchHit[]> {
  const pack = await loadVaultPack(root)
  const files = await listMarkdownFiles(root, [...pack.pageDirs, ...rawDirsOf(pack)])
  const q = query.toLowerCase()
  const hits: SearchHit[] = []
  for (const abs of files) {
    const text = await readFile(abs, 'utf8')
    const parsed = parseFrontmatter(text)
    if (isArchived(parsed.frontmatter) && pack.pageDirs.some((dir) => posixRel(root, abs).startsWith(`${dir}/`))) continue
    const haystack = `${parsed.frontmatter.title ?? ''} ${path.basename(abs)} ${parsed.body}`
    const lower = haystack.toLowerCase()
    if (!lower.includes(q)) continue
    const score = lower.split(q).length - 1
    hits.push({
      path: posixRel(root, abs),
      title: String(parsed.frontmatter.title ?? path.basename(abs, '.md')),
      snippet: snippetAround(text, query),
      score,
    })
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return hits.slice(0, limit)
}

function ripgrepSearch(root: string, query: string, limit: number): SearchHit[] | null {
  if (!ripgrepAvailable()) return null
  const result = spawnSync(
    'rg',
    ['-i', '-n', '--glob', '*.md', '--max-count', '5', '--json', query, root],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  )
  if (result.status !== 0 && result.status !== 1) return null
  const grouped = new Map<string, SearchHit>()
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as {
        type?: string
        data?: { path?: { text?: string }; lines?: { text?: string } }
      }
      if (event.type !== 'match' || !event.data?.path?.text) continue
      const abs = event.data.path.text
      const rel = posixRel(root, abs)
      const snippet = (event.data.lines?.text ?? '').trim()
      const existing = grouped.get(rel)
      if (existing) {
        existing.score += 1
        continue
      }
      grouped.set(rel, {
        path: rel,
        title: path.basename(rel, '.md'),
        snippet,
        score: 1,
      })
    } catch {
      continue
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
}

export async function searchVault(root: string, query: string, limit = 20): Promise<SearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const viaRg = ripgrepSearch(root, trimmed, limit)
  const hits = viaRg ?? (await nodeSearch(root, trimmed, limit))
  return filterArchivedHits(root, hits)
}

async function filterArchivedHits(root: string, hits: SearchHit[]): Promise<SearchHit[]> {
  const pack = await loadVaultPack(root)
  const kept: SearchHit[] = []
  for (const hit of hits) {
    if (!pack.pageDirs.some((dir) => hit.path.startsWith(`${dir}/`))) {
      kept.push(hit)
      continue
    }
    try {
      const text = await readFile(path.join(root, hit.path), 'utf8')
      if (isArchived(parseFrontmatter(text).frontmatter)) continue
    } catch {
      /* keep the hit if the file cannot be read */
    }
    kept.push(hit)
  }
  return kept
}
