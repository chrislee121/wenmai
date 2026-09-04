import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { extractWikilinks, parseFrontmatter } from './frontmatter.js'
import { loadVaultPack, rawDirsOf } from './pack/index.js'
import { isRawRel, posixRel, resolveUnder } from './paths.js'
import { hashRawDocument, listMarkdownFiles, sha256Bytes } from './store.js'

export interface LintDiagnostic {
  severity: 'error' | 'warning'
  code: string
  path: string
  message: string
}

export interface LintReport {
  ok: true
  errorCount: number
  warningCount: number
  filesExamined: number
  diagnostics: LintDiagnostic[]
}

export async function lintVault(root: string): Promise<LintReport> {
  const diagnostics: LintDiagnostic[] = []
  const pack = await loadVaultPack(root)
  const pageFiles = await listMarkdownFiles(root, pack.pageDirs)
  const rawFiles = await listMarkdownFiles(root, rawDirsOf(pack))
  const filesExamined = pageFiles.length + rawFiles.length + 2

  let index = ''
  try {
    index = await readFile(path.join(root, 'index.md'), 'utf8')
  } catch {
    diagnostics.push({
      severity: 'error',
      code: 'index-missing',
      path: 'index.md',
      message: 'index.md is missing',
    })
  }

  const knownSlugs = new Set<string>()
  const pageTexts = new Map<string, string>()
  for (const abs of pageFiles) {
    knownSlugs.add(path.basename(abs, '.md'))
    pageTexts.set(abs, await readFile(abs, 'utf8'))
  }

  for (const abs of pageFiles) {
    const rel = posixRel(root, abs)
    const text = pageTexts.get(abs) ?? ''
    const parsed = parseFrontmatter(text)
    const slug = path.basename(abs, '.md')
    if (!parsed.hasFrontmatter) {
      diagnostics.push({
        severity: 'error',
        code: 'frontmatter-missing',
        path: rel,
        message: 'compiled page is missing YAML frontmatter',
      })
    } else {
      if (!parsed.frontmatter.title) {
        diagnostics.push({
          severity: 'warning',
          code: 'title-missing',
          path: rel,
          message: 'frontmatter has no title',
        })
      }
      if (!parsed.frontmatter.type) {
        diagnostics.push({
          severity: 'warning',
          code: 'type-missing',
          path: rel,
          message: 'frontmatter has no type',
        })
      }
    }
    if (index && !index.includes(`[[${slug}]]`)) {
      diagnostics.push({
        severity: 'warning',
        code: 'orphan-page',
        path: rel,
        message: `page is not listed in index.md as [[${slug}]]`,
      })
    }
    for (const link of extractWikilinks(text)) {
      const targetSlug = path.basename(link).replace(/\.md$/, '')
      if (!knownSlugs.has(targetSlug)) {
        diagnostics.push({
          severity: 'warning',
          code: 'broken-wikilink',
          path: rel,
          message: `[[${link}]] does not resolve to a compiled page`,
        })
      }
    }
  }

  for (const abs of rawFiles) {
    const rel = posixRel(root, abs)
    const text = await readFile(abs, 'utf8')
    const parsed = parseFrontmatter(text)
    const stored = parsed.frontmatter.sha256
    if (!stored) {
      diagnostics.push({
        severity: 'warning',
        code: 'raw-hash-missing',
        path: rel,
        message: 'raw source has no sha256 frontmatter',
      })
      continue
    }
    const original = typeof parsed.frontmatter.original === 'string' ? parsed.frontmatter.original.trim() : ''
    if (original) {
      try {
        if (!isRawRel(original)) throw new Error('original must be under raw/')
        const bytes = await readFile(resolveUnder(root, original))
        if (stored !== sha256Bytes(bytes)) {
          diagnostics.push({
            severity: 'error',
            code: 'raw-hash-drift',
            path: rel,
            message: 'original file sha256 does not match frontmatter; raw/ should be immutable',
          })
        }
      } catch {
        diagnostics.push({
          severity: 'error',
          code: 'raw-original-missing',
          path: rel,
          message: `original file missing or unreadable: ${original}`,
        })
      }
      continue
    }
    if (stored !== (await hashRawDocument(root, parsed))) {
      diagnostics.push({
        severity: 'error',
        code: 'raw-hash-drift',
        path: rel,
        message: 'raw body sha256 does not match frontmatter; raw/ should be immutable',
      })
    }
  }

  return {
    ok: true,
    errorCount: diagnostics.filter((item) => item.severity === 'error').length,
    warningCount: diagnostics.filter((item) => item.severity === 'warning').length,
    filesExamined,
    diagnostics,
  }
}
