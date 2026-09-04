import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter, slugify, todayStamp } from './frontmatter.js'
import { indexTemplate, logTemplate, schemaTemplate } from './layout.js'
import { builtinPack, indexHeading, inferTypeFromPath, loadVaultPack, rawDirsOf, writeVaultPack } from './pack/index.js'
import type { PageType, RawKind } from './pack/types.js'
import { assertNoSymlinkEscape, isRawRel, posixRel, resolveUnder } from './paths.js'
import { findRawByHash, rememberRawHash } from './raw-index.js'
import type { SourceRootOrigin, SourceRootRef } from './source-roots.js'

export interface StatusReport {
  ok: true
  initialized: boolean
  root: string
  pageCount: number
  rawCount: number
  indexUpdated: string | null
  sourceRoots: Array<{ path: string; readable: boolean; origin: SourceRootOrigin }>
}

export interface IngestResult {
  ok: true
  deduped: boolean
  rawPath: string
  sha256: string
  title: string
  compileHint: string
  originalPath?: string
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function sha256Bytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export async function hashRawDocument(
  root: string,
  parsed: ReturnType<typeof parseFrontmatter>,
): Promise<string> {
  const original = typeof parsed.frontmatter.original === 'string' ? parsed.frontmatter.original.trim() : ''
  if (!original) return sha256(parsed.body)
  try {
    if (!isRawRel(original)) return ''
    return sha256Bytes(await readFile(resolveUnder(root, original)))
  } catch {
    return ''
  }
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function isInitialized(root: string): Promise<boolean> {
  try {
    const info = await stat(path.join(root, 'SCHEMA.md'))
    return info.isFile()
  } catch {
    return false
  }
}

export async function initVault(
  root: string,
  domain: string,
  options: { pack?: string } = {},
): Promise<{ ok: true; created: boolean; root: string; pack: string }> {
  await ensureDir(root)
  const existed = await isInitialized(root)
  const pack = existed ? await loadVaultPack(root) : builtinPack(options.pack ?? 'writer')
  if (!existed) await writeVaultPack(root, pack)
  for (const dir of [...pack.pageDirs, ...rawDirsOf(pack)]) {
    await ensureDir(path.join(root, dir))
  }
  if (!existed) {
    const today = todayStamp()
    await writeFile(path.join(root, 'SCHEMA.md'), schemaTemplate(domain, pack), 'utf8')
    await writeFile(path.join(root, 'index.md'), indexTemplate(domain, today, pack), 'utf8')
    await writeFile(path.join(root, 'log.md'), logTemplate(today, domain, pack), 'utf8')
  }
  return { ok: true, created: !existed, root, pack: pack.id }
}

async function countMarkdown(root: string, relDir: string): Promise<number> {
  const dir = path.join(root, relDir)
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).length
  } catch {
    return 0
  }
}

export async function status(root: string, sourceRoots: Array<string | SourceRootRef>): Promise<StatusReport> {
  const initialized = await isInitialized(root)
  let indexUpdated: string | null = null
  try {
    indexUpdated = (await stat(path.join(root, 'index.md'))).mtime.toISOString()
  } catch {
    indexUpdated = null
  }
  let pageCount = 0
  let rawCount = 0
  if (initialized) {
    const pack = await loadVaultPack(root)
    for (const dir of pack.pageDirs) pageCount += await countMarkdown(root, dir)
    for (const dir of rawDirsOf(pack)) rawCount += await countMarkdown(root, dir)
  }
  const roots = await Promise.all(
    sourceRoots.map(async (item) => {
      const pathValue = typeof item === 'string' ? item : item.path
      const origin: SourceRootOrigin = typeof item === 'string' ? 'plugin' : item.origin
      try {
        const info = await stat(pathValue)
        return { path: pathValue, readable: info.isDirectory(), origin }
      } catch {
        return { path: pathValue, readable: false, origin }
      }
    }),
  )
  return {
    ok: true,
    initialized,
    root,
    pageCount,
    rawCount,
    indexUpdated,
    sourceRoots: roots,
  }
}

export async function readPage(root: string, rel: string, offset?: number, limit?: number): Promise<{ ok: true; path: string; content: string }> {
  const abs = resolveUnder(root, rel)
  await assertNoSymlinkEscape(root, abs)
  const content = await readFile(abs, 'utf8')
  if (offset === undefined && limit === undefined) {
    return { ok: true, path: posixRel(root, abs), content }
  }
  const lines = content.split('\n')
  const start = Math.max(0, offset ?? 0)
  const end = limit === undefined ? lines.length : start + Math.max(0, limit)
  return { ok: true, path: posixRel(root, abs), content: lines.slice(start, end).join('\n') }
}

function isRawPath(rel: string): boolean {
  return isRawRel(rel)
}

export async function writePage(
  root: string,
  rel: string,
  content: string,
  options: { log?: string; updateIndex?: boolean } = {},
): Promise<{ ok: true; path: string; logged: boolean; indexed: boolean }> {
  if (isRawPath(rel)) {
    throw new Error('refusing to write under raw/; raw sources are immutable')
  }
  const abs = resolveUnder(root, rel)
  await assertNoSymlinkEscape(root, path.dirname(abs))
  await ensureDir(path.dirname(abs))
  await writeFile(abs, content, 'utf8')
  let logged = false
  let indexed = false
  if (options.log?.trim()) {
    await appendLog(root, options.log.trim())
    logged = true
  }
  if (options.updateIndex) {
    const parsed = parseFrontmatter(content)
    const title = String(parsed.frontmatter.title ?? path.basename(rel, '.md'))
    const type = (parsed.frontmatter.type as PageType | undefined) ?? (await inferTypeFromPathAsync(root, rel))
    await addIndexEntry(root, rel, title, type)
    indexed = true
  }
  return { ok: true, path: posixRel(root, abs), logged, indexed }
}

async function inferTypeFromPathAsync(root: string, rel: string): Promise<PageType> {
  return inferTypeFromPath(rel, await loadVaultPack(root))
}

export async function appendLog(root: string, entry: string): Promise<void> {
  const abs = path.join(root, 'log.md')
  let existing = ''
  try {
    existing = await readFile(abs, 'utf8')
  } catch {
    existing = '# 文脉日志\n\n'
  }
  const block = entry.startsWith('## ') ? `${entry.trim()}\n` : `## [${todayStamp()}] ${entry.trim()}\n`
  const next = existing.endsWith('\n') ? `${existing}${block}\n` : `${existing}\n${block}\n`
  await writeFile(abs, next, 'utf8')
}

async function addIndexEntry(root: string, rel: string, title: string, type: PageType): Promise<void> {
  const abs = path.join(root, 'index.md')
  const pack = await loadVaultPack(root)
  let index = await readFile(abs, 'utf8').catch(() => indexTemplate('unknown', todayStamp(), pack))
  const heading = indexHeading(pack, type)
  const slug = path.basename(rel, '.md')
  const line = `- [[${slug}]] — ${title}`
  if (index.includes(`[[${slug}]]`)) return
  if (!index.includes(heading)) {
    index = `${index.trimEnd()}\n\n${heading}\n\n${line}\n`
  } else {
    const parts = index.split(heading)
    const before = parts[0] ?? ''
    const after = parts.slice(1).join(heading)
    const nextHeading = after.search(/\n## /)
    if (nextHeading === -1) {
      index = `${before}${heading}${after.trimEnd()}\n${line}\n`
    } else {
      const section = after.slice(0, nextHeading).trimEnd()
      const rest = after.slice(nextHeading)
      index = `${before}${heading}${section}\n${line}\n${rest}`
    }
  }
  index = index.replace(/- Total pages: \d+/, `- Total pages: ${countIndexLinks(index)}`)
  index = index.replace(/- Last updated: .*/, `- Last updated: ${todayStamp()}`)
  await writeFile(abs, index, 'utf8')
}

function countIndexLinks(index: string): number {
  return [...index.matchAll(/\[\[([^\]]+)\]\]/g)].length
}

export { findRawByHash } from './raw-index.js'

export function titleFromMarkdown(body: string, fallback: string): string {
  const parsed = parseFrontmatter(body)
  const fromFront = typeof parsed.frontmatter.title === 'string' ? parsed.frontmatter.title.trim() : ''
  if (fromFront) return fromFront
  const heading = parsed.body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || fallback
}

export async function ingestText(
  root: string,
  options: {
    title: string
    body: string
    kind?: RawKind
    sourcePath?: string
    sourceUrl?: string
    appendLogEntry?: boolean
    original?: { bytes: Uint8Array; ext: string; adapter: string }
  },
): Promise<IngestResult> {
  if (!(await isInitialized(root))) {
    throw new Error('vault is not initialized; call wenmai_init first')
  }
  const pack = await loadVaultPack(root)
  const kind: RawKind = options.kind ?? (options.sourcePath ? 'workspace' : 'articles')
  if (!pack.rawKinds.includes(kind)) {
    throw new Error(`kind must be ${pack.rawKinds.join(' | ')}`)
  }
  const body = `${options.body.trimEnd()}\n`
  const origExt = options.original?.ext.toLowerCase() ?? ''
  if (options.original && !origExt.startsWith('.')) {
    throw new Error('original ext must include the leading dot')
  }
  const hash = options.original ? sha256Bytes(options.original.bytes) : sha256(body)
  const existing = await findRawByHash(root, hash)
  if (existing) {
    return {
      ok: true,
      deduped: true,
      rawPath: existing,
      sha256: hash,
      title: options.title,
      compileHint: compileHint(existing),
    }
  }
  const slug = slugify(options.title)
  const rel = `raw/${kind}/${slug}.md`
  const origRel = options.original ? `raw/${kind}/${slug}${origExt}` : undefined
  const abs = resolveUnder(root, rel)
  await assertNoSymlinkEscape(root, path.dirname(abs))
  await ensureDir(path.dirname(abs))
  if (options.original && origRel) {
    await writeFile(resolveUnder(root, origRel), options.original.bytes)
  }
  const header = [
    '---',
    options.sourceUrl ? `source_url: ${options.sourceUrl}` : null,
    options.sourcePath ? `source_path: ${options.sourcePath}` : null,
    `ingested: ${todayStamp()}`,
    `sha256: ${hash}`,
    options.original ? `adapter: ${options.original.adapter}` : null,
    origRel ? `original: ${origRel}` : null,
    '---',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n')
  await writeFile(abs, `${header}${body}`, 'utf8')
  await rememberRawHash(root, hash, rel)
  if (options.appendLogEntry !== false) {
    await appendLog(root, `ingest | ${options.title}\n- raw: ${rel}\n- sha256: ${hash}`)
  }
  const result: IngestResult = {
    ok: true,
    deduped: false,
    rawPath: rel,
    sha256: hash,
    title: options.title,
    compileHint: compileHint(rel),
  }
  if (origRel) result.originalPath = origRel
  return result
}

function compileHint(rawPath: string): string {
  return [
    `Raw source saved at ${rawPath} (immutable).`,
    'Compile it into entities/concepts pages with wenmai_write.',
    'Cross-link with [[wikilinks]], cite this raw path in frontmatter sources, then update index.md and log.md.',
    'Do not rewrite files under raw/.',
  ].join(' ')
}

export async function listMarkdownFiles(root: string, relDirs: readonly string[]): Promise<string[]> {
  const files: string[] = []
  for (const dir of relDirs) {
    const absDir = path.join(root, dir)
    let entries: string[] = []
    try {
      entries = await readdir(absDir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.md')) continue
      files.push(path.join(absDir, name))
    }
  }
  return files
}

export { sha256 }
