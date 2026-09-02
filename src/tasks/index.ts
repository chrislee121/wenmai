import { reviewVault } from '../review/index.js'
import { markFindings, readReviewState, type ReviewStatus, type TaskPriority } from '../review/state.js'
import { findingToTask, sortTasks } from './project.js'
import type { KnowledgeTask, TaskOp, TaskOptions, TaskReport } from './types.js'

export type { KnowledgeTask, SuggestedOp, TaskOp, TaskOptions, TaskReport, TaskStatus } from './types.js'
export { TASK_OPS } from './types.js'
export { derivePriority, findingToTask, suggestedOp } from './project.js'

const MUTATE_OPS = new Set<TaskOp>(['start', 'done', 'snooze', 'wontfix'])

function asPriority(value: string | undefined): TaskPriority | undefined {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return undefined
}

async function projectTasks(
  root: string,
  options: { includeDismissed?: boolean; priority?: TaskPriority },
): Promise<KnowledgeTask[]> {
  const report = await reviewVault(root, { includeDismissed: options.includeDismissed === true })
  const state = await readReviewState(root)
  let tasks = report.findings.map((item) => findingToTask(item, state.findings[item.id]))
  if (options.priority) {
    tasks = tasks.filter((item) => item.priority === options.priority)
  }
  return sortTasks(tasks)
}

function reportOf(op: TaskOp, tasks: KnowledgeTask[], id?: string): TaskReport {
  const report: TaskReport = { ok: true, op, taskCount: tasks.length, tasks }
  if (id) report.id = id
  return report
}

export async function runTasks(root: string, options: TaskOptions = {}): Promise<TaskReport> {
  const op: TaskOp = options.op ?? 'list'
  const priority = asPriority(options.priority)
  if (op === 'list') {
    return reportOf(op, await projectTasks(root, { includeDismissed: options.includeDismissed, priority }))
  }
  if (!MUTATE_OPS.has(op)) {
    throw new Error(`unknown tasks op: ${op}`)
  }
  const id = options.id?.trim() ?? ''
  if (!id) throw new Error('id is required for start / done / snooze / wontfix')

  if (op === 'start') {
    const detected = await reviewVault(root, { includeDismissed: true })
    if (!detected.findings.some((item) => item.id === id)) {
      throw new Error(`unknown finding ${id}`)
    }
    await markFindings(root, [id], 'in_progress', 30, priority ? { priority } : undefined)
  } else {
    const status: ReviewStatus = op === 'done' ? 'ack' : op === 'snooze' ? 'snooze' : 'wontfix'
    await markFindings(root, [id], status, options.snoozeDays ?? 30)
  }

  const tasks = await projectTasks(root, { includeDismissed: options.includeDismissed })
  return reportOf(op, tasks, id)
}

export async function overlappingOpenTasks(root: string, hitPaths: string[]): Promise<KnowledgeTask[]> {
  const hits = new Set(hitPaths.filter(Boolean))
  if (hits.size === 0) return []
  const listed = await runTasks(root, { op: 'list' })
  return listed.tasks.filter(
    (task) =>
      (task.status === 'open' || task.status === 'in_progress') &&
      task.relatedPages.some((page) => hits.has(page)),
  )
}

export function toWrittenOpenTask(task: KnowledgeTask): {
  id: string
  why: string
  relatedPages: string[]
  priority: TaskPriority
  status: 'open' | 'in_progress'
  suggestedOp?: KnowledgeTask['suggestedOp']
} {
  const slim: {
    id: string
    why: string
    relatedPages: string[]
    priority: TaskPriority
    status: 'open' | 'in_progress'
    suggestedOp?: KnowledgeTask['suggestedOp']
  } = {
    id: task.id,
    why: task.why,
    relatedPages: task.relatedPages,
    priority: task.priority,
    status: task.status === 'in_progress' ? 'in_progress' : 'open',
  }
  if (task.suggestedOp) slim.suggestedOp = task.suggestedOp
  return slim
}

