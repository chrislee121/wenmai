import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadVaultPack } from '../pack/index.js'
import { reviewVault } from '../review/index.js'
import type { Finding } from '../review/findings.js'
import { isResearchEligible, missingSlug, proposedPathForSlug } from './eligible.js'
import { gatherEvidence, type EvidenceHit } from './evidence.js'
import { searchTermsForSlug } from './match.js'

export { isResearchEligible, missingSlug, proposedPathForSlug } from './eligible.js'
export { queryOverlapsGap } from './match.js'

const DISABLED = 'research is disabled; set research: true in the wenmai plugin config'
const READY_NOTE = '只列出本机已有材料，不生成正文。用 wenmai_write 补写该页，写回时带上 finding。'
const EMPTY_NOTE = '本机 raw/ 与已配置目录里没有词法命中。请先 ingest 或确认路径，不要编造来源。'

export type ResearchStatus = 'ready' | 'no-local-evidence'

export interface ResearchEvidence {
  path: string
  title: string
  snippet: string
  score: number
}

export interface ResearchBrief {
  id: string
  slug: string
  proposedPath: string
  relatedPages: string[]
  status: ResearchStatus
  evidence: ResearchEvidence[]
  proposedSources: string[]
  note: string
}

export interface ResearchOptions {
  findingId?: string
  enabled?: boolean
  sourceRoots?: string[]
  limit?: number
}

export interface ResearchReport {
  ok: true
  briefCount: number
  briefs: ResearchBrief[]
}

function titleFromIndex(indexMd: string, slug: string): string {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = indexMd.match(new RegExp(`\\[\\[${escaped}\\]\\](?:\\s*[—-]\\s*(.+))?`))
  const title = match?.[1]?.trim()
  return title || ''
}

function evidenceOf(hits: EvidenceHit[]): ResearchEvidence[] {
  return hits
    .filter((hit) => hit.kind === 'raw' || hit.kind === 'source')
    .map((hit) => ({
      path: hit.path,
      title: hit.title,
      snippet: hit.snippet,
      score: hit.score,
    }))
}

async function briefOf(
  root: string,
  finding: Finding,
  sourceRoots: string[],
  limit: number,
): Promise<ResearchBrief> {
  const slug = missingSlug(finding)
  if (!slug) throw new Error(`finding ${finding.id} is not a structural gap`)
  const pack = await loadVaultPack(root)
  const indexMd = await readFile(path.join(root, 'index.md'), 'utf8').catch(() => '')
  const terms = searchTermsForSlug(slug, titleFromIndex(indexMd, slug))
  const hits = await gatherEvidence(root, sourceRoots, terms, pack.pageDirs, limit)
  const material = evidenceOf(hits)
  const relatedPages = hits.filter((hit) => hit.kind === 'page').map((hit) => hit.path)
  const proposedSources = material.filter((item) => item.path.startsWith('raw/')).map((item) => item.path)
  const ready = material.length > 0
  return {
    id: finding.id,
    slug,
    proposedPath: proposedPathForSlug(indexMd, slug, pack),
    relatedPages,
    status: ready ? 'ready' : 'no-local-evidence',
    evidence: material,
    proposedSources,
    note: ready ? READY_NOTE : EMPTY_NOTE,
  }
}

export async function researchVault(root: string, options: ResearchOptions = {}): Promise<ResearchReport> {
  if (options.enabled !== true) throw new Error(DISABLED)
  const report = await reviewVault(root)
  const eligible = report.findings.filter(isResearchEligible)
  const wanted = options.findingId?.trim()
  let targets: Finding[]
  if (wanted) {
    const found = eligible.find((item) => item.id === wanted)
    if (!found) {
      const any = report.findings.find((item) => item.id === wanted)
      if (!any) throw new Error(`unknown finding ${wanted}`)
      throw new Error(`finding ${wanted} is not a structural gap`)
    }
    targets = [found]
  } else {
    targets = eligible
  }
  const sourceRoots = options.sourceRoots ?? []
  const limit = options.limit ?? 20
  const briefs: ResearchBrief[] = []
  for (const finding of targets) {
    briefs.push(await briefOf(root, finding, sourceRoots, limit))
  }
  return { ok: true, briefCount: briefs.length, briefs }
}
