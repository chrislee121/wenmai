export const REFACTOR_OPS = ['rename', 'move', 'link', 'archive', 'merge', 'split', 'rewrite'] as const

export type RefactorOp = (typeof REFACTOR_OPS)[number]

export interface RefactorOptions {
  op?: string
  dryRun?: boolean
  source?: string
  target?: string
  title?: string
  content?: string
  contentB?: string
  finding?: string
  undo?: boolean
}

export interface RefactorChange {
  path: string
  action: 'write' | 'delete'
  preview: string
}

export interface RefactorLinkRewrite {
  from: string
  oldLink: string
  newLink: string
}

export interface RefactorReport {
  ok: true
  dryRun: boolean
  applied: boolean
  undone: boolean
  op: string
  note: string
  findingAcked: string
  changes: RefactorChange[]
  inbound: RefactorLinkRewrite[]
  warnings: string[]
}

export interface FilePatch {
  path: string
  action: 'write' | 'delete'
  content: string
}

export interface RefactorPlan {
  op: RefactorOp | 'undo'
  note: string
  warnings: string[]
  inbound: RefactorLinkRewrite[]
  patches: FilePatch[]
  logEntry: string
}

export const UNDO_FILE = 'refactor-undo.json'

export interface UndoSnapshot {
  op: string
  files: Array<{ path: string; previous: string | null }>
}
