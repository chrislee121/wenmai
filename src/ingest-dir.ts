import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { RawKind } from './layout.js'
import { expandHome, isUnderRoot, PathEscapeError } from './paths.js'
import { MAX_SOURCE_FILES, scanSourceMarkdown, type ScanSkip } from './scan.js'
import { appendLog, ingestText, isInitialized, titleFromMarkdown } from './store.js'

export interface IngestDirItem {
  sourcePath: string
  rel: string
  title: string
  rawPath?: string
  sha256?: string
  deduped?: boolean
}

export interface IngestDirResult {
  ok: true
  dryRun: boolean
  dir: string
  kind: RawKind
  planned: number
  ingested: number
  deduped: number
  truncated: boolean
  maxFiles: number
  notMarkdownCount: number
  hint: string | null
  files: IngestDirItem[]
  skipped: Array<{ path: string; reason: ScanSkip['reason'] }>
  compileHint: string
}

function assertAllowedDir(abs: string, allowedRoots: string[]): void {
  const home = path.resolve(homedir())
  if (abs === home) {
    throw new PathEscapeError('refusing to scan the home directory')
  }
  if (allowedRoots.length === 0) {
    throw new PathEscapeError('pick a workspace or pass dir inside a configured sourceRoots directory')
  }
  if (!allowedRoots.some((root) => isUnderRoot(root, abs))) {
    throw new PathEscapeError('dir must be inside the session workspace or a configured sourceRoots directory')
  }
}

export function resolveIngestDir(dir: string, workspaceCwd: string | undefined): string {
  const trimmed = dir.trim()
  if (!trimmed) throw new PathEscapeError('dir is empty')
  const expanded = expandHome(trimmed)
  return path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(workspaceCwd ?? process.cwd(), expanded)
}

export async function ingestDirectory(
  vaultRoot: string,
  dir: string,
  options: {
    allowedRoots: string[]
    kind?: RawKind
    dryRun?: boolean
    workspaceCwd?: string
  },
): Promise<IngestDirResult> {
  if (!(await isInitialized(vaultRoot))) {
    throw new Error('vault is not initialized; call wenmai_init first')
  }
  const absDir = resolveIngestDir(dir, options.workspaceCwd)
  assertAllowedDir(absDir, options.allowedRoots)
  const kind: RawKind = options.kind ?? 'workspace'
  const dryRun = options.dryRun !== false
  const scan = await scanSourceMarkdown([absDir], MAX_SOURCE_FILES)
  const skipped = scan.skipped.map((item) => ({ path: item.abs, reason: item.reason }))
  const hint = scan.truncated
    ? `hit maxFiles ${scan.maxFiles}; split the directory and ingest remaining files`
    : null
  const compileHint =
    'Directory ingest only writes raw/. Compile selected pages with wenmai_write; do not auto-compile the whole batch.'

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      dir: absDir,
      kind,
      planned: scan.files.length,
      ingested: 0,
      deduped: 0,
      truncated: scan.truncated,
      maxFiles: scan.maxFiles,
      notMarkdownCount: scan.notMarkdownCount,
      hint,
      files: scan.files.map((file) => ({
        sourcePath: file.abs,
        rel: file.rel,
        title: path.basename(file.abs, '.md'),
      })),
      skipped,
      compileHint,
    }
  }

  const files: IngestDirItem[] = []
  let ingested = 0
  let deduped = 0
  for (const file of scan.files) {
    const body = await readFile(file.abs, 'utf8')
    const title = titleFromMarkdown(body, path.basename(file.abs, '.md'))
    const result = await ingestText(vaultRoot, {
      title,
      body,
      kind,
      sourcePath: file.abs,
      appendLogEntry: false,
    })
    if (result.deduped) deduped += 1
    else ingested += 1
    files.push({
      sourcePath: file.abs,
      rel: file.rel,
      title,
      rawPath: result.rawPath,
      sha256: result.sha256,
      deduped: result.deduped,
    })
  }
  await appendLog(
    vaultRoot,
    `ingest-dir | ${absDir}\n- kind: ${kind}\n- ingested: ${ingested}\n- deduped: ${deduped}\n- planned: ${scan.files.length}`,
  )
  return {
    ok: true,
    dryRun: false,
    dir: absDir,
    kind,
    planned: scan.files.length,
    ingested,
    deduped,
    truncated: scan.truncated,
    maxFiles: scan.maxFiles,
    notMarkdownCount: scan.notMarkdownCount,
    hint,
    files,
    skipped,
    compileHint,
  }
}
