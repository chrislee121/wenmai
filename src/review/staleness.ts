import { buildBacklinkIndex, type BacklinkIndex } from '../backlinks.js'
import { finding, type Finding } from './findings.js'
import type { ReviewCorpus } from './corpus.js'

export const DEFAULT_TTL_DAYS = 180

function parseStamp(value: string | undefined): Date | null {
  if (!value) return null
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || !month || !day) return null
  return new Date(Date.UTC(year, month - 1, day))
}

export function detectStaleness(
  corpus: ReviewCorpus,
  index: BacklinkIndex = buildBacklinkIndex(corpus.pages),
  options: { now?: Date; ttlDays?: number } = {},
): Finding[] {
  const findings: Finding[] = []
  const now = options.now ?? new Date()
  const ttlDays = options.ttlDays ?? DEFAULT_TTL_DAYS

  for (const raw of corpus.raws) {
    if (!raw.hashDrift) continue
    const dependents = index.rawToPages.get(raw.rel) ?? []
    for (const pageRel of dependents) {
      findings.push(
        finding({
          kind: 'page-stale',
          severity: 'error',
          paths: [pageRel, raw.rel],
          reason: `引用的原文 ${raw.rel} 正文 sha256 已与 frontmatter 不一致，编译页可能过期`,
          action: '对照 raw 更新编译页；不要改 raw/',
        }),
      )
    }
  }

  for (const page of corpus.pages) {
    for (const source of page.sources) {
      if (corpus.rawByRel.has(source)) continue
      findings.push(
        finding({
          kind: 'source-missing',
          severity: 'warning',
          paths: [page.rel, source],
          reason: `sources 指向的原文不存在：${source}`,
          action: '核对路径，或重新 ingest 后再改 frontmatter',
        }),
      )
    }
  }

  if (ttlDays > 0) {
    const cutoff = now.getTime() - ttlDays * 24 * 60 * 60 * 1000
    for (const page of corpus.pages) {
      const updated = parseStamp(page.updated)
      if (!updated) continue
      if (updated.getTime() >= cutoff) continue
      findings.push(
        finding({
          kind: 'page-expired',
          severity: 'info',
          paths: [page.rel],
          key: page.updated,
          reason: `updated 为 ${page.updated}，已超过 ${ttlDays} 天未更新`,
          action: '复核内容是否仍成立，成立则只把 updated 推到今天',
        }),
      )
    }
  }

  return findings
}
