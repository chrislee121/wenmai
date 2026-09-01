import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isRawRel, resolveUnder } from '../paths.js'
import { appendLog } from '../store.js'
import { markFindings } from '../review/state.js'
import type { FilePatch, RefactorChange, RefactorPlan, RefactorReport, UndoSnapshot } from './types.js'
import { UNDO_FILE } from './types.js'

function previewOf(patch: FilePatch): string {
  if (patch.action === 'delete') return '(delete compiled page)'
  return patch.content.replace(/\s+/g, ' ').trim().slice(0, 160)
}

export function reportFromPlan(
  plan: RefactorPlan,
  options: { dryRun: boolean; applied: boolean; undone: boolean; findingAcked: string },
): RefactorReport {
  const changes: RefactorChange[] = plan.patches.map((patch) => ({
    path: patch.path,
    action: patch.action,
    preview: previewOf(patch),
  }))
  return {
    ok: true,
    dryRun: options.dryRun,
    applied: options.applied,
    undone: options.undone,
    op: plan.op,
    note: plan.note,
    findingAcked: options.findingAcked,
    changes,
    inbound: plan.inbound,
    warnings: plan.warnings,
  }
}

async function readOptional(abs: string): Promise<string | null> {
  try {
    return await readFile(abs, 'utf8')
  } catch {
    return null
  }
}

export async function applyPlan(root: string, plan: RefactorPlan): Promise<void> {
  const snapshot: UndoSnapshot = { op: plan.op, files: [] }
  const seen = new Set<string>()
  for (const patch of plan.patches) {
    if (isRawRel(patch.path)) throw new Error('refusing to refactor under raw/; raw sources are immutable')
    if (seen.has(patch.path)) continue
    seen.add(patch.path)
    const abs = resolveUnder(root, patch.path)
    snapshot.files.push({ path: patch.path, previous: await readOptional(abs) })
  }
  for (const patch of plan.patches) {
    const abs = resolveUnder(root, patch.path)
    if (patch.action === 'delete') {
      await rm(abs, { force: true })
      continue
    }
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, patch.content, 'utf8')
  }
  await writeFile(path.join(root, UNDO_FILE), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  if (plan.logEntry.trim()) await appendLog(root, plan.logEntry)
}

export async function undoLast(root: string): Promise<RefactorReport> {
  const abs = path.join(root, UNDO_FILE)
  const raw = await readOptional(abs)
  if (!raw) throw new Error('no refactor-undo.json; nothing to undo')
  const snapshot = JSON.parse(raw) as UndoSnapshot
  const changes: RefactorChange[] = []
  for (const file of snapshot.files ?? []) {
    if (isRawRel(file.path)) continue
    const fileAbs = resolveUnder(root, file.path)
    if (file.previous === null) {
      await rm(fileAbs, { force: true })
      changes.push({ path: file.path, action: 'delete', preview: '(delete compiled page)' })
      continue
    }
    await mkdir(path.dirname(fileAbs), { recursive: true })
    await writeFile(fileAbs, file.previous, 'utf8')
    changes.push({
      path: file.path,
      action: 'write',
      preview: file.previous.replace(/\s+/g, ' ').trim().slice(0, 160),
    })
  }
  await rm(abs, { force: true })
  await appendLog(root, `refactor | undo ${snapshot.op}`)
  return {
    ok: true,
    dryRun: false,
    applied: false,
    undone: true,
    op: 'undo',
    note: `已撤销上一笔 ${snapshot.op}`,
    findingAcked: '',
    changes,
    inbound: [],
    warnings: [],
  }
}

export async function ackFinding(root: string, finding: string | undefined): Promise<string> {
  const id = finding?.trim() ?? ''
  if (!id) return ''
  await markFindings(root, [id], 'ack')
  return id
}
