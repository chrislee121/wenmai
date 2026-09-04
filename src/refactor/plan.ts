import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { LinkedPage } from '../backlinks.js'
import { loadBacklinkIndex, slugOf } from '../backlinks.js'
import {
  extractWikilinks,
  isArchived,
  parseFrontmatter,
  serializeDocument,
  slugify,
  todayStamp,
  type Frontmatter,
} from '../frontmatter.js'
import { isPageDir, loadVaultPack, typeFromDir, type PackConfig } from '../pack/index.js'
import type { PageType } from '../pack/types.js'
import { isRawRel } from '../paths.js'
import { addIndexSlug, moveIndexSlug, removeIndexSlug, replaceIndexSlug } from './index-sync.js'
import { REFACTOR_OPS, type FilePatch, type RefactorLinkRewrite, type RefactorOp, type RefactorOptions, type RefactorPlan } from './types.js'
import { addWikilinkIfMissing, pageDirOf, rewriteWikilinkSlug, slugFromRel } from './wikilinks.js'

function isCompiledRel(rel: string, pack: PackConfig): boolean {
  const top = pageDirOf(rel)
  return isPageDir(top, pack) && rel.endsWith('.md')
}

function typeFromRel(rel: string, pack: PackConfig): PageType {
  return typeFromDir(pageDirOf(rel), pack)
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/').replace(/^\.\//, '').trim()
}

function assertNotRaw(rel: string): void {
  if (isRawRel(rel)) {
    throw new Error('refusing to refactor under raw/; raw sources are immutable')
  }
}

function guessDir(pages: LinkedPage[], slug: string): string {
  const hit = pages.find((page) => page.slug === slug)
  return hit ? pageDirOf(hit.rel) : 'concepts'
}

function resolveInput(raw: string | undefined, pages: LinkedPage[]): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) throw new Error('source is required')
  assertNotRaw(normalizeRel(trimmed))
  const asRel = normalizeRel(trimmed.endsWith('.md') || trimmed.includes('/') ? trimmed : `${guessDir(pages, trimmed)}/${trimmed}.md`)
  assertNotRaw(asRel)
  const byRel = pages.find((page) => page.rel === asRel)
  if (byRel) return byRel.rel
  const slug = slugOf(trimmed.replace(/\.md$/i, ''))
  const bySlug = pages.find((page) => page.slug === slug)
  if (bySlug) return bySlug.rel
  throw new Error(`compiled page not found: ${trimmed}`)
}

function bumpUpdated(fm: Frontmatter): Frontmatter {
  return { ...fm, updated: todayStamp() }
}

function withTitle(fm: Frontmatter, title: string | undefined): Frontmatter {
  if (!title?.trim()) return fm
  return { ...fm, title: title.trim() }
}

function inboundRewrites(
  pages: LinkedPage[],
  fromSlug: string,
  toSlug: string,
): { inbound: RefactorLinkRewrite[]; patches: FilePatch[] } {
  const inbound: RefactorLinkRewrite[] = []
  const patches: FilePatch[] = []
  if (fromSlug === toSlug) return { inbound, patches }
  for (const page of pages) {
    if (!page.text.includes(`[[${fromSlug}`)) continue
    const next = rewriteWikilinkSlug(page.text, fromSlug, toSlug)
    if (next === page.text) continue
    inbound.push({ from: page.rel, oldLink: fromSlug, newLink: toSlug })
    patches.push({ path: page.rel, action: 'write', content: next })
  }
  return { inbound, patches }
}

function mergePatch(existing: FilePatch[], next: FilePatch): FilePatch[] {
  const idx = existing.findIndex((item) => item.path === next.path)
  if (idx === -1) return [...existing, next]
  const copy = [...existing]
  copy[idx] = next
  return copy
}

function extraSections(sourceBody: string, targetBody: string, sourceTitle: string): string {
  const targetHeadings = new Set(
    [...targetBody.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => (match[1] ?? '').trim()),
  )
  const chunks: string[] = []
  const parts = sourceBody.split(/^(?=#{1,6}\s)/m)
  for (const part of parts) {
    const heading = part.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim()
    if (!heading || heading === sourceTitle) continue
    if (targetHeadings.has(heading)) continue
    chunks.push(part.trim())
  }
  if (chunks.length === 0) {
    return `${targetBody.trimEnd()}\n\n## 来自 ${sourceTitle}\n\n${sourceBody.trim()}\n`
  }
  return `${targetBody.trimEnd()}\n\n${chunks.join('\n\n')}\n`
}

function mergeLists(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b].map((item) => item.trim()).filter(Boolean))]
}

function ensureFrontmatter(text: string, fallback: Frontmatter): string {
  const parsed = parseFrontmatter(text)
  if (parsed.hasFrontmatter) {
    return serializeDocument(bumpUpdated({ ...fallback, ...parsed.frontmatter }), parsed.body)
  }
  return serializeDocument(bumpUpdated(fallback), text)
}

function destFromTarget(
  sourceRel: string,
  target: string | undefined,
  title: string | undefined,
  op: 'rename' | 'move',
  pack: PackConfig,
): string {
  const trimmed = (target ?? '').trim()
  if (op === 'rename') {
    if (trimmed.includes('/') || trimmed.endsWith('.md')) {
      const rel = normalizeRel(trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
      assertNotRaw(rel)
      if (!isCompiledRel(rel, pack)) throw new Error('rename target must be a compiled page path')
      return rel
    }
    const slug = trimmed || slugify(title ?? '')
    if (!trimmed && (!title || slug === 'untitled')) throw new Error('rename needs target slug or title')
    return `${pageDirOf(sourceRel)}/${slug}.md`
  }
  if (!trimmed) throw new Error('move needs target path or folder')
  const folder = trimmed.replace(/\/$/, '')
  if (isPageDir(folder, pack)) {
    return `${folder}/${slugFromRel(sourceRel)}.md`
  }
  const rel = normalizeRel(trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
  assertNotRaw(rel)
  if (!isCompiledRel(rel, pack)) throw new Error(`move target must be under ${pack.pageDirs.join(' | ')}`)
  return rel
}

export async function buildRefactorPlan(root: string, options: RefactorOptions): Promise<RefactorPlan> {
  const opRaw = (options.op ?? '').trim()
  if (!REFACTOR_OPS.includes(opRaw as RefactorOp)) {
    throw new Error(`op must be ${REFACTOR_OPS.join(' | ')}`)
  }
  const op = opRaw as RefactorOp
  const pack = await loadVaultPack(root)
  const index = await loadBacklinkIndex(root)
  const pages = index.pages
  let indexMd = await readFile(path.join(root, 'index.md'), 'utf8')
  const warnings: string[] = []
  let inbound: RefactorLinkRewrite[] = []
  let patches: FilePatch[] = []
  let note = ''
  let logEntry = `refactor | ${op}`

  if (op === 'rename') {
    const sourceRel = resolveInput(options.source, pages)
    const destRel = destFromTarget(sourceRel, options.target, options.title, 'rename', pack)
    const source = pages.find((page) => page.rel === sourceRel)!
    if (destRel !== sourceRel && pages.some((page) => page.rel === destRel)) {
      throw new Error(`target already exists: ${destRel}`)
    }
    const newSlug = slugFromRel(destRel)
    const parsed = parseFrontmatter(source.text)
    const fm = withTitle(bumpUpdated(parsed.frontmatter), options.title)
    const nextText = rewriteWikilinkSlug(serializeDocument(fm, parsed.body), source.slug, newSlug)
    const rewritten = inboundRewrites(pages, source.slug, newSlug)
    inbound = rewritten.inbound
    patches = rewritten.patches
    if (destRel === sourceRel) {
      patches = mergePatch(patches, { path: sourceRel, action: 'write', content: nextText })
    } else {
      patches = mergePatch(patches, { path: destRel, action: 'write', content: nextText })
      patches = mergePatch(patches, { path: sourceRel, action: 'delete', content: '' })
      indexMd = replaceIndexSlug(indexMd, source.slug, newSlug)
      patches = mergePatch(patches, { path: 'index.md', action: 'write', content: indexMd })
    }
    note = destRel === sourceRel ? '只更新标题，slug 未变' : `将 ${sourceRel} 重命名为 ${destRel}`
    logEntry = `refactor | rename ${sourceRel} -> ${destRel}`
  } else if (op === 'move') {
    const sourceRel = resolveInput(options.source, pages)
    const destRel = destFromTarget(sourceRel, options.target, options.title, 'move', pack)
    const source = pages.find((page) => page.rel === sourceRel)!
    if (destRel !== sourceRel && pages.some((page) => page.rel === destRel)) {
      throw new Error(`target already exists: ${destRel}`)
    }
    const parsed = parseFrontmatter(source.text)
    const nextType = typeFromRel(destRel, pack)
    const newSlug = slugFromRel(destRel)
    const fm = withTitle(bumpUpdated({ ...parsed.frontmatter, type: nextType }), options.title)
    const nextText = rewriteWikilinkSlug(serializeDocument(fm, parsed.body), source.slug, newSlug)
    const rewritten = inboundRewrites(pages, source.slug, newSlug)
    inbound = rewritten.inbound
    patches = rewritten.patches
    patches = mergePatch(patches, { path: destRel, action: 'write', content: nextText })
    if (destRel !== sourceRel) {
      patches = mergePatch(patches, { path: sourceRel, action: 'delete', content: '' })
    }
    indexMd = moveIndexSlug(replaceIndexSlug(indexMd, source.slug, newSlug), newSlug, String(fm.title ?? newSlug), nextType, pack)
    patches = mergePatch(patches, { path: 'index.md', action: 'write', content: indexMd })
    note = `将 ${sourceRel} 移到 ${destRel}`
    logEntry = `refactor | move ${sourceRel} -> ${destRel}`
  } else if (op === 'link') {
    const sourceRel = resolveInput(options.source, pages)
    const targetRel = resolveInput(options.target, pages)
    if (sourceRel === targetRel) throw new Error('cannot link a page to itself')
    const source = pages.find((page) => page.rel === sourceRel)!
    const target = pages.find((page) => page.rel === targetRel)!
    const added = addWikilinkIfMissing(source.text, target.slug)
    if (!added.added) {
      warnings.push(`already linked to [[${target.slug}]]`)
      note = '未改动：链接已存在'
    } else {
      const parsed = parseFrontmatter(added.text)
      patches = [{ path: sourceRel, action: 'write', content: serializeDocument(bumpUpdated(parsed.frontmatter), parsed.body) }]
      note = `在 ${sourceRel} 增加 [[${target.slug}]]`
      logEntry = `refactor | link ${sourceRel} -> ${target.slug}`
    }
  } else if (op === 'archive') {
    const sourceRel = resolveInput(options.source, pages)
    const source = pages.find((page) => page.rel === sourceRel)!
    const parsed = parseFrontmatter(source.text)
    if (isArchived(parsed.frontmatter)) {
      warnings.push('page is already archived')
      note = '未改动：已经归档'
    } else {
      const next = serializeDocument(bumpUpdated({ ...parsed.frontmatter, archived: true }), parsed.body)
      patches = [
        { path: sourceRel, action: 'write', content: next },
        { path: 'index.md', action: 'write', content: removeIndexSlug(indexMd, source.slug) },
      ]
      note = `归档 ${sourceRel}（不删文件、不改 raw/）`
      logEntry = `refactor | archive ${sourceRel}`
    }
  } else if (op === 'merge') {
    const sourceRel = resolveInput(options.source, pages)
    const targetRel = resolveInput(options.target, pages)
    if (sourceRel === targetRel) throw new Error('merge source and target must differ')
    const source = pages.find((page) => page.rel === sourceRel)!
    const target = pages.find((page) => page.rel === targetRel)!
    const sourceParsed = parseFrontmatter(source.text)
    const targetParsed = parseFrontmatter(target.text)
    const sources = mergeLists(target.sources, source.sources)
    const tags = mergeLists(target.tags, source.tags)
    const provided = (options.content ?? '').trim()
    let body: string
    if (provided) {
      body = parseFrontmatter(provided).hasFrontmatter ? parseFrontmatter(provided).body : provided
      note = `将 ${sourceRel} 并入 ${targetRel}`
    } else {
      body = extraSections(sourceParsed.body, targetParsed.body, source.title)
      note = `将 ${sourceRel} 并入 ${targetRel}。未做语义去重，只做机械拼接`
      warnings.push('mechanical merge only; paraphrase overlap is not removed')
    }
    const mergedText = serializeDocument(bumpUpdated({ ...targetParsed.frontmatter, sources, tags }), body)
    const archivedSource = serializeDocument(
      bumpUpdated({ ...sourceParsed.frontmatter, archived: true }),
      sourceParsed.body,
    )
    const rewritten = inboundRewrites(
      pages.filter((page) => page.rel !== sourceRel && page.rel !== targetRel),
      source.slug,
      target.slug,
    )
    inbound = rewritten.inbound
    patches = rewritten.patches
    patches = mergePatch(patches, {
      path: targetRel,
      action: 'write',
      content: rewriteWikilinkSlug(mergedText, source.slug, target.slug),
    })
    patches = mergePatch(patches, { path: sourceRel, action: 'write', content: archivedSource })
    indexMd = removeIndexSlug(replaceIndexSlug(indexMd, source.slug, target.slug), source.slug)
    patches = mergePatch(patches, { path: 'index.md', action: 'write', content: indexMd })
    logEntry = `refactor | merge ${sourceRel} -> ${targetRel}`
  } else if (op === 'split') {
    const sourceRel = resolveInput(options.source, pages)
    const content = (options.content ?? '').trim()
    const contentB = (options.contentB ?? '').trim()
    if (!content || !contentB) throw new Error('split requires content (remaining page) and contentB (new page)')
    const targetRaw = (options.target ?? '').trim()
    if (!targetRaw) throw new Error('split requires target path for the new page')
    const destRel = destFromTarget(sourceRel, targetRaw, options.title, 'rename', pack)
    if (pages.some((page) => page.rel === destRel) || destRel === sourceRel) {
      throw new Error(`split target already exists: ${destRel}`)
    }
    const source = pages.find((page) => page.rel === sourceRel)!
    const sourceParsed = parseFrontmatter(source.text)
    const newSlug = slugFromRel(destRel)
    const newType = typeFromRel(destRel, pack)
    const fallbackTitle = options.title?.trim() || newSlug
    const left = ensureFrontmatter(content, { ...sourceParsed.frontmatter, type: typeFromRel(sourceRel, pack) })
    const right = ensureFrontmatter(contentB, {
      title: fallbackTitle,
      created: todayStamp(),
      type: newType,
      tags: sourceParsed.frontmatter.tags,
      sources: sourceParsed.frontmatter.sources,
    })
    const leftLinked = addWikilinkIfMissing(left, newSlug)
    const rightLinked = addWikilinkIfMissing(right, source.slug)
    patches = [
      { path: sourceRel, action: 'write', content: leftLinked.text },
      { path: destRel, action: 'write', content: rightLinked.text },
      { path: 'index.md', action: 'write', content: addIndexSlug(indexMd, newSlug, fallbackTitle, newType, pack) },
    ]
    note = `从 ${sourceRel} 拆出 ${destRel}`
    logEntry = `refactor | split ${sourceRel} -> ${destRel}`
  } else {
    const sourceRel = resolveInput(options.source, pages)
    const content = (options.content ?? '').trim()
    if (!content) throw new Error('rewrite requires content')
    const source = pages.find((page) => page.rel === sourceRel)!
    const previous = parseFrontmatter(source.text)
    const nextDoc = parseFrontmatter(content)
    const fm = bumpUpdated({ ...previous.frontmatter, ...nextDoc.frontmatter })
    const body = nextDoc.hasFrontmatter ? nextDoc.body : content
    const nextText = serializeDocument(fm, body)
    const oldLinks = source.outgoing.join(', ')
    const nextLinks = extractWikilinks(nextText).map(slugOf).join(', ')
    warnings.push(`wikilinks: ${oldLinks || '(none)'} -> ${nextLinks || '(none)'}`)
    patches = [{ path: sourceRel, action: 'write', content: nextText }]
    note = `重写 ${sourceRel}（不改 raw/）`
    logEntry = `refactor | rewrite ${sourceRel}`
  }

  return { op, note, warnings, inbound, patches, logEntry }
}
