import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadVaultPack } from '../pack/index.js'
import type { RawKind } from '../pack/types.js'
import { expandHome, isUnderRoot, PathEscapeError } from '../paths.js'
import { ingestText, titleFromMarkdown } from '../store.js'

export function normalizeKind(kind: string | undefined, allowed: readonly string[]): RawKind | undefined {
  if (!kind) return undefined
  if (allowed.includes(kind)) return kind
  throw new Error(`kind must be ${allowed.join(' | ')}`)
}

export async function ingestFromArgs(
  root: string,
  sourceRoots: string[],
  workspaceCwd: string | undefined,
  args: { filePath?: string; content?: string; title?: string; kind?: string },
) {
  const pack = await loadVaultPack(root)
  let body = args.content?.trim() ?? ''
  let sourcePath: string | undefined
  if (args.filePath?.trim()) {
    const rawPath = args.filePath.trim()
    const expanded = expandHome(rawPath)
    const abs = path.isAbsolute(expanded)
      ? path.resolve(expanded)
      : path.resolve(workspaceCwd ?? process.cwd(), expanded)
    if (sourceRoots.length > 0 && !sourceRoots.some((item) => isUnderRoot(item, abs))) {
      throw new PathEscapeError('filePath must be inside the session workspace or a configured sourceRoots directory')
    }
    body = await readFile(abs, 'utf8')
    sourcePath = abs
  }
  if (!body) throw new Error('provide filePath, content, or dir')
  const title =
    args.title?.trim() ||
    titleFromMarkdown(body, sourcePath ? path.basename(sourcePath, path.extname(sourcePath)) : 'untitled')
  const kind = normalizeKind(args.kind, pack.rawKinds) ?? (sourcePath ? 'workspace' : 'articles')
  return ingestText(root, { title, body, kind, sourcePath })
}
