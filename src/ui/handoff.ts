export function readPageDraft(hit: { kind: string; title: string; path: string }): string {
  const path = hit.path.trim()
  if (hit.kind === 'source') {
    return `这篇还没收进编译页的旧稿在 ${path}，先读重叠处再决定收不收`
  }
  const title = hit.title.trim() || path
  return `读文脉里「${title}」这一页，路径 ${path}`
}
