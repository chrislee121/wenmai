export interface Frontmatter {
  title?: string
  created?: string
  updated?: string
  type?: string
  tags?: string[]
  sources?: string[]
  source_url?: string
  ingested?: string
  sha256?: string
  [key: string]: unknown
}

export interface ParsedDocument {
  frontmatter: Frontmatter
  body: string
  rawYaml: string
  hasFrontmatter: boolean
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontmatter(text: string): ParsedDocument {
  const match = FENCE.exec(text)
  if (!match) {
    return { frontmatter: {}, body: text, rawYaml: '', hasFrontmatter: false }
  }
  const rawYaml = match[1] ?? ''
  const body = text.slice(match[0].length)
  return {
    frontmatter: parseSimpleYaml(rawYaml),
    body,
    rawYaml,
    hasFrontmatter: true,
  }
}

function parseSimpleYaml(yaml: string): Frontmatter {
  const result: Frontmatter = {}
  let currentListKey: string | null = null
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\t/g, '  ')
    const listItem = line.match(/^\s*-\s+(.*)$/)
    if (listItem && currentListKey) {
      const existing = result[currentListKey]
      const list = Array.isArray(existing) ? existing : []
      list.push(unquote(listItem[1] ?? ''))
      result[currentListKey] = list
      continue
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1] ?? ''
    const value = kv[2] ?? ''
    if (value === '' || value === '[]') {
      currentListKey = value === '[]' ? null : key
      result[key] = value === '[]' ? [] : []
      if (value === '') currentListKey = key
      continue
    }
    currentListKey = null
    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value
        .slice(1, -1)
        .split(',')
        .map((part) => unquote(part.trim()))
        .filter(Boolean)
      continue
    }
    result[key] = unquote(value)
  }
  return result
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function extractWikilinks(text: string): string[] {
  const links = new Set<string>()
  const pattern = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const slug = (match[1] ?? '').trim()
    if (slug) links.add(slug)
  }
  return [...links]
}

export function todayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'untitled'
}

export function isArchived(frontmatter: Frontmatter): boolean {
  const value = frontmatter.archived
  return value === true || value === 'true' || value === 'yes'
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${value.map((item) => String(item)).join(', ')}]`
  }
  if (value === true) return 'true'
  if (value === false) return 'false'
  return String(value)
}

export function serializeDocument(frontmatter: Frontmatter, body: string): string {
  const preferred = ['title', 'created', 'updated', 'type', 'tags', 'sources', 'archived']
  const lines = ['---']
  const seen = new Set<string>()
  for (const key of preferred) {
    if (!(key in frontmatter) || frontmatter[key] === undefined) continue
    lines.push(`${key}: ${formatYamlValue(frontmatter[key])}`)
    seen.add(key)
  }
  for (const [key, value] of Object.entries(frontmatter)) {
    if (seen.has(key) || value === undefined) continue
    lines.push(`${key}: ${formatYamlValue(value)}`)
  }
  lines.push('---', '')
  return `${lines.join('\n')}${body.replace(/^\n+/, '')}`
}
