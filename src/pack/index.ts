import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BUILTIN_PACKS, WRITER_PACK } from './writer.js'
import { PACK_FILE, type PackConfig } from './types.js'

export { PACK_FILE, WRITER_PACK }
export type { PackConfig } from './types.js'

export function builtinPack(id = 'writer'): PackConfig {
  const pack = BUILTIN_PACKS[id]
  if (!pack) throw new Error(`unknown pack ${id}; built-in: ${Object.keys(BUILTIN_PACKS).join(' | ')}`)
  return pack
}

export function rawDirsOf(pack: PackConfig): string[] {
  return pack.rawKinds.map((kind) => `raw/${kind}`)
}

export function indexHeading(pack: PackConfig, type: string): string {
  const dir = pack.typeToDir[type]
  if (!dir) return '## Concepts'
  const label = pack.indexHeadings[dir] ?? `${dir[0]!.toUpperCase()}${dir.slice(1)}`
  return `## ${label}`
}

export function inferTypeFromPath(rel: string, pack: PackConfig): string {
  const top = rel.replace(/\\/g, '/').split('/')[0] ?? ''
  for (const [type, dir] of Object.entries(pack.typeToDir)) {
    if (dir === top) return type
  }
  return 'summary'
}

export function typeFromDir(dir: string, pack: PackConfig): string {
  for (const [type, mapped] of Object.entries(pack.typeToDir)) {
    if (mapped === dir) return type
  }
  return 'concept'
}

export function isPageDir(dir: string, pack: PackConfig): boolean {
  return pack.pageDirs.includes(dir)
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) return null
  return value.map((item) => item.trim())
}

export function parsePack(raw: unknown): PackConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const pageDirs = asStringArray(input.pageDirs)
  const rawKinds = asStringArray(input.rawKinds)
  const pageTypes = asStringArray(input.pageTypes)
  const tagTaxonomy = asStringArray(input.tagTaxonomy)
  if (!id || !pageDirs || !rawKinds || !pageTypes || !tagTaxonomy) return null
  if (!input.typeToDir || typeof input.typeToDir !== 'object' || Array.isArray(input.typeToDir)) return null
  if (!input.indexHeadings || typeof input.indexHeadings !== 'object' || Array.isArray(input.indexHeadings)) return null
  const typeToDir: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(input.typeToDir as Record<string, unknown>)) {
    if (value !== null && typeof value !== 'string') return null
    typeToDir[key] = value
  }
  const indexHeadings: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.indexHeadings as Record<string, unknown>)) {
    if (typeof value !== 'string' || !value.trim()) return null
    indexHeadings[key] = value.trim()
  }
  return { id, pageDirs, rawKinds, pageTypes, typeToDir, indexHeadings, tagTaxonomy }
}

export async function loadVaultPack(root: string): Promise<PackConfig> {
  try {
    const raw = JSON.parse(await readFile(path.join(root, PACK_FILE), 'utf8')) as unknown
    const parsed = parsePack(raw)
    if (parsed) return parsed
  } catch {
    // missing or invalid → writer defaults so existing vaults keep working
  }
  return WRITER_PACK
}

export async function writeVaultPack(root: string, pack: PackConfig): Promise<void> {
  const abs = path.join(root, PACK_FILE)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, `${JSON.stringify(pack, null, 2)}\n`, 'utf8')
}
