import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ingestText, titleFromMarkdown, type IngestResult } from '../store.js'
import { adapterKindOf, AdapterDisabledError, transcribeLocalFile, type TranscribeFn } from './index.js'

export async function ingestSourceFile(
  root: string,
  abs: string,
  options: {
    title?: string
    kind?: string
    adapters?: boolean
    transcribe?: TranscribeFn
    appendLogEntry?: boolean
  } = {},
): Promise<IngestResult> {
  const adapterKind = adapterKindOf(abs)
  if (adapterKind) {
    if (!options.adapters) throw new AdapterDisabledError(adapterKind)
    const transcribed = await (options.transcribe ?? ((file, kind) => transcribeLocalFile(file, kind)))(abs, adapterKind)
    const bytes = await readFile(abs)
    const title =
      options.title?.trim() || titleFromMarkdown(transcribed.text, path.basename(abs, path.extname(abs)))
    return ingestText(root, {
      title,
      body: transcribed.text,
      kind: options.kind,
      sourcePath: abs,
      appendLogEntry: options.appendLogEntry,
      original: {
        bytes,
        ext: path.extname(abs).toLowerCase(),
        adapter: transcribed.adapter,
      },
    })
  }
  const body = await readFile(abs, 'utf8')
  const title = options.title?.trim() || titleFromMarkdown(body, path.basename(abs, path.extname(abs)))
  return ingestText(root, {
    title,
    body,
    kind: options.kind,
    sourcePath: abs,
    appendLogEntry: options.appendLogEntry,
  })
}
