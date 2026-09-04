export interface Config {
  root: string
  sourceRoots: string[]
  orientBudgetChars: number
  ingestAdapters: boolean
}

const DEFAULTS: Config = {
  root: '~/wenmai',
  sourceRoots: [],
  orientBudgetChars: 8000,
  ingestAdapters: false,
}

interface StandardIssue {
  message: string
}

interface StandardSuccess {
  value: Config
}

interface StandardFailure {
  issues: StandardIssue[]
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return DEFAULTS.sourceRoots
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return undefined
  return value
}

function parse(value: unknown): StandardSuccess | StandardFailure {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const issues: StandardIssue[] = []
  const root = input.root === undefined ? DEFAULTS.root : input.root
  const orientBudgetChars =
    input.orientBudgetChars === undefined ? DEFAULTS.orientBudgetChars : input.orientBudgetChars
  const sourceRoots = asStringArray(input.sourceRoots)
  const ingestAdapters =
    input.ingestAdapters === undefined ? DEFAULTS.ingestAdapters : input.ingestAdapters

  if (typeof root !== 'string' || root.trim() === '') {
    issues.push({ message: 'root must be a non-empty string' })
  }
  if (typeof orientBudgetChars !== 'number' || !Number.isFinite(orientBudgetChars)) {
    issues.push({ message: 'orientBudgetChars must be a number' })
  } else if (orientBudgetChars < 1024 || orientBudgetChars > 32000) {
    issues.push({ message: 'orientBudgetChars must be between 1024 and 32000' })
  }
  if (sourceRoots === undefined) {
    issues.push({ message: 'sourceRoots must be an array of strings' })
  }
  if (typeof ingestAdapters !== 'boolean') {
    issues.push({ message: 'ingestAdapters must be a boolean' })
  }
  if (issues.length > 0) return { issues }
  return {
    value: {
      root: root as string,
      sourceRoots: sourceRoots ?? [],
      orientBudgetChars: orientBudgetChars as number,
      ingestAdapters: ingestAdapters as boolean,
    },
  }
}

/** Cordis reads Standard Schema V1 on the exported `Config` value. */
export const Config = {
  '~standard': {
    version: 1 as const,
    vendor: 'wenmai',
    validate(value: unknown) {
      return parse(value)
    },
  },
}
