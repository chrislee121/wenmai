import type { ParamSpec } from '../tool-def.js'

export type OpName =
  | 'status'
  | 'init'
  | 'ingest'
  | 'written'
  | 'search'
  | 'read'
  | 'write'
  | 'lint'
  | 'review'
  | 'tasks'
  | 'research'
  | 'refactor'
  | 'config'
  | 'graph'

export type ToolDef = {
  op: OpName
  name: `wenmai_${OpName}`
  description: string
  parameters: Record<string, ParamSpec>
}

export const WENMAI_TOOLS: readonly ToolDef[] = [
  {
    op: 'status',
    name: 'wenmai_status',
    description: '文脉是否已初始化、页数、原文数。用户说「文脉状态 / 库在不在 / 有多少页」时调用，不必等他们说出本工具名。',
    parameters: {},
  },
  {
    op: 'init',
    name: 'wenmai_init',
    description: '按领域创建文脉目录与 SCHEMA / index / log。用户说「初始化 / 建库 / 第一次用文脉」时调用。',
    parameters: {
      domain: { type: 'string', required: true, description: 'What this 文脉 covers, e.g. articles, video scripts, copy, and work docs' },
      pack: { type: 'string', description: 'Built-in pack id, default writer' },
    },
  },
  {
    op: 'ingest',
    name: 'wenmai_ingest',
    description:
      '把成稿复制进 raw/（之后不可改）。用户说「收录 / 存进文脉 / 吃掉这篇 / 扫这个目录」时调用。单篇给 filePath 或 content；目录给 dir，默认 dry-run，确认后再写入。不要整批自动编译。',
    parameters: {
      filePath: { type: 'string', description: 'Absolute or relative path to a local markdown/text file' },
      content: { type: 'string', description: 'Pasted source text when not ingesting a file' },
      dir: {
        type: 'string',
        description: 'Directory to ingest (workspace or sourceRoots only). Defaults to dry-run; set dryRun false after the user confirms the file list.',
      },
      dryRun: {
        type: 'boolean',
        description: 'Directory ingest only. Default true: list files, write nothing. false: copy into raw/.',
      },
      title: { type: 'string', description: 'Source title; defaults to filename or first heading' },
      kind: {
        type: 'string',
        description: 'raw/ subdirectory: articles | scripts | docs | papers | workspace | transcripts | assets',
      },
    },
  },
  {
    op: 'written',
    name: 'wenmai_written',
    description:
      '选题防撞：这篇是不是已经写过。用户说「写过没有 / 会不会撞稿 / 这个选题做过吗」时必须调用，禁止凭记忆回答。返回 NEW / REVIEW / DUPLICATE。词法查重，换词重写可能漏。',
    parameters: {
      query: { type: 'string', required: true, description: 'Topic, product, or title fragment' },
      limit: { type: 'number', description: 'Max hits, default 20' },
    },
  },
  {
    op: 'search',
    name: 'wenmai_search',
    description: '在文脉编译页和 raw/ 里做词法搜索。用户说「文脉里搜 / 查一下某某概念」时调用。',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query' },
      limit: { type: 'number', description: 'Max hits, default 20' },
    },
  },
  {
    op: 'read',
    name: 'wenmai_read',
    description: '按相对路径读文脉里的文件。搜到路径后，用户要看正文时调用。',
    parameters: {
      path: { type: 'string', required: true, description: 'Relative path under 文脉 root' },
      offset: { type: 'number', description: 'Start line (0-based)' },
      limit: { type: 'number', description: 'Max lines to return' },
    },
  },
  {
    op: 'write',
    name: 'wenmai_write',
    description: '写或更新编译页（概念/实体）。用户说「写成概念页 / 更新这一页 / 记进目录」时调用。禁止写入 raw/。',
    parameters: {
      path: { type: 'string', required: true, description: 'Relative path such as concepts/foo.md' },
      content: { type: 'string', required: true, description: 'Full markdown including YAML frontmatter' },
      log: { type: 'string', description: 'Optional log.md entry, e.g. "write | foo"' },
      updateIndex: { type: 'boolean', description: 'If true, add [[slug]] to index.md' },
      finding: { type: 'string', description: 'Optional review finding id to ack after a successful write' },
    },
  },
  {
    op: 'lint',
    name: 'wenmai_lint',
    description: '只读体检：断链、缺 frontmatter、raw 哈希漂移。用户说「体检 / 断链 / 页面乱不乱」时调用。不自动修复。',
    parameters: {},
  },
  {
    op: 'review',
    name: 'wenmai_review',
    description:
      '只读审视：原文变更是否传到编译页、重复、冲突候选、结构问题。用户说「有没有重复 / 过期 / 冲突 / 知识库健康吗」时调用。不改页面。',
    parameters: {
      includeDismissed: { type: 'boolean', description: 'Include ack/snooze/wontfix findings, default false' },
      ttlDays: { type: 'number', description: 'updated TTL in days, default 180' },
      duplicateThreshold: { type: 'number', description: 'Jaccard threshold for duplicates, default 0.5' },
      ack: { type: 'string', description: 'Comma-separated finding ids to acknowledge' },
      snooze: { type: 'string', description: 'Comma-separated finding ids to snooze' },
      snoozeDays: { type: 'number', description: 'Snooze duration in days, default 30' },
      wontfix: { type: 'string', description: 'Comma-separated finding ids to ignore' },
    },
  },
  {
    op: 'tasks',
    name: 'wenmai_tasks',
    description:
      '把审视 finding 投影成知识任务队列。用户说「今天该修什么 / 知识任务 / 待办」时调用。不另建任务编号；修某一条仍走 wenmai_refactor。',
    parameters: {
      op: { type: 'string', description: 'list (default) | start | done | snooze | wontfix' },
      id: { type: 'string', description: 'Finding fingerprint; required for start / done / snooze / wontfix' },
      priority: { type: 'string', description: 'Filter list, or pin high|medium|low on start' },
      snoozeDays: { type: 'number', description: 'Snooze duration in days, default 30' },
      includeDismissed: { type: 'boolean', description: 'Include done / snoozed / wontfix, default false' },
    },
  },
  {
    op: 'research',
    name: 'wenmai_research',
    description:
      '针对目录点了但没写的结构性缺口，在本机 raw/ 与 sourceRoots 里查有没有旧稿可编译。用户说「目录点了但没写 / 查库里有没有旧稿可编译」时调用。默认关闭；关掉就说明如何打开 research: true，禁止改去抓网页。不生成正文、不写盘。',
    parameters: {
      id: { type: 'string', description: 'Finding fingerprint; omit to list all open structural gaps' },
    },
  },
  {
    op: 'refactor',
    name: 'wenmai_refactor',
    description:
      '重构编译页：合并、拆分、改名、搬家、补链接、重写、归档。用户说「合并这两页 / 改名 / 归档 / 拆开」时调用。默认 dry-run，确认后再写入。禁止改 raw/。不生成正文。',
    parameters: {
      op: {
        type: 'string',
        description: 'rename | move | link | archive | merge | split | rewrite',
      },
      dryRun: { type: 'boolean', description: 'Default true: preview only. false: write compiled pages after the user confirms.' },
      source: { type: 'string', description: 'Source compiled page path or slug' },
      target: { type: 'string', description: 'Target path, slug, or folder (entities/concepts/...) depending on op' },
      title: { type: 'string', description: 'New title for rename/split' },
      content: { type: 'string', description: 'Agent-provided markdown for rewrite, merge result, or split remaining page' },
      contentB: { type: 'string', description: 'Split only: markdown for the new page' },
      finding: { type: 'string', description: 'Optional review finding id to ack after a successful apply' },
      undo: { type: 'boolean', description: 'Restore the last refactor apply. Do not combine with op.' },
    },
  },
  {
    op: 'config',
    name: 'wenmai_config',
    description:
      '查看或增减额外原文目录。用户说「再扫这个文件夹 / 加上我的脚本目录」且已确认路径时调用。默认已含当前工作区；禁止扫家目录。',
    parameters: {
      add: { type: 'string', description: 'Add one extra source directory (absolute or ~/path)' },
      remove: { type: 'string', description: 'Remove one extra source directory previously added by this tool' },
      set: { type: 'string', description: 'Replace extra source directories; comma-separated paths. Empty string clears extras.' },
    },
  },
  {
    op: 'graph',
    name: 'wenmai_graph',
    description: '生成知识关联图 graph.html。用户说「关联图 / 知识图谱 / 打开关系图」时调用。不要每轮都跑。',
    parameters: {
      focus: { type: 'string', description: 'Optional page slug or title for a local graph' },
      depth: { type: 'number', description: 'Local graph hop depth, default 2' },
      includeTags: { type: 'boolean', description: 'Include tag nodes, default true' },
      includeSources: { type: 'boolean', description: 'Include raw source nodes, default true' },
      includeMissing: { type: 'boolean', description: 'Include unresolved [[wikilinks]], default true' },
      includeArticles: { type: 'boolean', description: 'Include markdown files from the session workspace and extra sourceRoots, default true' },
      open: { type: 'boolean', description: 'Open graph.html in the default browser (macOS open)' },
    },
  },
]

export function toolByName(name: string): ToolDef | undefined {
  return WENMAI_TOOLS.find((item) => item.name === name)
}

export function toolByOp(op: string): ToolDef | undefined {
  return WENMAI_TOOLS.find((item) => item.op === op)
}
