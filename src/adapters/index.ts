import { spawn } from 'node:child_process'
import path from 'node:path'

export const ADAPTER_EXTENSIONS = ['.pdf', '.docx'] as const
export const MAX_ADAPTER_BYTES = 20 * 1024 * 1024

export type AdapterKind = 'pdf' | 'docx'

export interface TranscribeResult {
  text: string
  adapter: string
}

export type TranscribeFn = (abs: string, kind: AdapterKind) => Promise<TranscribeResult>

export interface AdapterCommand {
  command: string
  args: (file: string) => string[]
}

export interface AdapterCommands {
  pdf: AdapterCommand
  docx: AdapterCommand
}

export const DEFAULT_ADAPTER_COMMANDS: AdapterCommands = {
  pdf: { command: 'pdftotext', args: (file) => ['-layout', file, '-'] },
  docx: { command: 'pandoc', args: (file) => ['-t', 'markdown', '--wrap=none', file] },
}

export class AdapterDisabledError extends Error {
  constructor(kind: AdapterKind) {
    super(
      `${kind === 'pdf' ? 'PDF' : 'Word'} ingest is disabled. Set ingestAdapters: true in the wenmai plugin config, or convert to Markdown first.`,
    )
    this.name = 'AdapterDisabledError'
  }
}

export class AdapterMissingError extends Error {
  constructor(command: string) {
    super(
      `${command} not found. Install it locally (pdftotext via poppler, docx via pandoc) or convert to Markdown first.`,
    )
    this.name = 'AdapterMissingError'
  }
}

const KIND_BY_EXT: Record<string, AdapterKind> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
}

export function adapterKindOf(filePath: string): AdapterKind | null {
  return KIND_BY_EXT[path.extname(filePath).toLowerCase()] ?? null
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new AdapterMissingError(command))
        return
      }
      reject(error)
    })
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim() || 'no stderr'
        reject(new Error(`${command} exited ${code}: ${detail}`))
        return
      }
      const text = Buffer.concat(stdout).toString('utf8').trim()
      if (!text) {
        reject(new Error(`${command} produced empty text`))
        return
      }
      resolve(text)
    })
  })
}

export async function transcribeLocalFile(
  abs: string,
  kind: AdapterKind,
  commands: AdapterCommands = DEFAULT_ADAPTER_COMMANDS,
): Promise<TranscribeResult> {
  const spec = commands[kind]
  const text = await runCommand(spec.command, spec.args(abs))
  return { text, adapter: spec.command }
}
