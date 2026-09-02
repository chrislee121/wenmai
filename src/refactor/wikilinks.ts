import path from 'node:path'
import { extractWikilinks } from '../frontmatter.js'
import { slugOf } from '../backlinks.js'

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function rewriteWikilinkSlug(text: string, fromSlug: string, toSlug: string): string {
  if (!fromSlug || fromSlug === toSlug) return text
  const re = new RegExp(`\\[\\[${escapeRegExp(fromSlug)}(#[^\\]|]*)?(\\|[^\\]]*)?\\]\\]`, 'g')
  return text.replace(re, (_match, hash = '', alias = '') => `[[${toSlug}${hash}${alias}]]`)
}

export function hasWikilinkTo(text: string, slug: string): boolean {
  return extractWikilinks(text).map(slugOf).includes(slug)
}

export function addWikilinkIfMissing(text: string, slug: string): { text: string; added: boolean } {
  if (hasWikilinkTo(text, slug)) return { text, added: false }
  return { text: `${text.trimEnd()}\n\n相关：[[${slug}]]\n`, added: true }
}

export function pageDirOf(rel: string): string {
  return rel.replace(/\\/g, '/').split('/')[0] ?? ''
}

export function slugFromRel(rel: string): string {
  return path.basename(rel.replace(/\\/g, '/'), '.md')
}
