import type { FindingKind } from '../review/findings.js'
import type { TaskPriority } from '../review/state.js'

export type TaskOp = 'list' | 'start' | 'done' | 'snooze' | 'wontfix'
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'snoozed' | 'wontfix'
export type SuggestedOp = 'merge' | 'split' | 'link' | 'move' | 'rewrite'

export const TASK_OPS = ['list', 'start', 'done', 'snooze', 'wontfix'] as const

export interface KnowledgeTask {
  id: string
  why: string
  relatedPages: string[]
  expectedResult: string
  priority: TaskPriority
  status: TaskStatus
  kind: FindingKind
  suggestedOp?: SuggestedOp
}

export interface TaskOptions {
  op?: TaskOp
  id?: string
  priority?: string
  snoozeDays?: number
  includeDismissed?: boolean
}

export interface TaskReport {
  ok: true
  op: TaskOp
  taskCount: number
  tasks: KnowledgeTask[]
  id?: string
}

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}
