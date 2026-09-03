import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { todayStamp } from '../frontmatter.js'
import type { Finding } from './findings.js'

export const REVIEW_STATE_FILE = 'review-state.json'

export type ReviewStatus = 'ack' | 'snooze' | 'wontfix' | 'in_progress'

export type TaskPriority = 'high' | 'medium' | 'low'

export interface ReviewStateEntry {
  status: ReviewStatus
  until?: string
  updated: string
  priority?: TaskPriority
}

export interface ReviewState {
  findings: Record<string, ReviewStateEntry>
}

export async function readReviewState(root: string): Promise<ReviewState> {
  try {
    const raw = await readFile(path.join(root, REVIEW_STATE_FILE), 'utf8')
    const parsed = JSON.parse(raw) as { findings?: Record<string, ReviewStateEntry> }
    if (!parsed.findings || typeof parsed.findings !== 'object') return { findings: {} }
    return { findings: parsed.findings }
  } catch {
    return { findings: {} }
  }
}

export async function writeReviewState(root: string, state: ReviewState): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, REVIEW_STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function plusDays(days: number, now = new Date()): string {
  const next = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  return todayStamp(next)
}

export async function markFindings(
  root: string,
  ids: string[],
  status: ReviewStatus,
  snoozeDays = 30,
  extra?: { priority?: TaskPriority },
): Promise<ReviewState> {
  const state = await readReviewState(root)
  const updated = todayStamp()
  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed) continue
    const previous = state.findings[trimmed]
    const entry: ReviewStateEntry = { status, updated }
    if (status === 'snooze') entry.until = plusDays(Math.max(1, snoozeDays))
    const pin = extra?.priority ?? previous?.priority
    if (pin) entry.priority = pin
    state.findings[trimmed] = entry
  }
  await writeReviewState(root, state)
  return state
}

export function isDismissed(entry: ReviewStateEntry | undefined, now = new Date()): boolean {
  if (!entry) return false
  if (entry.status === 'in_progress') return false
  if (entry.status === 'wontfix' || entry.status === 'ack') return true
  if (entry.status === 'snooze' && entry.until) {
    return entry.until >= todayStamp(now)
  }
  return false
}

export function filterFindings(
  findings: Finding[],
  state: ReviewState,
  options: { includeDismissed?: boolean; now?: Date } = {},
): Finding[] {
  if (options.includeDismissed) return findings
  const now = options.now ?? new Date()
  return findings.filter((item) => !isDismissed(state.findings[item.id], now))
}
