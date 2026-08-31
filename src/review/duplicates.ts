export const DEFAULT_DUPLICATE_THRESHOLD = 0.5
export const REVIEW_SIMILARITY_THRESHOLD = 0.25
export const LEXICAL_BLIND_SPOT =
  '词法方法抓不到「同一论点换词重写」。三月写「A vs B」、九月写「B vs A」时相似度可能接近 0，须人工复核。'

export interface DuplicatePair {
  a: string
  b: string
  similarity: number
  overlappingPhrases: string[]
}

export function normalizeText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, '$1')
    .replace(/[#>*_`~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function charNgrams(text: string, n = 2): Set<string> {
  const compact = normalizeText(text).replace(/\s+/g, '')
  const grams = new Set<string>()
  if (compact.length < n) {
    if (compact) grams.add(compact)
    return grams
  }
  for (let i = 0; i <= compact.length - n; i += 1) {
    grams.add(compact.slice(i, i + n))
  }
  return grams
}

export function wordNgrams(text: string, n = 2): Set<string> {
  const tokens: string[] = []
  const parts = normalizeText(text).match(/[a-z0-9]+|[\p{Script=Han}]+/gu) ?? []
  for (const part of parts) {
    if (/^[\p{Script=Han}]+$/u.test(part)) {
      for (const ch of part) tokens.push(ch)
    } else if (part.length > 1) {
      tokens.push(part)
    }
  }
  const grams = new Set<string>()
  if (tokens.length === 0) return grams
  if (tokens.length < n) {
    grams.add(tokens.join(''))
    return grams
  }
  for (let i = 0; i <= tokens.length - n; i += 1) {
    grams.add(tokens.slice(i, i + n).join(''))
  }
  return grams
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const item of a) {
    if (b.has(item)) inter += 1
  }
  return inter / (a.size + b.size - inter)
}

export function combinedSimilarity(a: string, b: string): number {
  const charSim = jaccard(charNgrams(a, 2), charNgrams(b, 2))
  const wordSim = jaccard(wordNgrams(a, 2), wordNgrams(b, 2))
  return Math.max(charSim, wordSim)
}

/** How much of the query's n-grams appear in the page. Better for short queries than Jaccard. */
export function queryCoverage(query: string, page: string): number {
  const q = charNgrams(query, 2)
  if (q.size === 0) return 0
  const p = charNgrams(page, 2)
  let hit = 0
  for (const gram of q) {
    if (p.has(gram)) hit += 1
  }
  return hit / q.size
}

export function overlappingPhrases(a: string, b: string, limit = 6): string[] {
  const na = normalizeText(a).replace(/\s+/g, '')
  const nb = normalizeText(b).replace(/\s+/g, '')
  const n = 4
  if (na.length < n || nb.length < n) return []
  const inB = new Set<string>()
  for (let i = 0; i <= nb.length - n; i += 1) inB.add(nb.slice(i, i + n))
  const found: string[] = []
  let i = 0
  while (i <= na.length - n) {
    if (!inB.has(na.slice(i, i + n))) {
      i += 1
      continue
    }
    let j = i + n
    while (j <= na.length && inB.has(na.slice(j - n, j))) j += 1
    found.push(na.slice(i, j))
    i = j
  }
  return [...new Set(found)].sort((left, right) => right.length - left.length).slice(0, limit)
}

export interface DuplicateDoc {
  id: string
  title: string
  body: string
}

export function findDuplicatePairs(
  docs: DuplicateDoc[],
  threshold = DEFAULT_DUPLICATE_THRESHOLD,
): DuplicatePair[] {
  const prepared = docs.map((doc) => {
    const blob = `${doc.title}\n${doc.body.slice(0, 4000)}`
    return {
      id: doc.id,
      blob,
      char: charNgrams(blob, 2),
      word: wordNgrams(blob, 2),
    }
  })
  const pairs: DuplicatePair[] = []
  for (let i = 0; i < prepared.length; i += 1) {
    const left = prepared[i]
    if (!left) continue
    for (let j = i + 1; j < prepared.length; j += 1) {
      const right = prepared[j]
      if (!right) continue
      const similarity = Math.max(jaccard(left.char, right.char), jaccard(left.word, right.word))
      if (similarity < threshold) continue
      pairs.push({
        a: left.id,
        b: right.id,
        similarity,
        overlappingPhrases: overlappingPhrases(left.blob, right.blob),
      })
    }
  }
  pairs.sort((x, y) => y.similarity - x.similarity)
  return pairs
}
