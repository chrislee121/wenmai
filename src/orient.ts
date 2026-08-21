import { readFile } from 'node:fs/promises'
import path from 'node:path'

const LOG_TAIL_LINES = 30

export async function buildOrient(root: string, budgetChars: number): Promise<string> {
  const schema = await readOptional(path.join(root, 'SCHEMA.md'))
  const index = await readOptional(path.join(root, 'index.md'))
  const log = await readOptional(path.join(root, 'log.md'))
  if (!schema && !index && !log) {
    return '文脉尚未初始化。请先调用 wenmai_init，并指定这个知识库覆盖的领域。'
  }
  const logTail = tailLines(log, LOG_TAIL_LINES)
  const parts = [
    '# 文脉定向（会话开始只读一次）',
    '',
    '## SCHEMA.md',
    schema || '（缺失）',
    '',
    '## index.md',
    index || '（缺失）',
    '',
    `## log.md（最近 ${LOG_TAIL_LINES} 行）`,
    logTail || '（缺失）',
  ]
  return truncate(parts.join('\n'), budgetChars)
}

async function readOptional(abs: string): Promise<string> {
  try {
    return (await readFile(abs, 'utf8')).trim()
  } catch {
    return ''
  }
}

export function tailLines(text: string, count: number): string {
  if (!text) return ''
  const lines = text.split('\n')
  return lines.slice(Math.max(0, lines.length - count)).join('\n')
}

export function truncate(text: string, budget: number): string {
  if (text.length <= budget) return text
  return `${text.slice(0, Math.max(0, budget - 20)).trimEnd()}\n\n…（开局定向已截断）`
}
