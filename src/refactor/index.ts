import { buildRefactorPlan } from './plan.js'
import { ackFinding, applyPlan, reportFromPlan, undoLast } from './apply.js'
import type { RefactorOptions, RefactorReport } from './types.js'

export type { RefactorOp, RefactorOptions, RefactorReport } from './types.js'
export { REFACTOR_OPS, UNDO_FILE } from './types.js'

export async function refactorVault(root: string, options: RefactorOptions = {}): Promise<RefactorReport> {
  if (options.undo === true) {
    return undoLast(root)
  }
  const dryRun = options.dryRun !== false
  const plan = await buildRefactorPlan(root, options)
  if (dryRun || plan.patches.length === 0) {
    return reportFromPlan(plan, { dryRun, applied: false, undone: false, findingAcked: '' })
  }
  await applyPlan(root, plan)
  const findingAcked = await ackFinding(root, options.finding)
  return reportFromPlan(plan, { dryRun: false, applied: true, undone: false, findingAcked })
}
