import path from 'node:path'
import { extractWikilinks, parseFrontmatter } from './frontmatter.js'
import { PAGE_DIRS } from './layout.js'
import { posixRel } from './paths.js'
import { listMarkdownFiles } from './store.js'
import { readFile } from 'node:fs/promises'

export function slugOf(link: string): string {
  return path.basename(link.trim()).replace(/\.md$/i, '')
}

export function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/').replace(/^\.\//, '').trim()
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

export interface LinkedPage {
  abs: string
  rel: string
  slug: string
  title: string
  sources: string[]
  outgoing: string[]
  text: string
  body: string
  tags: string[]
  updated?: string
  lineCount: number
}

export interface BacklinkIndex {
  pages: LinkedPage[]
  bySlug: Map<string, LinkedPage>
  /** raw posix path → compiled page rels that cite it in `sources` */
  rawToPages: Map<string, string[]>
  /** page slug → rels of pages that [[wikilink]] to it */
  incoming: Map<string, string[]>
}

export function buildBacklinkIndex(pages: LinkedPage[]): BacklinkIndex {
  const bySlug = new Map<string, LinkedPage>()
  const rawToPages = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()

  for (const page of pages) {
    bySlug.set(page.slug, page)
    for (const source of page.sources) {
      const key = normalizeRel(source)
      const list = rawToPages.get(key) ?? []
      list.push(page.rel)
      rawToPages.set(key, list)
    }
  }

  for (const page of pages) {
    for (const target of page.outgoing) {
      if (!bySlug.has(target)) continue
      const list = incoming.get(target) ?? []
      list.push(page.rel)
      incoming.set(target, list)
    }
  }

  return { pages, bySlug, rawToPages, incoming }
}

export async function loadLinkedPages(root: string, files: string[]): Promise<LinkedPage[]> {
  const pages: LinkedPage[] = []
  for (const abs of files) {
    const text = await readFile(abs, 'utf8')
    const parsed = parseFrontmatter(text)
    const rel = posixRel(root, abs)
    const slug = path.basename(abs, '.md')
    const title =
      typeof parsed.frontmatter.title === 'string' && parsed.frontmatter.title.trim()
        ? parsed.frontmatter.title.trim()
        : slug
    const updated = typeof parsed.frontmatter.updated === 'string' ? parsed.frontmatter.updated : undefined
    pages.push({
      abs,
      rel,
      slug,
      title,
      sources: asStringList(parsed.frontmatter.sources).map(normalizeRel),
      outgoing: extractWikilinks(text).map(slugOf),
      text,
      body: parsed.body,
      tags: asStringList(parsed.frontmatter.tags),
      updated,
      lineCount: text.split('\n').length,
    })
  }
  return pages
}

export async function loadBacklinkIndex(root: string): Promise<BacklinkIndex> {
  const files = await listMarkdownFiles(root, PAGE_DIRS)
  const pages = await loadLinkedPages(root, files)
  return buildBacklinkIndex(pages)
}
