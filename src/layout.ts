import type { PackConfig } from './pack/types.js'
import { WRITER_PACK, rawDirsOf } from './pack/index.js'

export type { PageDir, PageType, RawKind, PackConfig } from './pack/types.js'
export {
  WRITER_PACK,
  builtinPack,
  loadVaultPack,
  writeVaultPack,
  rawDirsOf,
  indexHeading,
  inferTypeFromPath,
  typeFromDir,
  isPageDir,
  PACK_FILE,
} from './pack/index.js'

export const PAGE_DIRS = WRITER_PACK.pageDirs
export const RAW_KINDS = WRITER_PACK.rawKinds
export const RAW_DIRS = rawDirsOf(WRITER_PACK)
export const PAGE_TYPES = WRITER_PACK.pageTypes
export const TYPE_TO_DIR = WRITER_PACK.typeToDir

export function schemaTemplate(domain: string, pack: PackConfig = WRITER_PACK): string {
  const types = pack.pageTypes.join(' | ')
  const tags = pack.tagTaxonomy.map((tag) => `- ${tag}`).join('\n')
  const sampleSource = `raw/${pack.rawKinds.includes('workspace') ? 'workspace' : pack.rawKinds[0]}/example.md`
  return `# 文脉 Schema

## Domain
${domain}

## Conventions
- File names: lowercase, hyphens, no spaces (CJK allowed). Example: \`topic-name.md\`
- Every compiled page starts with YAML frontmatter
- Use \`[[wikilinks]]\` between pages (minimum 2 outbound links per page)
- When updating a page, bump the \`updated\` date
- Every new page must be added to \`index.md\` under the correct section
- Every action must be appended to \`log.md\`
- Never modify files under \`raw/\` after ingest. Corrections go on compiled pages

## Frontmatter
\`\`\`yaml
---
title: Page Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: ${types}
tags: []
sources: [${sampleSource}]
---
\`\`\`

## Tag Taxonomy
Add a tag here BEFORE using it on a page.
${tags}

## Page Thresholds
- Create a page when an entity/concept appears in 2+ sources OR is central to one source
- Add to an existing page when a source mentions something already covered
- Do not create a page for passing mentions
- Split a page around 200 lines
`
}

export function indexTemplate(domain: string, today: string, pack: PackConfig = WRITER_PACK): string {
  const sections = pack.pageDirs
    .map((dir) => `## ${pack.indexHeadings[dir] ?? dir}\n`)
    .join('\n')
  return `# 文脉目录

- Domain: ${domain}
- Total pages: 0
- Last updated: ${today}

${sections}`
}

export function logTemplate(today: string, domain: string, pack: PackConfig = WRITER_PACK): string {
  const dirs = ['SCHEMA.md', 'index.md', 'log.md', ...rawDirsOf(pack).map((dir) => `${dir}/`), ...pack.pageDirs.map((dir) => `${dir}/`)].join(', ')
  return `# 文脉日志

## [${today}] init | 文脉 created
- domain: ${domain}
- pack: ${pack.id}
- directories: ${dirs}
`
}
