import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AdapterDisabledError, AdapterMissingError, transcribeLocalFile } from '../dist/adapters/index.js'
import { ingestSourceFile } from '../dist/adapters/ingest.js'
import { ingestDirectory } from '../dist/ingest-dir.js'
import { lintVault } from '../dist/lint.js'
import { ingestFromArgs } from '../dist/plugin/ingest-args.js'
import { initVault, sha256Bytes } from '../dist/store.js'

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-adapter-'))
  try {
    await initVault(dir, 'AI tools')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const FAKE_PDF = Buffer.from('%PDF-fake-original-bytes')

async function fakeTranscribe() {
  return { text: '# From PDF\n\nHello from adapter.\n', adapter: 'pdftotext' }
}

test('PDF ingest is rejected when adapters are off', async () => {
  await withVault(async (dir) => {
    const pdf = path.join(dir, 'draft.pdf')
    await writeFile(pdf, FAKE_PDF)
    await assert.rejects(
      () => ingestFromArgs(dir, [dir], dir, { filePath: pdf, adapters: false }),
      AdapterDisabledError,
    )
    await assert.rejects(
      () => ingestSourceFile(dir, pdf, { adapters: false }),
      /ingestAdapters/,
    )
  })
})

test('enabled adapter stores original bytes plus transcription and dedupes by original hash', async () => {
  await withVault(async (dir) => {
    const pdf = path.join(dir, 'draft.pdf')
    await writeFile(pdf, FAKE_PDF)
    const first = await ingestSourceFile(dir, pdf, {
      adapters: true,
      transcribe: fakeTranscribe,
      kind: 'papers',
    })
    assert.equal(first.deduped, false)
    assert.equal(first.rawPath, 'raw/papers/from-pdf.md')
    assert.equal(first.originalPath, 'raw/papers/from-pdf.pdf')
    assert.equal(first.sha256, sha256Bytes(FAKE_PDF))
    const md = await readFile(path.join(dir, first.rawPath), 'utf8')
    assert.match(md, /adapter: pdftotext/)
    assert.match(md, /original: raw\/papers\/from-pdf\.pdf/)
    assert.match(md, /Hello from adapter/)
    const copied = await readFile(path.join(dir, first.originalPath))
    assert.deepEqual(copied, FAKE_PDF)

    const second = await ingestSourceFile(dir, pdf, {
      adapters: true,
      transcribe: fakeTranscribe,
      kind: 'papers',
    })
    assert.equal(second.deduped, true)
    assert.equal(second.rawPath, first.rawPath)

    const lint = await lintVault(dir)
    assert.equal(lint.diagnostics.some((item) => item.code === 'raw-hash-drift'), false)
  })
})

test('lint reports missing original beside a transcription', async () => {
  await withVault(async (dir) => {
    const pdf = path.join(dir, 'draft.pdf')
    await writeFile(pdf, FAKE_PDF)
    const ingested = await ingestSourceFile(dir, pdf, {
      adapters: true,
      transcribe: fakeTranscribe,
      kind: 'papers',
    })
    await unlink(path.join(dir, ingested.originalPath))
    const lint = await lintVault(dir)
    assert.ok(lint.diagnostics.some((item) => item.code === 'raw-original-missing'))
  })
})

test('directory ingest lists pdf only when adapters are on', async () => {
  await withVault(async (dir) => {
    const sources = path.join(dir, 'drafts')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(sources)
    await writeFile(path.join(sources, 'note.md'), '# Note\n\nmd\n')
    await writeFile(path.join(sources, 'scan.pdf'), FAKE_PDF)
    const off = await ingestDirectory(dir, sources, { allowedRoots: [sources], dryRun: true, adapters: false })
    assert.equal(off.planned, 1)
    assert.equal(off.notMarkdownCount, 1)
    const on = await ingestDirectory(dir, sources, {
      allowedRoots: [sources],
      dryRun: false,
      adapters: true,
      transcribe: fakeTranscribe,
    })
    assert.equal(on.ingested, 2)
    assert.ok(on.files.some((item) => item.rawPath?.endsWith('.md') && item.sourcePath.endsWith('.pdf')))
  })
})

test('missing transcribe binary explains the install, and does not fake success', async () => {
  await assert.rejects(
    () =>
      transcribeLocalFile('/tmp/missing.pdf', 'pdf', {
        pdf: { command: 'wenmai-no-such-pdftotext', args: () => ['-'] },
        docx: { command: 'pandoc', args: (file) => [file] },
      }),
    AdapterMissingError,
  )
})
