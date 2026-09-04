import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { loadVaultPack, rawDirsOf } from './pack/index.js'
import { posixRel } from './paths.js'

export const RAW_HASH_FILE = '.wenmai/raw-hashes.json'

export interface RawHashIndex {
  version: 1
  byHash: Record<string, string>
}

function emptyIndex(): RawHashIndex {
  return { version: 1, byHash: {} }
}

function parseIndex(raw: unknown): RawHashIndex | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  if (input.version !== 1) return null
  if (!input.byHash || typeof input.byHash !== 'object' || Array.isArray(input.byHash)) return null
  const byHash: Record<string, string> = {}
  for (const [hash, rel] of Object.entries(input.byHash as Record<string, unknown>)) {
    if (typeof rel !== 'string' || !rel.trim()) return null
    byHash[hash] = rel.replace(/\\/g, '/')
  }
  return { version: 1, byHash }
}

async function readIndexFile(root: string): Promise<RawHashIndex | null> {
  try {
    return parseIndex(JSON.parse(await readFile(path.join(root, RAW_HASH_FILE), 'utf8')))
  } catch {
    return null
  }
}

async function writeIndex(root: string, index: RawHashIndex): Promise<void> {
  const abs = path.join(root, RAW_HASH_FILE)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}

async function hashMatches(root: string, rel: string, hash: string): Promise<boolean> {
  try {
    const text = await readFile(path.join(root, rel), 'utf8')
    return parseFrontmatter(text).frontmatter.sha256 === hash
  } catch {
    return false
  }
}

export async function rebuildRawHashIndex(root: string): Promise<RawHashIndex> {
  const pack = await loadVaultPack(root)
  const byHash: Record<string, string> = {}
  for (const dir of rawDirsOf(pack)) {
    const absDir = path.join(root, dir)
    let entries: string[] = []
    try {
      entries = await readdir(absDir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name.endsWith('.md')) continue
      const abs = path.join(absDir, name)
      const stored = parseFrontmatter(await readFile(abs, 'utf8')).frontmatter.sha256
      if (typeof stored !== 'string' || !stored.trim()) continue
      if (!byHash[stored]) byHash[stored] = posixRel(root, abs)
    }
  }
  const index: RawHashIndex = { version: 1, byHash }
  await writeIndex(root, index)
  return index
}

export async function findRawByHash(root: string, hash: string): Promise<string | null> {
  const cached = await readIndexFile(root)
  const hit = cached?.byHash[hash]
  if (hit && (await hashMatches(root, hit, hash))) return hit
  const rebuilt = await rebuildRawHashIndex(root)
  return rebuilt.byHash[hash] ?? null
}

export async function rememberRawHash(root: string, hash: string, rel: string): Promise<void> {
  const current = (await readIndexFile(root)) ?? emptyIndex()
  current.byHash[hash] = rel.replace(/\\/g, '/')
  await writeIndex(root, current)
}
