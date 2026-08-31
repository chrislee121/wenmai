import { createHash } from 'node:crypto'

export type FindingKind =
  | 'page-stale'
  | 'source-missing'
  | 'page-expired'
  | 'duplicate'
  | 'conflict-candidate'
  | 'orphan-page'
  | 'oversized-page'
  | 'hub-overload'
  | 'index-mismatch'

export type FindingSeverity = 'error' | 'warning' | 'info'

export interface Finding {
  id: string
  kind: FindingKind
  severity: FindingSeverity
  paths: string[]
  reason: string
  action: string
}

export function fingerprint(kind: FindingKind, paths: string[], key = ''): string {
  const payload = [kind, ...[...paths].sort(), key].join('|')
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16)
}

export function finding(input: Omit<Finding, 'id'> & { key?: string }): Finding {
  return {
    id: fingerprint(input.kind, input.paths, input.key ?? ''),
    kind: input.kind,
    severity: input.severity,
    paths: input.paths,
    reason: input.reason,
    action: input.action,
  }
}
