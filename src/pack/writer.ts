import type { PackConfig } from './types.js'

export const WRITER_PACK: PackConfig = {
  id: 'writer',
  pageDirs: ['entities', 'concepts', 'comparisons', 'queries'],
  rawKinds: ['articles', 'scripts', 'docs', 'papers', 'workspace', 'transcripts', 'assets'],
  pageTypes: ['entity', 'concept', 'comparison', 'query', 'summary'],
  typeToDir: {
    entity: 'entities',
    concept: 'concepts',
    comparison: 'comparisons',
    query: 'queries',
    summary: null,
  },
  indexHeadings: {
    entities: 'Entities',
    concepts: 'Concepts',
    comparisons: 'Comparisons',
    queries: 'Queries',
  },
  tagTaxonomy: ['topic', 'product', 'person', 'workflow', 'script', 'copy', 'document', 'comparison', 'opinion'],
}

export const BUILTIN_PACKS: Record<string, PackConfig> = {
  writer: WRITER_PACK,
}
