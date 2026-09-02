import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { lstat, realpath } from 'node:fs/promises'

const FORBIDDEN_SEGMENT = /[\\%]|[\u0000-\u001f]/

export class PathEscapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathEscapeError'
  }
}

export function expandHome(input: string): string {
  if (input === '~') return homedir()
  if (input.startsWith('~/')) return path.join(homedir(), input.slice(2))
  return input
}

const DEFAULT_VAULT = '~/wenmai'
const LEGACY_VAULT = '~/tongjian' // 兼容更名之前的默认目录

export function resolveRoot(root: string): string {
  const expanded = expandHome(root.trim())
  if (!expanded) throw new PathEscapeError('root must be a non-empty path')
  const resolved = path.resolve(expanded)
  const usingDefault = path.resolve(expandHome(DEFAULT_VAULT)) === resolved
  if (usingDefault && !existsSync(resolved) && existsSync(expandHome(LEGACY_VAULT))) {
    return path.resolve(expandHome(LEGACY_VAULT))
  }
  return resolved
}

function assertSafeRelative(rel: string): string {
  const trimmed = rel.trim().replace(/\\/g, '/')
  if (!trimmed) throw new PathEscapeError('path is empty')
  if (path.isAbsolute(trimmed)) throw new PathEscapeError('absolute paths are not allowed')
  const segments = trimmed.split('/').filter((part) => part.length > 0)
  if (segments.length === 0) throw new PathEscapeError('path is empty')
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new PathEscapeError(`illegal path segment: ${segment}`)
    }
    if (FORBIDDEN_SEGMENT.test(segment)) {
      throw new PathEscapeError(`illegal character in path: ${segment}`)
    }
  }
  return segments.join('/')
}

export function resolveUnder(root: string, rel: string): string {
  const rootAbs = path.resolve(root)
  const safeRel = assertSafeRelative(rel)
  const abs = path.resolve(rootAbs, safeRel)
  const relToRoot = path.relative(rootAbs, abs)
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new PathEscapeError('path escapes wenmai root')
  }
  return abs
}

export function isUnderRoot(root: string, candidate: string): boolean {
  const rootAbs = path.resolve(expandHome(root))
  const abs = path.resolve(expandHome(candidate))
  const rel = path.relative(rootAbs, abs)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export async function assertNoSymlinkEscape(root: string, abs: string): Promise<void> {
  const rootReal = await realpath(path.resolve(root))
  let cursor = abs
  const seen = new Set<string>()
  while (!seen.has(cursor)) {
    seen.add(cursor)
    try {
      const stat = await lstat(cursor)
      if (stat.isSymbolicLink()) {
        throw new PathEscapeError(`symbolic link rejected: ${cursor}`)
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw error
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    cursor = parent
    if (!isUnderRoot(rootReal, cursor) && cursor !== rootReal) break
  }

  try {
    const real = await realpath(abs)
    if (!isUnderRoot(rootReal, real)) {
      throw new PathEscapeError('realpath escapes wenmai root')
    }
  } catch (error) {
    if (error instanceof PathEscapeError) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
    try {
      const parentReal = await realpath(path.dirname(abs))
      if (!isUnderRoot(rootReal, parentReal)) {
        throw new PathEscapeError('parent path escapes wenmai root')
      }
    } catch (parentError) {
      const parentCode = (parentError as NodeJS.ErrnoException).code
      if (parentCode !== 'ENOENT') throw parentError
    }
  }
}

export function posixRel(root: string, abs: string): string {
  return path.relative(path.resolve(root), abs).split(path.sep).join('/')
}

export function isRawRel(rel: string): boolean {
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\//, '').trim()
  return normalized === 'raw' || normalized.startsWith('raw/')
}
