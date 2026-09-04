import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { extractWikilinks, parseFrontmatter } from './frontmatter.js'
import { loadVaultPack } from './pack/index.js'
import { isUnderRoot, posixRel } from './paths.js'
import { listSourceMarkdown } from './scan.js'
import { isInitialized, listMarkdownFiles } from './store.js'
import { copyGraphAssets, renderGraphHtml } from './graph-view.js'

export { renderGraphHtml }

export const GRAPH_FILE = 'graph.html'

export type GraphNodeKind = 'page' | 'article' | 'folder' | 'tag' | 'source' | 'missing'

export interface GraphNode {
  id: string
  label: string
  kind: GraphNodeKind
  type?: string
  path?: string
  degree: number
}

export interface GraphEdge {
  source: string
  target: string
  kind: 'wikilink' | 'source' | 'tag' | 'folder' | 'mdlink'
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  generatedAt: string
}

export interface GraphViewOptions {
  focus?: string
  depth?: number
  includeTags?: boolean
  includeSources?: boolean
  includeMissing?: boolean
  includeArticles?: boolean
  sourceRoots?: string[]
}

export interface GraphBuildResult {
  ok: true
  htmlPath: string
  fileUrl: string
  nodeCount: number
  edgeCount: number
  pageCount: number
  articleCount: number
  truncated: boolean
  hubs: Array<{ id: string; label: string; degree: number }>
  isolates: Array<{ id: string; label: string }>
  mermaid: string
}

function slugOf(link: string): string {
  return path.basename(link.trim()).replace(/\.md$/i, '')
}

function tagId(tag: string): string {
  return `tag:${tag.trim()}`
}

function sourceId(rel: string): string {
  return `source:${rel.replace(/\\/g, '/')}`
}

function folderId(abs: string): string {
  return `folder:${abs}`
}

function articleId(rel: string): string {
  return `article:${rel.replace(/\\/g, '/')}`
}

function extractMarkdownHrefs(text: string, fromAbs: string): string[] {
  const hrefs: string[] = []
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const raw = (match[1] ?? '').trim().replace(/^<|>$/g, '')
    const href = raw.split('#')[0]?.split('?')[0]?.trim() ?? ''
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//')) continue
    if (!href.toLowerCase().endsWith('.md')) continue
    hrefs.push(path.resolve(path.dirname(fromAbs), decodeURIComponent(href)))
  }
  return hrefs
}

function titleOf(text: string, fallback: string): string {
  const parsed = parseFrontmatter(text)
  if (typeof parsed.frontmatter.title === 'string' && parsed.frontmatter.title.trim()) {
    return parsed.frontmatter.title.trim()
  }
  const heading = parsed.body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || fallback
}

export function filterLocalGraph(graph: KnowledgeGraph, focus: string, depth: number): KnowledgeGraph {
  const start = slugOf(focus)
  const needle = focus.trim().toLowerCase()
  const focusId = graph.nodes.some((node) => node.id === start)
    ? start
    : graph.nodes.find((node) => node.id === `article:${start}` || node.label.toLowerCase().includes(needle) || node.id.toLowerCase().includes(needle))
        ?.id
  if (!focusId) return { ...graph, nodes: [], edges: [] }
  const hops = Math.max(0, Math.min(6, Math.floor(depth)))
  const keep = new Set<string>([focusId])
  let frontier = [focusId]
  for (let i = 0; i < hops; i += 1) {
    const next: string[] = []
    for (const edge of graph.edges) {
      if (keep.has(edge.source) && !keep.has(edge.target)) {
        keep.add(edge.target)
        next.push(edge.target)
      }
      if (keep.has(edge.target) && !keep.has(edge.source)) {
        keep.add(edge.source)
        next.push(edge.source)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  const nodes = graph.nodes.filter((node) => keep.has(node.id))
  const edges = graph.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target))
  return { nodes, edges, generatedAt: graph.generatedAt }
}

export async function buildKnowledgeGraph(root: string, options: GraphViewOptions = {}): Promise<KnowledgeGraph> {
  const includeTags = options.includeTags !== false
  const includeSources = options.includeSources !== false
  const includeMissing = options.includeMissing !== false
  const includeArticles = options.includeArticles !== false
  const pack = await loadVaultPack(root)
  const files = await listMarkdownFiles(root, pack.pageDirs)
  const known = new Map<string, { path: string; title: string; type: string; tags: string[]; sources: string[] }>()

  for (const abs of files) {
    const rel = posixRel(root, abs)
    const slug = path.basename(abs, '.md')
    const parsed = parseFrontmatter(await readFile(abs, 'utf8'))
    const tags = Array.isArray(parsed.frontmatter.tags)
      ? parsed.frontmatter.tags.map(String).filter(Boolean)
      : []
    const sources = Array.isArray(parsed.frontmatter.sources)
      ? parsed.frontmatter.sources.map(String).filter(Boolean)
      : []
    known.set(slug, {
      path: rel,
      title: String(parsed.frontmatter.title ?? slug),
      type: String(parsed.frontmatter.type ?? 'concept'),
      tags,
      sources,
    })
  }

  const nodeMap = new Map<string, GraphNode>()
  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []

  const addNode = (node: Omit<GraphNode, 'degree'>) => {
    if (!nodeMap.has(node.id)) nodeMap.set(node.id, { ...node, degree: 0 })
  }
  const addEdge = (source: string, target: string, kind: GraphEdge['kind']) => {
    if (source === target) return
    const key = `${kind}|${source}|${target}`
    if (edgeSet.has(key)) return
    edgeSet.add(key)
    edges.push({ source, target, kind })
  }

  for (const [slug, meta] of known) {
    addNode({ id: slug, label: meta.title, kind: 'page', type: meta.type, path: meta.path })
  }

  for (const abs of files) {
    const slug = path.basename(abs, '.md')
    const text = await readFile(abs, 'utf8')
    const meta = known.get(slug)
    for (const link of extractWikilinks(text)) {
      const target = slugOf(link)
      if (known.has(target)) {
        addEdge(slug, target, 'wikilink')
        continue
      }
      if (!includeMissing) continue
      addNode({ id: target, label: target, kind: 'missing' })
      addEdge(slug, target, 'wikilink')
    }
    if (includeTags && meta) {
      for (const tag of meta.tags) {
        const id = tagId(tag)
        addNode({ id, label: `#${tag}`, kind: 'tag' })
        addEdge(slug, id, 'tag')
      }
    }
    if (includeSources && meta) {
      for (const source of meta.sources) {
        const id = sourceId(source)
        addNode({ id, label: path.basename(source), kind: 'source', path: source })
        addEdge(id, slug, 'source')
      }
    }
  }

  if (includeArticles && options.sourceRoots && options.sourceRoots.length > 0) {
    const articles = await listSourceMarkdown(options.sourceRoots)
    const byAbs = new Map<string, string>()
    const bySlug = new Map<string, string[]>()

    for (const file of articles) {
      const id = articleId(file.rel)
      const text = await readFile(file.abs, 'utf8').catch(() => '')
      const label = titleOf(text, path.basename(file.abs, '.md'))
      addNode({ id, label, kind: 'article', type: 'article', path: file.rel })
      byAbs.set(path.resolve(file.abs), id)
      const slug = path.basename(file.abs, '.md')
      const slugs = bySlug.get(slug) ?? []
      slugs.push(id)
      bySlug.set(slug, slugs)

      let dir = path.dirname(file.abs)
      let childId = id
      const stop = path.resolve(file.root)
      while (dir === stop || isUnderRoot(stop, dir)) {
        const fid = folderId(dir)
        addNode({
          id: fid,
          label: dir === stop ? path.basename(dir) : path.basename(dir),
          kind: 'folder',
          type: 'folder',
          path: posixRel(file.root, dir) || path.basename(dir),
        })
        addEdge(childId, fid, 'folder')
        if (dir === stop) break
        childId = fid
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    }

    for (const file of articles) {
      const id = articleId(file.rel)
      const text = await readFile(file.abs, 'utf8').catch(() => '')
      const parsed = parseFrontmatter(text)
      for (const link of extractWikilinks(text)) {
        const targetSlug = slugOf(link)
        if (known.has(targetSlug)) {
          addEdge(id, targetSlug, 'wikilink')
          continue
        }
        const candidates = bySlug.get(targetSlug) ?? []
        if (candidates.length === 1) addEdge(id, candidates[0] ?? id, 'wikilink')
      }
      for (const href of extractMarkdownHrefs(text, file.abs)) {
        const target = byAbs.get(href)
        if (target) addEdge(id, target, 'mdlink')
      }
      if (includeTags && Array.isArray(parsed.frontmatter.tags)) {
        for (const tag of parsed.frontmatter.tags.map(String).filter(Boolean)) {
          const tid = tagId(tag)
          addNode({ id: tid, label: `#${tag}`, kind: 'tag' })
          addEdge(id, tid, 'tag')
        }
      }
    }
  }

  for (const edge of edges) {
    const from = nodeMap.get(edge.source)
    const to = nodeMap.get(edge.target)
    if (from) from.degree += 1
    if (to) to.degree += 1
  }

  let graph: KnowledgeGraph = {
    nodes: [...nodeMap.values()],
    edges,
    generatedAt: new Date().toISOString(),
  }
  if (options.focus?.trim()) {
    graph = filterLocalGraph(graph, options.focus.trim(), options.depth ?? 2)
  }
  return graph
}

export function mermaidFromGraph(graph: KnowledgeGraph, limit = 40): string {
  const linkable = new Set(
    graph.nodes.filter((node) => node.kind === 'page' || node.kind === 'article').map((node) => node.id),
  )
  const safe = (id: string) => id.replace(/[^A-Za-z0-9_]/g, '_') || 'n'
  const label = (id: string) => {
    const text = graph.nodes.find((node) => node.id === id)?.label ?? id
    return text.replace(/"/g, "'")
  }
  const lines = ['graph LR']
  let count = 0
  for (const edge of graph.edges) {
    if (edge.kind !== 'wikilink' && edge.kind !== 'mdlink') continue
    if (!linkable.has(edge.source) || !linkable.has(edge.target)) continue
    lines.push(`  ${safe(edge.source)}["${label(edge.source)}"] --> ${safe(edge.target)}["${label(edge.target)}"]`)
    count += 1
    if (count >= limit) {
      lines.push('  %% truncated')
      break
    }
  }
  if (count === 0) lines.push('  isolated["还没有页面互链"]')
  return lines.join('\n')
}

export async function writeGraphHtml(root: string, options: GraphViewOptions = {}): Promise<GraphBuildResult> {
  if (!(await isInitialized(root))) {
    throw new Error('vault is not initialized; call wenmai_init first')
  }
  const graph = await buildKnowledgeGraph(root, options)
  const htmlPath = path.join(root, GRAPH_FILE)
  await copyGraphAssets(root)
  await writeFile(htmlPath, renderGraphHtml(graph), 'utf8')
  const pages = graph.nodes.filter((node) => node.kind === 'page')
  const articles = graph.nodes.filter((node) => node.kind === 'article')
  const ranked = [...pages, ...articles].sort((a, b) => b.degree - a.degree)
  const hubs = ranked.slice(0, 8).map((node) => ({
    id: node.id,
    label: node.label,
    degree: node.degree,
  }))
  const isolates = ranked.filter((node) => node.degree === 0).slice(0, 20).map((node) => ({ id: node.id, label: node.label }))
  return {
    ok: true,
    htmlPath,
    fileUrl: `file://${htmlPath}`,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    pageCount: pages.length,
    articleCount: articles.length,
    truncated: articles.length >= 600,
    hubs,
    isolates,
    mermaid: mermaidFromGraph(graph),
  }
}
