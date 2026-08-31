import { buildBacklinkIndex } from '../backlinks.js'
import { detectConflictCandidates } from './conflicts.js'
import { loadReviewCorpus } from './corpus.js'
import { DEFAULT_DUPLICATE_THRESHOLD, findDuplicatePairs, LEXICAL_BLIND_SPOT } from './duplicates.js'
import { finding, type Finding } from './findings.js'
import { computeMetrics, type ReviewMetrics } from './metrics.js'
import { detectStaleness, DEFAULT_TTL_DAYS } from './staleness.js'
import { filterFindings, markFindings, readReviewState } from './state.js'
import { detectStructure } from './structure.js'

export { LEXICAL_BLIND_SPOT }
export type { Finding, ReviewMetrics }
export type { ReviewStatus } from './state.js'

export interface ReviewOptions {
  ttlDays?: number
  duplicateThreshold?: number
  includeDismissed?: boolean
  now?: Date
  ack?: string[]
  snooze?: string[]
  wontfix?: string[]
  snoozeDays?: number
}

export interface ReviewReport {
  ok: true
  truncated: boolean
  truncationNote?: string
  blindSpot: string
  metrics: ReviewMetrics
  findingCount: number
  findings: Finding[]
}

function splitIds(value: string[] | undefined): string[] {
  if (!value) return []
  return value.flatMap((item) => item.split(/[,\s]+/)).map((item) => item.trim()).filter(Boolean)
}

export async function reviewVault(root: string, options: ReviewOptions = {}): Promise<ReviewReport> {
  const ack = splitIds(options.ack)
  const snooze = splitIds(options.snooze)
  const wontfix = splitIds(options.wontfix)
  if (ack.length) await markFindings(root, ack, 'ack')
  if (snooze.length) await markFindings(root, snooze, 'snooze', options.snoozeDays ?? 30)
  if (wontfix.length) await markFindings(root, wontfix, 'wontfix')

  const corpus = await loadReviewCorpus(root)
  const index = buildBacklinkIndex(corpus.pages)
  const threshold = options.duplicateThreshold ?? DEFAULT_DUPLICATE_THRESHOLD

  const duplicateFindings: Finding[] = findDuplicatePairs(
    corpus.pages.map((page) => ({ id: page.rel, title: page.title, body: page.body })),
    threshold,
  ).map((pair) =>
    finding({
      kind: 'duplicate',
      severity: 'warning',
      paths: [pair.a, pair.b],
      key: pair.similarity.toFixed(3),
      reason: `词法相似度 ${pair.similarity.toFixed(2)}${pair.overlappingPhrases.length ? `，重叠片段：${pair.overlappingPhrases.slice(0, 3).join(' / ')}` : ''}。${LEXICAL_BLIND_SPOT}`,
      action: '合并、互链，或明确区分两页各自覆盖的角度',
    }),
  )

  const all: Finding[] = [
    ...detectStaleness(corpus, index, { now: options.now, ttlDays: options.ttlDays ?? DEFAULT_TTL_DAYS }),
    ...duplicateFindings,
    ...detectConflictCandidates(corpus.pages),
    ...detectStructure(corpus.pages, index, corpus.indexMd),
  ]

  const state = await readReviewState(root)
  const findings = filterFindings(all, state, {
    includeDismissed: options.includeDismissed === true,
    now: options.now,
  })
  const metrics = computeMetrics(corpus, index, all)

  return {
    ok: true,
    truncated: corpus.truncated,
    truncationNote: corpus.truncated
      ? `编译页超过 ${corpus.maxPages} 篇，只审查了前 ${corpus.maxPages} 篇，请拆目录或分批 review`
      : undefined,
    blindSpot: LEXICAL_BLIND_SPOT,
    metrics,
    findingCount: findings.length,
    findings,
  }
}
