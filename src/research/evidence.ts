import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from '../frontmatter.js'
import { loadVaultPack, rawDirsOf } from '../pack/index.js'
import { posixRel } from '../paths.js'
import { listSourceMarkdown } from '../scan.js'
import { listMarkdownFiles } from '../store.js'

export interface EvidenceHit {
  path: string
  title: string
  snippet: string
  score: number
  kind: 'raw' | 'source' | 'page'
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

function titleOf(abs: string, text: string): string {
  const parsed = parseFrontmatter(text)
  const fromFront = typeof parsed.frontmatter.title === 'string' ? parsed.frontmatter.title.trim() : ''
  if (fromFront) return fromFront
  const heading = parsed.body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || path.basename(abs, '.md')
}

function matches(text: string, query: string): number {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 0
  if (!lower.includes(q)) return 0
  return lower.split(q).length - 1
}

async function scoreFile(
  abs: string,
  displayPath: string,
  kind: EvidenceHit['kind'],
  terms: string[],
): Promise<EvidenceHit | null> {
  const text = await readFile(abs, 'utf8').catch(() => '')
  if (!text) return null
  let score = 0
  let matched = ''
  for (const term of terms) {
    const n = matches(`${titleOf(abs, text)}\n${text}`, term)
    if (n > score) {
      score = n
      matched = term
    }
  }
  if (score === 0) return null
  return {
    path: displayPath,
    title: titleOf(abs, text),
    snippet: snippetAround(text, matched || terms[0] || ''),
    score,
    kind,
  }
}

export async function gatherEvidence(
  root: string,
  sourceRoots: string[],
  terms: string[],
  packPageDirs: readonly string[],
  limit = 20,
): Promise<EvidenceHit[]> {
  const pack = await loadVaultPack(root)
  const hits = new Map<string, EvidenceHit>()
  const add = (hit: EvidenceHit | null): void => {
    if (!hit) return
    const existing = hits.get(hit.path)
    if (!existing || hit.score > existing.score) hits.set(hit.path, hit)
  }

  const rawFiles = await listMarkdownFiles(root, rawDirsOf(pack))
  for (const abs of rawFiles) {
    add(await scoreFile(abs, posixRel(root, abs), 'raw', terms))
  }

  const pageFiles = await listMarkdownFiles(root, packPageDirs)
  for (const abs of pageFiles) {
    add(await scoreFile(abs, posixRel(root, abs), 'page', terms))
  }

  const extraRoots = sourceRoots.filter((item) => path.resolve(item) !== path.resolve(root))
  if (extraRoots.length > 0) {
    const sources = await listSourceMarkdown(extraRoots)
    for (const file of sources) {
      add(await scoreFile(file.abs, file.abs, 'source', terms))
    }
  }

  return [...hits.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit)
}
