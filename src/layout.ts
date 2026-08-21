export const PAGE_DIRS = ['entities', 'concepts', 'comparisons', 'queries'] as const
export const RAW_KINDS = ['articles', 'scripts', 'docs', 'papers', 'workspace', 'transcripts', 'assets'] as const
export const RAW_DIRS = RAW_KINDS.map((kind) => `raw/${kind}`) as readonly `raw/${(typeof RAW_KINDS)[number]}`[]
export const PAGE_TYPES = ['entity', 'concept', 'comparison', 'query', 'summary'] as const

export type PageDir = (typeof PAGE_DIRS)[number]
export type PageType = (typeof PAGE_TYPES)[number]
export type RawKind = (typeof RAW_KINDS)[number]

export const TYPE_TO_DIR: Record<PageType, PageDir | null> = {
  entity: 'entities',
  concept: 'concepts',
  comparison: 'comparisons',
  query: 'queries',
  summary: null,
}

export function schemaTemplate(domain: string): string {
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
type: entity | concept | comparison | query | summary
tags: []
sources: [raw/workspace/example.md]
---
\`\`\`

## Tag Taxonomy
Add a tag here BEFORE using it on a page.
- topic
- product
- person
- workflow
- script
- copy
- document
- comparison
- opinion

## Page Thresholds
- Create a page when an entity/concept appears in 2+ sources OR is central to one source
- Add to an existing page when a source mentions something already covered
- Do not create a page for passing mentions
- Split a page around 200 lines
`
}

export function indexTemplate(domain: string, today: string): string {
  return `# 文脉目录

- Domain: ${domain}
- Total pages: 0
- Last updated: ${today}

## Entities

## Concepts

## Comparisons

## Queries
`
}

export function logTemplate(today: string, domain: string): string {
  return `# 文脉日志

## [${today}] init | 文脉 created
- domain: ${domain}
- directories: SCHEMA.md, index.md, log.md, raw/{articles,scripts,docs,papers,workspace,transcripts,assets}/, entities/, concepts/, comparisons/, queries/
`
}
