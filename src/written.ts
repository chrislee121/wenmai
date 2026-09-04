import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { buildBacklinkIndex, loadLinkedPages } from './backlinks.js'
import { parseFrontmatter } from './frontmatter.js'
import { loadVaultPack } from './pack/index.js'
import { posixRel } from './paths.js'
import {
  LEXICAL_BLIND_SPOT,
  overlappingPhrases,
  queryCoverage,
  REVIEW_SIMILARITY_THRESHOLD,
} from './review/duplicates.js'
import { SKIP_DIRS } from './scan.js'
import { listMarkdownFiles } from './store.js'
import { overlappingOpenTasks, toWrittenOpenTask } from './tasks/index.js'

export type WrittenVerdict = 'NEW' | 'REVIEW' | 'DUPLICATE'
export type WrittenMatch = 'DUPLICATE' | 'REVIEW'

export interface WrittenHit {
  kind: 'page' | 'source'
  path: string
  title: string
  snippet: string
  similarity?: number
  overlappingPhrases?: string[]
  sources?: string[]
  relatedPages?: string[]
  match?: WrittenMatch
}

export interface WrittenReport {
  ok: true
  query: string
  verdict: WrittenVerdict
  reason: string
  blindSpot: string
  count: number
  hits: WrittenHit[]
  openTasks?: ReturnType<typeof toWrittenOpenTask>[]
}

const DUPLICATE_COVERAGE = 0.5

function matches(query: string, ...parts: string[]): boolean {
  const q = query.toLowerCase()
  return parts.some((part) => part.toLowerCase().includes(q))
}

function isStrongQuery(query: string): boolean {
  const compact = query.replace(/\s+/g, '')
  if (/[\p{Script=Han}]/u.test(compact)) return compact.length >= 2
  return compact.length >= 4
}

function classify(query: string, title: string, haystack: string): { match: WrittenMatch | null; similarity: number } {
  const coverage = queryCoverage(query, `${title}\n${haystack}`)
  const inTitle = matches(query, title)
  const inBody = matches(query, haystack)
  const strong = isStrongQuery(query)
  if (inTitle && strong) return { match: 'DUPLICATE', similarity: Math.max(coverage, 0.9) }
  if (strong && coverage >= DUPLICATE_COVERAGE) return { match: 'DUPLICATE', similarity: coverage }
  if (inTitle || inBody || coverage >= REVIEW_SIMILARITY_THRESHOLD) {
    return { match: 'REVIEW', similarity: Math.max(coverage, inTitle ? 0.6 : 0.3) }
  }
  return { match: null, similarity: coverage }
}

function verdictOf(hits: WrittenHit[]): { verdict: WrittenVerdict; reason: string } {
  if (hits.some((hit) => hit.match === 'DUPLICATE')) {
    return { verdict: 'DUPLICATE', reason: '已有高度重合的成稿或编译页，建议改为更新旧文，而不是新开一篇' }
  }
  if (hits.length > 0) {
    return { verdict: 'REVIEW', reason: '疑似重合，动笔前先看这些旧稿' }
  }
  return { verdict: 'NEW', reason: '词法范围内没有明显旧稿。换词重写仍可能漏检，见 blindSpot' }
}

export async function checkWritten(
  root: string,
  sourceRoots: string[],
  query: string,
  limit = 20,
): Promise<WrittenReport> {
  const trimmed = query.trim()
  const empty: WrittenReport = {
    ok: true,
    query: trimmed,
    verdict: 'NEW',
    reason: '查询为空',
    blindSpot: LEXICAL_BLIND_SPOT,
    count: 0,
    hits: [],
  }
  if (!trimmed) return empty

  const pack = await loadVaultPack(root)
  const pageFiles = await listMarkdownFiles(root, pack.pageDirs)
  const pages = await loadLinkedPages(root, pageFiles)
  const index = buildBacklinkIndex(pages)
  const hits: WrittenHit[] = []

  for (const page of pages) {
    if (page.archived) continue
    const haystack = page.body.slice(0, 2000)
    const { match, similarity } = classify(trimmed, page.title, `${path.basename(page.abs)} ${haystack}`)
    if (!match) continue
    hits.push({
      kind: 'page',
      path: page.rel,
      title: page.title,
      snippet: page.body.replace(/\s+/g, ' ').trim().slice(0, 160),
      similarity,
      overlappingPhrases: overlappingPhrases(trimmed, `${page.title}\n${haystack}`),
      sources: page.sources,
      relatedPages: index.incoming.get(page.slug) ?? [],
      match,
    })
  }

  for (const sourceRoot of sourceRoots) {
    await walkSources(sourceRoot, sourceRoot, trimmed, hits, limit)
  }

  hits.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
  const limited = hits.slice(0, limit)
  const { verdict, reason } = verdictOf(limited)
  const openTasks = toWrittenOpenTaskList(await overlappingOpenTasks(root, limited.map((hit) => hit.path)))
  const report: WrittenReport = {
    ok: true,
    query: trimmed,
    verdict,
    reason,
    blindSpot: LEXICAL_BLIND_SPOT,
    count: limited.length,
    hits: limited,
  }
  if (openTasks.length > 0) report.openTasks = openTasks
  return report
}

function toWrittenOpenTaskList(tasks: Awaited<ReturnType<typeof overlappingOpenTasks>>): ReturnType<typeof toWrittenOpenTask>[] {
  return tasks.map(toWrittenOpenTask)
}

export async function findWritten(
  root: string,
  sourceRoots: string[],
  query: string,
  limit = 20,
): Promise<WrittenHit[]> {
  return (await checkWritten(root, sourceRoots, query, limit)).hits
}

async function walkSources(
  root: string,
  current: string,
  query: string,
  hits: WrittenHit[],
  limit: number,
): Promise<void> {
  if (hits.filter((hit) => hit.kind === 'source').length >= limit) return
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
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
    const text = await readFile(abs, 'utf8').catch(() => '')
    const heading = parseFrontmatter(text).body.match(/^#\s+(.+)$/m)?.[1] ?? ''
    const title = heading || path.basename(abs, '.md')
    const { match, similarity } = classify(query, `${title} ${entry.name}`, `${rel}\n${text.slice(0, 400)}`)
    if (!match) continue
    hits.push({
      kind: 'source',
      path: abs,
      title,
      snippet: heading || rel,
      similarity,
      overlappingPhrases: overlappingPhrases(query, `${title}\n${text.slice(0, 400)}`),
      match,
    })
  }
}
