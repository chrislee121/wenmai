import { homedir } from 'node:os'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expandHome, PathEscapeError } from './paths.js'

export type SourceRootOrigin = 'workspace' | 'plugin' | 'agent'

export interface SourceRootRef {
  path: string
  origin: SourceRootOrigin
}

export const SOURCE_ROOTS_FILE = 'source-roots.json'

interface SessionLike {
  header?: { cwd?: string }
  cwd?: string
}

interface AgentLike {
  session?: SessionLike
}

export function sessionWorkspaceCwd(agent?: AgentLike): string | undefined {
  const raw = agent?.session?.header?.cwd ?? agent?.session?.cwd
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  return sanitizeRoot(raw)
}

export function sanitizeRoot(input: string): string | undefined {
  const resolved = path.resolve(expandHome(input.trim()))
  if (!resolved || isTooBroad(resolved)) return undefined
  return resolved
}

export function isTooBroad(dir: string): boolean {
  const resolved = path.resolve(dir)
  const home = homedir()
  const root = path.parse(resolved).root
  return resolved === home || resolved === root || resolved === '/'
}

export function mergeSourceRoots(parts: {
  workspace?: string
  plugin: string[]
  agent: string[]
}): SourceRootRef[] {
  const out: SourceRootRef[] = []
  const seen = new Set<string>()
  const push = (origin: SourceRootOrigin, raw: string | undefined) => {
    if (!raw) return
    const resolved = sanitizeRoot(raw)
    if (!resolved || seen.has(resolved)) return
    seen.add(resolved)
    out.push({ path: resolved, origin })
  }
  push('workspace', parts.workspace)
  for (const item of parts.plugin) push('plugin', item)
  for (const item of parts.agent) push('agent', item)
  return out
}

export async function readAgentSourceRoots(vaultRoot: string): Promise<string[]> {
  try {
    const raw = await readFile(path.join(vaultRoot, SOURCE_ROOTS_FILE), 'utf8')
    const parsed = JSON.parse(raw) as { sourceRoots?: unknown }
    if (!Array.isArray(parsed.sourceRoots)) return []
    return parsed.sourceRoots.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

export async function writeAgentSourceRoots(vaultRoot: string, roots: string[]): Promise<string[]> {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const item of roots) {
    const resolved = sanitizeRoot(item)
    if (!resolved) {
      throw new PathEscapeError(`source root is too broad or empty: ${item}`)
    }
    if (seen.has(resolved)) continue
    seen.add(resolved)
    unique.push(resolved)
  }
  await mkdir(vaultRoot, { recursive: true })
  await writeFile(
    path.join(vaultRoot, SOURCE_ROOTS_FILE),
    `${JSON.stringify({ sourceRoots: unique }, null, 2)}\n`,
    'utf8',
  )
  return unique
}

export async function addAgentSourceRoot(vaultRoot: string, input: string): Promise<string[]> {
  const current = await readAgentSourceRoots(vaultRoot)
  return writeAgentSourceRoots(vaultRoot, [...current, input])
}

export async function removeAgentSourceRoot(vaultRoot: string, input: string): Promise<string[]> {
  const resolved = sanitizeRoot(input)
  const current = await readAgentSourceRoots(vaultRoot)
  const next = resolved ? current.filter((item) => sanitizeRoot(item) !== resolved) : current
  return writeAgentSourceRoots(vaultRoot, next)
}
