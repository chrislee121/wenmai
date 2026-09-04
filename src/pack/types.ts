export type PageDir = string
export type PageType = string
export type RawKind = string

export interface PackConfig {
  id: string
  pageDirs: readonly PageDir[]
  rawKinds: readonly RawKind[]
  pageTypes: readonly PageType[]
  typeToDir: Record<string, PageDir | null>
  indexHeadings: Record<string, string>
  tagTaxonomy: readonly string[]
}

export const PACK_FILE = '.wenmai/pack.json'
