import { extractWikilinks } from '../frontmatter.js'
import { slugOf, type BacklinkIndex, type LinkedPage } from '../backlinks.js'
import { finding, type Finding } from './findings.js'

export const OVERSIZE_LINES = 200
export const HUB_DEGREE = 20

export function detectStructure(
  pages: LinkedPage[],
  index: BacklinkIndex,
  indexMd: string,
): Finding[] {
  const findings: Finding[] = []
  const slugs = new Set(pages.map((page) => page.slug))

  for (const page of pages) {
    const incoming = index.incoming.get(page.slug) ?? []
    const outgoingKnown = page.outgoing.filter((slug) => slugs.has(slug))
    if (incoming.length === 0 && outgoingKnown.length === 0) {
      findings.push(
        finding({
          kind: 'orphan-page',
          severity: 'info',
          paths: [page.rel],
          reason: '没有指向其他编译页的 [[wikilink]]，也没有被其他编译页引用',
          action: '补互链，或并入相关页',
        }),
      )
    }
    if (page.lineCount >= OVERSIZE_LINES) {
      findings.push(
        finding({
          kind: 'oversized-page',
          severity: 'warning',
          paths: [page.rel],
          key: String(page.lineCount),
          reason: `共 ${page.lineCount} 行，达到 SCHEMA 建议的拆分阈值 ${OVERSIZE_LINES} 行`,
          action: '拆成多页并保留互链',
        }),
      )
    }
    const degree = incoming.length + page.outgoing.length
    if (degree >= HUB_DEGREE) {
      findings.push(
        finding({
          kind: 'hub-overload',
          severity: 'info',
          paths: [page.rel],
          key: String(degree),
          reason: `出入链合计 ${degree}（入 ${incoming.length} / 出 ${page.outgoing.length}），可能过载`,
          action: '把枢纽拆成主题子页，或减少弱相关链接',
        }),
      )
    }
  }

  const listed = new Set(extractWikilinks(indexMd).map(slugOf))
  for (const slug of listed) {
    if (slugs.has(slug)) continue
    findings.push(
      finding({
        kind: 'index-mismatch',
        severity: 'warning',
        paths: ['index.md', slug],
        reason: `index.md 列出了 [[${slug}]]，但没有对应编译页`,
        action: '补写该页，或从目录删掉这条',
      }),
    )
  }
  for (const page of pages) {
    if (listed.has(page.slug)) continue
    findings.push(
      finding({
        kind: 'index-mismatch',
        severity: 'info',
        paths: [page.rel, 'index.md'],
        reason: `编译页未出现在 index.md 的 [[${page.slug}]]`,
        action: '写入目录对应章节',
      }),
    )
  }

  return findings
}
