#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cliHelp, parseCliArgv } from './cli/parse.js'
import { serveMcp } from './mcp/stdio.js'
import { runOp } from './ops/index.js'
import { makeOpsRuntime } from './ops/runtime.js'

function packageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')) as { version?: string }
  return pkg.version ?? '0.0.0'
}

export async function main(argv = process.argv): Promise<number> {
  const parsed = parseCliArgv(argv)
  if (parsed.version) {
    process.stdout.write(`${packageVersion()}\n`)
    return 0
  }
  if (parsed.help) {
    process.stdout.write(`${cliHelp()}\n`)
    return parsed.error ? 1 : 0
  }
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`)
    return 1
  }
  const runtime = makeOpsRuntime({
    root: parsed.root,
    ingestAdapters: parsed.ingestAdapters,
    research: parsed.research,
  })
  if (parsed.mcp) {
    await serveMcp(runtime, packageVersion(), parsed.workspace)
    return 0
  }
  if (!parsed.op) {
    process.stdout.write(`${cliHelp()}\n`)
    return 1
  }
  try {
    const result = await runOp(runtime, parsed.input)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    const failed = result && typeof result === 'object' && 'ok' in result && (result as { ok: unknown }).ok === false
    return failed ? 1 : 0
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`,
    )
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().then((code) => process.exit(code))
}
