export const DEFAULT_WRITER_DOMAIN = '文章、脚本、文案与工作文档'

export function tasksEmptyCopy(rawCount?: number): string {
  if (rawCount === 0) {
    return '先有旧稿再审视更有用。点审视会扫一遍重复、过期和缺口。'
  }
  return '还没有该修的问题。点审视会扫一遍重复、过期和缺口。'
}
