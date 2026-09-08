import { REVIEW_SIMILARITY_THRESHOLD, queryCoverage } from '../review/duplicates.js'

export function isStrongQuery(query: string): boolean {
  const compact = query.replace(/\s+/g, '')
  if (/[\p{Script=Han}]/u.test(compact)) return compact.length >= 2
  return compact.length >= 4
}

export function queryOverlapsGap(query: string, slug: string): boolean {
  const trimmed = query.trim()
  const needle = slug.trim()
  if (!trimmed || !needle || !isStrongQuery(trimmed)) return false
  const haystack = `${needle} ${needle.replace(/-/g, ' ')}`
  const q = trimmed.toLowerCase()
  const hay = haystack.toLowerCase()
  if (hay.includes(q) || q.includes(needle.toLowerCase()) || q.includes(needle.replace(/-/g, ' ').toLowerCase())) {
    return true
  }
  return queryCoverage(trimmed, haystack) >= REVIEW_SIMILARITY_THRESHOLD
}

export function searchTermsForSlug(slug: string, title = ''): string[] {
  const terms = new Set<string>()
  const trimmed = slug.trim()
  if (trimmed) terms.add(trimmed)
  const spaced = trimmed.replace(/-/g, ' ').trim()
  if (spaced && spaced !== trimmed) terms.add(spaced)
  const titled = title.trim()
  if (titled) terms.add(titled)
  return [...terms]
}
