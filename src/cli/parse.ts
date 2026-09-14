import type { OpName } from '../ops/catalog.js'
import { toolByOp, WENMAI_TOOLS } from '../ops/catalog.js'
import type { LooseArgs } from '../ops/input.js'
import type { OpInput } from '../ops/index.js'
import { inputFromToolArgs } from '../ops/input.js'

const GLOBAL_NAMES = new Set(['root', 'workspace', 'adapters', 'research', 'help', 'h', 'version', 'V'])

export type ParsedCli = {
  help: boolean
  version: boolean
  mcp: boolean
  root: string
  workspace?: string
  ingestAdapters: boolean
  research: boolean
  op?: OpName
  input: OpInput
  error?: string
}

function kebabToCamel(flag: string): string {
  return flag.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
}

function parseValue(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw
}

function readFlag(
  tokens: string[],
  index: number,
): { name: string; value: string | number | boolean; consumed: number } | { skip: true; consumed: number } | null {
  const token = tokens[index]
  if (!token) return null
  if (token === '-h') return { name: 'help', value: true, consumed: 1 }
  if (token === '-V') return { name: 'version', value: true, consumed: 1 }
  if (!token.startsWith('--')) return null
  const body = token.slice(2)
  if (body.startsWith('no-')) return { name: kebabToCamel(body.slice(3)), value: false, consumed: 1 }
  const eq = body.indexOf('=')
  if (eq >= 0) {
    return { name: kebabToCamel(body.slice(0, eq)), value: parseValue(body.slice(eq + 1)), consumed: 1 }
  }
  const name = kebabToCamel(body)
  const next = tokens[index + 1]
  if (next && !next.startsWith('-')) {
    return { name, value: parseValue(next), consumed: 2 }
  }
  return { name, value: true, consumed: 1 }
}

export function parseCliArgv(argv: string[]): ParsedCli {
  const tokens = argv.slice(2)
  const globals: Record<string, string | number | boolean> = {}
  let i = 0
  while (i < tokens.length) {
    const flag = readFlag(tokens, i)
    if (!flag || !('name' in flag) || !GLOBAL_NAMES.has(flag.name)) break
    globals[flag.name] = flag.value
    i += flag.consumed
  }

  const help = globals.help === true || globals.h === true
  const version = globals.version === true || globals.V === true
  const root =
    typeof globals.root === 'string' && globals.root.trim()
      ? globals.root
      : process.env.WENMAI_ROOT?.trim() || '~/wenmai'
  const workspace = typeof globals.workspace === 'string' ? globals.workspace : undefined
  const ingestAdapters = globals.adapters === true
  const research = globals.research === true

  const command = tokens[i]
  if (!command) {
    return { help: help || !version, version, mcp: false, root, workspace, ingestAdapters, research, input: {} }
  }
  i += 1
  if (command === 'mcp') {
    return { help, version, mcp: true, root, workspace, ingestAdapters, research, input: {} }
  }
  if (command === 'help') {
    return { help: true, version, mcp: false, root, workspace, ingestAdapters, research, input: {} }
  }
  const tool = toolByOp(command)
  if (!tool) {
    return {
      help: false,
      version,
      mcp: false,
      root,
      workspace,
      ingestAdapters,
      research,
      error: `unknown command: ${command}`,
      input: {},
    }
  }

  const flags: LooseArgs = {}
  const positional: string[] = []
  while (i < tokens.length) {
    const token = tokens[i]
    if (token === '--write') {
      flags.dryRun = false
      i += 1
      continue
    }
    const flag = readFlag(tokens, i)
    if (flag && 'name' in flag) {
      flags[flag.name] = flag.value
      i += flag.consumed
      continue
    }
    if (token) positional.push(token)
    i += 1
  }

  if (typeof flags.file === 'string' && !flags.filePath) flags.filePath = flags.file
  if ((tool.op === 'written' || tool.op === 'search') && !flags.query && positional.length) {
    flags.query = positional.join(' ')
  }
  if (tool.op === 'init' && !flags.domain && positional.length) flags.domain = positional.join(' ')
  if (tool.op === 'read' && !flags.path && positional[0]) flags.path = positional[0]
  if (tool.op === 'ingest' && !flags.dir && !flags.filePath && !flags.content && positional[0]) {
    flags.dir = positional[0]
  }

  return {
    help,
    version,
    mcp: false,
    root,
    workspace,
    ingestAdapters: ingestAdapters || flags.adapters === true,
    research: research || flags.research === true,
    op: tool.op,
    input: inputFromToolArgs(tool.op, flags, workspace),
  }
}

export function cliHelp(): string {
  const commands = WENMAI_TOOLS.map((item) => `  ${item.op.padEnd(10)} ${item.description.split('。')[0]}`).join('\n')
  return [
    'wenmai — 文脉命令行。不必经过 DeepSeek Harness。',
    '',
    '用法:',
    '  wenmai [--root PATH] [--workspace PATH] [--adapters] [--research] <command> [options]',
    '  wenmai mcp',
    '',
    '全局:',
    '  --root         数据根，默认 ~/wenmai，也可用 WENMAI_ROOT',
    '  --workspace    当前文稿目录（相当于 Harness 工作区）',
    '  --adapters     打开本机 PDF/Word 转写',
    '  --research     打开目录缺页查旧稿',
    '',
    '命令:',
    commands,
    '  mcp        以 stdio 提供 MCP，工具名与 wenmai_* 一致',
    '',
    '写类默认 dry-run。目录收录或重构要真正写入时加 --write。',
    '动笔前先问写过没有: wenmai written "这个选题"',
  ].join('\n')
}
