import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from '../frontmatter.js'
import { PAGE_DIRS, RAW_DIRS } from '../layout.js'
import { posixRel } from '../paths.js'
import { MAX_SOURCE_FILES } from '../scan.js'
import { listMarkdownFiles, sha256 } from '../store.js'
import { loadLinkedPages, type LinkedPage } from '../backlinks.js'

export const MAX_REVIEW_PAGES = MAX_SOURCE_FILES

export interface RawDoc {
  abs: string
  rel: string
  storedHash?: string
  actualHash: string
  hashDrift: boolean
  hashMissing: boolean
}

export interface ReviewCorpus {
  pages: LinkedPage[]
  raws: RawDoc[]
  rawByRel: Map<string, RawDoc>
  indexMd: string
  truncated: boolean
  maxPages: number
}

export async function loadReviewCorpus(root: string, maxPages = MAX_REVIEW_PAGES): Promise<ReviewCorpus> {
  const pageFiles = await listMarkdownFiles(root, PAGE_DIRS)
  const truncated = pageFiles.length > maxPages
  const limited = truncated ? pageFiles.slice(0, maxPages) : pageFiles
  const pages = await loadLinkedPages(root, limited)

  const rawFiles = await listMarkdownFiles(root, RAW_DIRS)
  const raws: RawDoc[] = []
  const rawByRel = new Map<string, RawDoc>()
  for (const abs of rawFiles) {
    const text = await readFile(abs, 'utf8')
    const parsed = parseFrontmatter(text)
    const stored = typeof parsed.frontmatter.sha256 === 'string' ? parsed.frontmatter.sha256 : undefined
    const actualHash = sha256(parsed.body)
    const doc: RawDoc = {
      abs,
      rel: posixRel(root, abs),
      storedHash: stored,
      actualHash,
      hashMissing: !stored,
      hashDrift: Boolean(stored && stored !== actualHash),
    }
    raws.push(doc)
    rawByRel.set(doc.rel, doc)
  }

  let indexMd = ''
  try {
    indexMd = await readFile(path.join(root, 'index.md'), 'utf8')
  } catch {
    indexMd = ''
  }

  return { pages, raws, rawByRel, indexMd, truncated, maxPages }
}
