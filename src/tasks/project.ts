import { isResearchEligible } from '../research/eligible.js'
import type { Finding, FindingKind } from '../review/findings.js'
import type { ReviewStateEntry, TaskPriority } from '../review/state.js'
import { PRIORITY_RANK, type KnowledgeTask, type SuggestedOp, type TaskStatus } from './types.js'

export { isResearchEligible }

export function suggestedOp(kind: FindingKind): SuggestedOp | undefined {
  switch (kind) {
    case 'duplicate':
      return 'merge'
    case 'oversized-page':
    case 'hub-overload':
      return 'split'
    case 'orphan-page':
      return 'link'
    case 'page-stale':
    case 'page-expired':
    case 'source-missing':
      return 'rewrite'
    default:
      return undefined
  }
}

export function suggestedOpForFinding(
  finding: Pick<Finding, 'kind' | 'paths'>,
  options?: { research?: boolean },
): SuggestedOp | undefined {
  if (options?.research === true && isResearchEligible(finding)) return 'research'
  return suggestedOp(finding.kind)
}

export function derivePriority(finding: Pick<Finding, 'kind' | 'severity'>, pinned?: TaskPriority): TaskPriority {
  if (pinned) return pinned
  if (finding.severity === 'error') return 'high'
  if (finding.kind === 'duplicate' || finding.kind === 'conflict-candidate') return 'high'
  if (finding.severity === 'info') return 'low'
  return 'medium'
}

export function taskStatus(entry: ReviewStateEntry | undefined): TaskStatus {
  if (!entry) return 'open'
  if (entry.status === 'in_progress') return 'in_progress'
  if (entry.status === 'ack') return 'done'
  if (entry.status === 'snooze') return 'snoozed'
  return 'wontfix'
}

export function findingToTask(
  finding: Finding,
  entry?: ReviewStateEntry,
  options?: { research?: boolean },
): KnowledgeTask {
  const op = suggestedOpForFinding(finding, options)
  const task: KnowledgeTask = {
    id: finding.id,
    why: finding.reason,
    relatedPages: finding.paths,
    expectedResult: finding.action,
    priority: derivePriority(finding, entry?.priority),
    status: taskStatus(entry),
    kind: finding.kind,
  }
  if (op) task.suggestedOp = op
  return task
}

export function sortTasks(tasks: KnowledgeTask[]): KnowledgeTask[] {
  return [...tasks].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (byPriority !== 0) return byPriority
    const byKind = a.kind.localeCompare(b.kind)
    if (byKind !== 0) return byKind
    return a.id.localeCompare(b.id)
  })
}
