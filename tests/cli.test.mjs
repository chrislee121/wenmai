import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { initVault } from '../dist/store.js'

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/cli.js')

async function withVault(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenmai-cli-'))
  try {
    await initVault(dir, 'cli')
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function runCli(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

test('cli written returns NEW on a fresh vault', async () => {
  await withVault(async (root) => {
    const result = await runCli(['--root', root, 'written', '不存在的选题xyz'])
    assert.equal(result.code, 0, result.stderr)
    const body = JSON.parse(result.stdout)
    assert.equal(body.ok, true)
    assert.equal(body.verdict, 'NEW')
  })
})

test('cli ingest directory defaults to dry-run', async () => {
  await withVault(async (root) => {
    const drafts = path.join(root, 'drafts')
    await mkdir(drafts)
    await writeFile(path.join(drafts, 'alpha.md'), '# Alpha\n\nbody\n')
    const result = await runCli(['--root', root, '--workspace', drafts, 'ingest', '--dir', drafts])
    assert.equal(result.code, 0, result.stderr)
    const body = JSON.parse(result.stdout)
    assert.equal(body.ok, true)
    assert.equal(body.dryRun, true)
    assert.equal(body.planned, 1)
  })
})

test('cli review returns a report', async () => {
  await withVault(async (root) => {
    const result = await runCli(['--root', root, 'review'])
    assert.equal(result.code, 0, result.stderr)
    const body = JSON.parse(result.stdout)
    assert.equal(body.ok, true)
    assert.equal(typeof body.findingCount, 'number')
  })
})
