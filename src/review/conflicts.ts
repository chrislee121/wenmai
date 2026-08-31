import { finding, type Finding } from './findings.js'
import { combinedSimilarity } from './duplicates.js'
import type { LinkedPage } from '../backlinks.js'

const NEGATIONS = [
  '并非',
  '不是',
  '没有',
  '未能',
  '不会',
  '不能',
  '不要',
  '禁止',
  '反对',
  '未',
  '非',
  '无',
  '不',
  '没',
]

const ANTONYM_PAIRS: Array<[string, string]> = [
  ['支持', '反对'],
  ['赞成', '反对'],
  ['必须', '禁止'],
  ['优点', '缺点'],
  ['好处', '坏处'],
  ['利', '弊'],
  ['开放', '封闭'],
  ['公开', '私密'],
  ['中心化', '去中心化'],
  ['增长', '下降'],
  ['上升', '下跌'],
  ['正确', '错误'],
  ['有效', '无效'],
  ['简单', '复杂'],
  ['集中', '分散'],
  ['免费', '收费'],
  ['本地', '云端'],
  ['成功', '失败'],
  ['安全', '危险'],
  ['推荐', '避免'],
]

const TOPIC_THRESHOLD = 0.32

function haystack(page: LinkedPage): string {
  return `${page.title} ${page.tags.join(' ')} ${page.body.slice(0, 2500)}`
}

function hasNegation(text: string): boolean {
  return NEGATIONS.some((word) => text.includes(word))
}

export function detectConflictCandidates(pages: LinkedPage[]): Finding[] {
  const findings: Finding[] = []
  for (let i = 0; i < pages.length; i += 1) {
    const left = pages[i]
    if (!left) continue
    const leftText = haystack(left)
    for (let j = i + 1; j < pages.length; j += 1) {
      const right = pages[j]
      if (!right) continue
      const rightText = haystack(right)
      const topic = combinedSimilarity(`${left.title} ${left.tags.join(' ')}`, `${right.title} ${right.tags.join(' ')}`)
      const bodyOverlap = combinedSimilarity(left.body.slice(0, 1500), right.body.slice(0, 1500))
      if (topic < TOPIC_THRESHOLD && bodyOverlap < TOPIC_THRESHOLD) continue

      const antonyms: string[] = []
      for (const [a, b] of ANTONYM_PAIRS) {
        const split = (leftText.includes(a) && rightText.includes(b)) || (leftText.includes(b) && rightText.includes(a))
        if (split) antonyms.push(`${a}/${b}`)
      }
      const negationAsymmetry = hasNegation(leftText) !== hasNegation(rightText)
      if (antonyms.length === 0 && !negationAsymmetry) continue

      const why =
        antonyms.length > 0
          ? `主题相近，且出现对立词：${antonyms.join('、')}`
          : '主题相近，且一方含否定词、另一方不含'

      findings.push(
        finding({
          kind: 'conflict-candidate',
          severity: 'warning',
          paths: [left.rel, right.rel],
          key: antonyms.join(',') || 'negation',
          reason: `${why}。这是启发式候选，需人工复核，不是已确认矛盾`,
          action: '对照两页论断，确认后在编译页写清取舍或互链',
        }),
      )
    }
  }
  return findings
}
