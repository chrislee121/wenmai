import type { BacklinkIndex } from '../backlinks.js'
import type { ReviewCorpus } from './corpus.js'
import type { Finding } from './findings.js'

export interface ReviewMetrics {
  pageCount: number
  rawCount: number
  duplicatePairs: number
  orphanRatio: number
  averageDegree: number
  stalePageCount: number
  expiredPageCount: number
  conflictCandidates: number
}

export function computeMetrics(corpus: ReviewCorpus, index: BacklinkIndex, findings: Finding[]): ReviewMetrics {
  const pageCount = corpus.pages.length
  let degreeSum = 0
  for (const page of corpus.pages) {
    degreeSum += (index.incoming.get(page.slug) ?? []).length + page.outgoing.length
  }
  const unique = (kind: Finding['kind']): number =>
    new Set(findings.filter((item) => item.kind === kind).flatMap((item) => item.paths.slice(0, 1))).size

  return {
    pageCount,
    rawCount: corpus.raws.length,
    duplicatePairs: findings.filter((item) => item.kind === 'duplicate').length,
    orphanRatio: pageCount === 0 ? 0 : findings.filter((item) => item.kind === 'orphan-page').length / pageCount,
    averageDegree: pageCount === 0 ? 0 : Math.round((degreeSum / pageCount) * 100) / 100,
    stalePageCount: unique('page-stale'),
    expiredPageCount: findings.filter((item) => item.kind === 'page-expired').length,
    conflictCandidates: findings.filter((item) => item.kind === 'conflict-candidate').length,
  }
}
