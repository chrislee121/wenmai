import type { OpName } from './catalog.js'
import type { OpInput } from './index.js'

export type LooseArgs = Record<string, string | number | boolean | undefined>

export function inputFromToolArgs(op: OpName, args: LooseArgs, workspace?: string): OpInput {
  const input: OpInput = { ...args, op, workspace }
  if (op === 'tasks' && typeof args.op === 'string') input.taskOp = args.op
  if (op === 'refactor' && typeof args.op === 'string') input.refactorOp = args.op
  return input
}
