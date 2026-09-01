import { todayStamp } from '../frontmatter.js'
import { TYPE_TO_DIR, type PageType } from '../layout.js'

function headingFor(type: PageType): string {
  const dir = TYPE_TO_DIR[type]
  if (!dir) return '## Concepts'
  return `## ${dir[0]!.toUpperCase()}${dir.slice(1)}`
}

function countIndexLinks(index: string): number {
  return [...index.matchAll(/\[\[([^\]]+)\]\]/g)].length
}

export function stampIndex(index: string): string {
  let next = index.replace(/- Total pages: \d+/, `- Total pages: ${countIndexLinks(index)}`)
  next = next.replace(/- Last updated: .*/, `- Last updated: ${todayStamp()}`)
  return next
}

export function replaceIndexSlug(index: string, fromSlug: string, toSlug: string): string {
  if (fromSlug === toSlug) return index
  return stampIndex(index.replaceAll(`[[${fromSlug}]]`, `[[${toSlug}]]`))
}

export function removeIndexSlug(index: string, slug: string): string {
  const lines = index.split('\n').filter((line) => !line.includes(`[[${slug}]]`))
  return stampIndex(lines.join('\n').replace(/\n{3,}/g, '\n\n'))
}

export function addIndexSlug(index: string, slug: string, title: string, type: PageType): string {
  if (index.includes(`[[${slug}]]`)) return stampIndex(index)
  const heading = headingFor(type)
  const line = `- [[${slug}]] — ${title}`
  if (!index.includes(heading)) {
    return stampIndex(`${index.trimEnd()}\n\n${heading}\n\n${line}\n`)
  }
  const parts = index.split(heading)
  const before = parts[0] ?? ''
  const after = parts.slice(1).join(heading)
  const nextHeading = after.search(/\n## /)
  if (nextHeading === -1) {
    return stampIndex(`${before}${heading}${after.trimEnd()}\n${line}\n`)
  }
  const section = after.slice(0, nextHeading).trimEnd()
  const rest = after.slice(nextHeading)
  return stampIndex(`${before}${heading}${section}\n${line}\n${rest}`)
}

export function moveIndexSlug(index: string, slug: string, title: string, type: PageType): string {
  return addIndexSlug(removeIndexSlug(index, slug), slug, title, type)
}
