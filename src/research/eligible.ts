import type { PackConfig } from '../pack/types.js'

export function isResearchEligible(finding: { kind: string; paths: string[] }): boolean {
  if (finding.kind !== 'index-mismatch') return false
  const first = finding.paths[0]
  const slug = finding.paths[1]
  if (first !== 'index.md') return false
  if (typeof slug !== 'string' || !slug.trim()) return false
  if (slug.includes('/') || slug.includes('\\') || slug.endsWith('.md')) return false
  return true
}

export function missingSlug(finding: { kind: string; paths: string[] }): string | undefined {
  if (!isResearchEligible(finding)) return undefined
  const slug = finding.paths[1]?.trim()
  return slug || undefined
}

export function sectionHeadingForLink(indexMd: string, slug: string): string | undefined {
  const needle = `[[${slug}]]`
  const parts = indexMd.split(/^(?=## )/m)
  for (const part of parts) {
    if (!part.includes(needle)) continue
    const heading = part.match(/^## [^\n]+/)?.[0]?.trim()
    if (heading) return heading
  }
  return undefined
}

export function proposedPathForSlug(indexMd: string, slug: string, pack: PackConfig): string {
  const heading = sectionHeadingForLink(indexMd, slug)
  if (heading) {
    for (const [dir, label] of Object.entries(pack.indexHeadings)) {
      if (`## ${label}` === heading) return `${dir}/${slug}.md`
    }
  }
  return `concepts/${slug}.md`
}
