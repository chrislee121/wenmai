export type WrittenVerdict = 'NEW' | 'REVIEW' | 'DUPLICATE'

export interface WrittenHitView {
  kind: string
  path: string
  title: string
  snippet: string
  similarity?: number
  overlappingPhrases: string[]
  match?: string
}

export interface WrittenOpenTaskView {
  id: string
  why: string
  relatedPages: string[]
  priority: string
  status: string
}

export interface WrittenCardModel {
  running: boolean
  error?: string
  query: string
  verdict: WrittenVerdict
  headline: string
  reason: string
  hits: WrittenHitView[]
  openTasks: WrittenOpenTaskView[]
}

export interface IngestFileView {
  title: string
  rel: string
  sourcePath: string
}

export interface IngestCardModel {
  running: boolean
  error?: string
  dryRun: boolean
  dir: string
  kind: string
  planned: number
  ingested: number
  deduped: number
  hint: string | null
  files: IngestFileView[]
  canConfirm: boolean
}

export interface StatusCardModel {
  running: boolean
  error?: string
  initialized: boolean
  root: string
  pageCount: number
  rawCount: number
  indexUpdated: string | null
  sourceRoots: Array<{ path: string; readable: boolean; origin: string }>
  research: boolean
}

export interface ResearchEvidenceView {
  path: string
  title: string
  snippet: string
}

export interface ResearchCardModel {
  running: boolean
  error?: string
  status: 'ready' | 'no-local-evidence' | ''
  slug: string
  proposedPath: string
  note: string
  evidence: ResearchEvidenceView[]
  proposedSources: string[]
}

export interface TaskCardItem {
  id: string
  why: string
  relatedPages: string[]
  expectedResult: string
  priority: string
  status: string
  suggestedOp?: string
}

export interface TasksCardModel {
  running: boolean
  error?: string
  op: string
  taskCount: number
  tasks: TaskCardItem[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function writtenHeadline(verdict: WrittenVerdict): string {
  if (verdict === 'DUPLICATE') return '已经写过'
  if (verdict === 'REVIEW') return '动笔前先看旧稿'
  return '可以写'
}

export function writtenCardModel(payload: unknown, running = false): WrittenCardModel {
  if (running) {
    return {
      running: true,
      query: '',
      verdict: 'NEW',
      headline: '正在查…',
      reason: '',
      hits: [],
      openTasks: [],
    }
  }
  const rec = asRecord(payload)
  if (!rec) {
    return {
      running: false,
      error: '无法读取结果',
      query: '',
      verdict: 'NEW',
      headline: '无法读取',
      reason: '',
      hits: [],
      openTasks: [],
    }
  }
  if (rec.ok === false) {
    const error = asString(rec.error, '查询失败')
    return {
      running: false,
      error,
      query: asString(rec.query),
      verdict: 'NEW',
      headline: '查重失败',
      reason: error,
      hits: [],
      openTasks: [],
    }
  }
  const verdictRaw = asString(rec.verdict, 'NEW')
  const verdict: WrittenVerdict =
    verdictRaw === 'DUPLICATE' || verdictRaw === 'REVIEW' ? verdictRaw : 'NEW'
  const hits: WrittenHitView[] = []
  if (Array.isArray(rec.hits)) {
    for (const item of rec.hits) {
      const hit = asRecord(item)
      if (!hit) continue
      hits.push({
        kind: asString(hit.kind, 'page'),
        path: asString(hit.path),
        title: asString(hit.title, asString(hit.path)),
        snippet: asString(hit.snippet),
        similarity: typeof hit.similarity === 'number' ? hit.similarity : undefined,
        overlappingPhrases: Array.isArray(hit.overlappingPhrases)
          ? hit.overlappingPhrases.filter((phrase): phrase is string => typeof phrase === 'string')
          : [],
        match: typeof hit.match === 'string' ? hit.match : undefined,
      })
    }
  }
  const openTasks: WrittenOpenTaskView[] = []
  if (Array.isArray(rec.openTasks)) {
    for (const item of rec.openTasks) {
      const task = asRecord(item)
      if (!task) continue
      openTasks.push({
        id: asString(task.id),
        why: asString(task.why),
        relatedPages: Array.isArray(task.relatedPages)
          ? task.relatedPages.filter((page): page is string => typeof page === 'string')
          : [],
        priority: asString(task.priority, 'medium'),
        status: asString(task.status, 'open'),
      })
    }
  }
  return {
    running: false,
    query: asString(rec.query),
    verdict,
    headline: writtenHeadline(verdict),
    reason: asString(rec.reason),
    hits,
    openTasks,
  }
}

export function ingestCardModel(payload: unknown, running = false): IngestCardModel {
  if (running) {
    return {
      running: true,
      dryRun: true,
      dir: '',
      kind: 'workspace',
      planned: 0,
      ingested: 0,
      deduped: 0,
      hint: null,
      files: [],
      canConfirm: false,
    }
  }
  const rec = asRecord(payload)
  if (!rec || rec.ok === false) {
    const error = rec ? asString(rec.error, '收录失败') : '无法读取结果'
    return {
      running: false,
      error,
      dryRun: false,
      dir: '',
      kind: 'workspace',
      planned: 0,
      ingested: 0,
      deduped: 0,
      hint: null,
      files: [],
      canConfirm: false,
    }
  }
  const files: IngestFileView[] = []
  if (Array.isArray(rec.files)) {
    for (const item of rec.files) {
      const file = asRecord(item)
      if (!file) continue
      files.push({
        title: asString(file.title, asString(file.rel)),
        rel: asString(file.rel),
        sourcePath: asString(file.sourcePath),
      })
    }
  } else if (typeof rec.rawPath === 'string' && rec.rawPath) {
    files.push({
      title: asString(rec.title, asString(rec.rawPath)),
      rel: asString(rec.rawPath),
      sourcePath: asString(rec.rawPath),
    })
  }
  const dryRun = asBoolean(rec.dryRun, false)
  const planned = asNumber(rec.planned, files.length)
  const ingested = asNumber(rec.ingested, dryRun ? 0 : files.length)
  return {
    running: false,
    dryRun,
    dir: asString(rec.dir),
    kind: asString(rec.kind, 'workspace'),
    planned,
    ingested,
    deduped: asNumber(rec.deduped),
    hint: typeof rec.hint === 'string' ? rec.hint : null,
    files: files.slice(0, 40),
    canConfirm: dryRun && planned > 0 && asString(rec.dir).length > 0,
  }
}

export function statusCardModel(payload: unknown, running = false): StatusCardModel {
  if (running) {
    return {
      running: true,
      initialized: false,
      root: '',
      pageCount: 0,
      rawCount: 0,
      indexUpdated: null,
      sourceRoots: [],
      research: false,
    }
  }
  const rec = asRecord(payload)
  if (!rec || rec.ok === false) {
    const error = rec ? asString(rec.error, '无法读取状态') : '无法读取结果'
    return {
      running: false,
      error,
      initialized: false,
      root: '',
      pageCount: 0,
      rawCount: 0,
      indexUpdated: null,
      sourceRoots: [],
      research: false,
    }
  }
  const sourceRoots: StatusCardModel['sourceRoots'] = []
  if (Array.isArray(rec.sourceRoots)) {
    for (const item of rec.sourceRoots) {
      const root = asRecord(item)
      if (!root) continue
      sourceRoots.push({
        path: asString(root.path),
        readable: asBoolean(root.readable, false),
        origin: asString(root.origin, 'plugin'),
      })
    }
  }
  return {
    running: false,
    initialized: asBoolean(rec.initialized, false),
    root: asString(rec.root),
    pageCount: asNumber(rec.pageCount),
    rawCount: asNumber(rec.rawCount),
    indexUpdated: typeof rec.indexUpdated === 'string' ? rec.indexUpdated : null,
    sourceRoots,
    research: asBoolean(rec.research, false),
  }
}

export function tasksCardModel(payload: unknown, running = false): TasksCardModel {
  if (running) {
    return { running: true, op: 'list', taskCount: 0, tasks: [] }
  }
  const rec = asRecord(payload)
  if (!rec || rec.ok === false) {
    const error = rec ? asString(rec.error, '无法读取任务') : '无法读取结果'
    return { running: false, error, op: 'list', taskCount: 0, tasks: [] }
  }
  const tasks: TaskCardItem[] = []
  if (Array.isArray(rec.tasks)) {
    for (const item of rec.tasks) {
      const task = asRecord(item)
      if (!task) continue
      tasks.push({
        id: asString(task.id),
        why: asString(task.why),
        relatedPages: Array.isArray(task.relatedPages)
          ? task.relatedPages.filter((page): page is string => typeof page === 'string')
          : [],
        expectedResult: asString(task.expectedResult),
        priority: asString(task.priority, 'medium'),
        status: asString(task.status, 'open'),
        suggestedOp: typeof task.suggestedOp === 'string' ? task.suggestedOp : undefined,
      })
    }
  }
  return {
    running: false,
    op: asString(rec.op, 'list'),
    taskCount: asNumber(rec.taskCount, tasks.length),
    tasks,
  }
}

export function researchCardModel(payload: unknown, running = false): ResearchCardModel {
  if (running) {
    return {
      running: true,
      status: '',
      slug: '',
      proposedPath: '',
      note: '',
      evidence: [],
      proposedSources: [],
    }
  }
  const rec = asRecord(payload)
  if (!rec || rec.ok === false) {
    const error = rec ? asString(rec.error, '无法研究') : '无法读取结果'
    return {
      running: false,
      error,
      status: '',
      slug: '',
      proposedPath: '',
      note: '',
      evidence: [],
      proposedSources: [],
    }
  }
  const briefs = Array.isArray(rec.briefs) ? rec.briefs : []
  const first = asRecord(briefs[0])
  if (!first) {
    return {
      running: false,
      status: 'no-local-evidence',
      slug: '',
      proposedPath: '',
      note: '没有目录缺页可查。',
      evidence: [],
      proposedSources: [],
    }
  }
  const evidence: ResearchEvidenceView[] = []
  if (Array.isArray(first.evidence)) {
    for (const item of first.evidence) {
      const hit = asRecord(item)
      if (!hit) continue
      evidence.push({
        path: asString(hit.path),
        title: asString(hit.title),
        snippet: asString(hit.snippet),
      })
    }
  }
  const proposedSources = Array.isArray(first.proposedSources)
    ? first.proposedSources.filter((item): item is string => typeof item === 'string')
    : []
  const statusRaw = asString(first.status)
  return {
    running: false,
    status: statusRaw === 'ready' ? 'ready' : 'no-local-evidence',
    slug: asString(first.slug),
    proposedPath: asString(first.proposedPath),
    note: asString(first.note),
    evidence,
    proposedSources,
  }
}

export function isToolRunning(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false
  return !('kind' in (block as Record<string, unknown>))
}

export function parseToolPayload(block: unknown): unknown {
  if (!block || typeof block !== 'object') return null
  const rec = block as Record<string, unknown>
  if (!('kind' in rec)) return null
  const content = rec.content
  if (!Array.isArray(content)) return rec
  const texts: string[] = []
  for (const item of content) {
    const part = asRecord(item)
    if (part && part.type === 'text' && typeof part.text === 'string') texts.push(part.text)
  }
  const raw = texts.join('\n').trim()
  if (!raw) return rec
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { ok: false, error: raw.slice(0, 200) }
  }
}
