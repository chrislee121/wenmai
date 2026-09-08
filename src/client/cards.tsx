import * as React from 'react'
import { readPageDraft } from '../ui/handoff.js'
import { DEFAULT_WRITER_DOMAIN } from '../ui/defaults.js'
import {
  ingestCardModel,
  isToolRunning,
  parseToolPayload,
  statusCardModel,
  tasksCardModel,
  writtenCardModel,
  type IngestCardModel,
  type StatusCardModel,
  type TaskCardItem,
  type TasksCardModel,
  type WrittenCardModel,
  type WrittenHitView,
} from '../ui/models.js'
import { wenmaiApi } from './api.js'
import { fillOrCopyDraft } from './composer.js'
import { Actions, Button, Card } from './chrome.js'

export interface ToolViewProps {
  toolName?: string
  block?: unknown
  cwd?: string
}

function toneOf(verdict: WrittenCardModel['verdict']): 'new' | 'review' | 'duplicate' {
  if (verdict === 'DUPLICATE') return 'duplicate'
  if (verdict === 'REVIEW') return 'review'
  return 'new'
}

function HitRow(props: { hit: WrittenHitView }): React.ReactElement {
  const { hit } = props
  const [hint, setHint] = React.useState<string | null>(null)
  const handoff = async (): Promise<void> => {
    const draft = readPageDraft(hit)
    const result = await fillOrCopyDraft(draft)
    if (result === 'filled') setHint('已填进右侧输入框，你自己发')
    else if (result === 'copied') setHint('复制这句话自己贴')
    else setHint('复制这句话自己贴')
  }
  return React.createElement(
    'li',
    { className: 'wenmai-item' },
    React.createElement('div', { className: 'wenmai-item-title' }, hit.title),
    React.createElement('div', { className: 'wenmai-item-path' }, hit.path),
    hit.overlappingPhrases.length > 0
      ? React.createElement(
          'div',
          { className: 'wenmai-phrases' },
          hit.overlappingPhrases.map((phrase) =>
            React.createElement('span', { key: phrase, className: 'wenmai-phrase' }, phrase),
          ),
        )
      : null,
    hit.snippet ? React.createElement('div', { className: 'wenmai-item-snip' }, hit.snippet) : null,
    React.createElement(
      Actions,
      null,
      React.createElement(Button, { onClick: () => void handoff() }, '让对话读这一页'),
    ),
    hint ? React.createElement('div', { className: 'wenmai-meta' }, hint) : null,
  )
}

export function WrittenBody(props: { model: WrittenCardModel }): React.ReactElement {
  const { model } = props
  return React.createElement(
    Card,
    { tone: toneOf(model.verdict), kicker: model.query ? `文脉 · ${model.query}` : '文脉' },
    React.createElement('div', { className: 'wenmai-verdict' }, model.headline),
    model.reason ? React.createElement('div', { className: 'wenmai-reason' }, model.reason) : null,
    model.hits.length > 0
      ? React.createElement('ul', { className: 'wenmai-list' }, model.hits.map((hit) => React.createElement(HitRow, { key: hit.path, hit })))
      : null,
    model.openTasks.length > 0
      ? React.createElement(
          'div',
          { className: 'wenmai-meta' },
          '相关未完成任务：',
          model.openTasks.map((task) => task.why).join('；'),
        )
      : null,
  )
}

export function WrittenCard(props: ToolViewProps): React.ReactElement {
  const running = isToolRunning(props.block)
  const model = writtenCardModel(parseToolPayload(props.block), running)
  return React.createElement(WrittenBody, { model })
}

function IngestBody(props: {
  model: IngestCardModel
  cwd?: string
  onDone?: (model: IngestCardModel) => void
  embedded?: boolean
}): React.ReactElement {
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<IngestCardModel | null>(null)
  React.useEffect(() => {
    setDone(null)
  }, [props.model])
  const model = done ?? props.model
  const confirm = async (): Promise<void> => {
    if (!model.canConfirm || busy) return
    setBusy(true)
    try {
      const result = await wenmaiApi({
        op: 'ingest-confirm',
        dir: model.dir,
        kind: model.kind,
        workspace: props.cwd,
      })
      const next = ingestCardModel(result, false)
      setDone(next)
      props.onDone?.(next)
    } finally {
      setBusy(false)
    }
  }
  const headline = model.error
    ? '收录失败'
    : model.dryRun
      ? `将收录 ${model.planned} 篇`
      : `已写入 ${model.ingested} 篇`
  const body = [
    React.createElement('div', { key: 'headline', className: 'wenmai-verdict' }, headline),
    React.createElement(
      'div',
      { key: 'meta', className: 'wenmai-meta' },
      model.dir || model.error || '没有可收录的稿',
    ),
    model.files.length > 0
      ? React.createElement(
          'ul',
          { key: 'files', className: 'wenmai-list' },
          model.files.map((file) =>
            React.createElement(
              'li',
              { key: file.sourcePath || file.rel, className: 'wenmai-item' },
              React.createElement('div', { className: 'wenmai-item-title' }, file.title),
              React.createElement('div', { className: 'wenmai-item-path' }, file.rel || file.sourcePath),
            ),
          ),
        )
      : null,
    model.canConfirm
      ? React.createElement(
          Actions,
          { key: 'confirm' },
          React.createElement(
            Button,
            { primary: true, disabled: busy, onClick: () => void confirm() },
            busy ? '正在写入…' : '确认收录',
          ),
        )
      : null,
    !model.dryRun && model.ingested > 0
      ? React.createElement('div', { key: 'hint', className: 'wenmai-meta' }, '只写进了 raw/，编译页请另外交代。')
      : null,
  ]
  if (props.embedded) {
    return React.createElement('div', { className: 'wenmai-ingest-result' }, body)
  }
  return React.createElement(Card, { kicker: '文脉 · 收录' }, body)
}

export function IngestCard(props: ToolViewProps): React.ReactElement {
  const running = isToolRunning(props.block)
  const model = ingestCardModel(parseToolPayload(props.block), running)
  return React.createElement(IngestBody, { model, cwd: props.cwd })
}

export function IngestPanel(props: { cwd?: string; onChanged?: () => void }): React.ReactElement {
  const [dir, setDir] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [model, setModel] = React.useState<IngestCardModel | null>(null)
  const preview = async (target: string): Promise<void> => {
    const trimmed = target.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const result = await wenmaiApi({
        op: 'ingest-preview',
        dir: trimmed,
        workspace: props.cwd,
      })
      setModel(ingestCardModel(result, false))
    } finally {
      setBusy(false)
    }
  }
  return React.createElement(
    Card,
    { kicker: '文脉 · 收录' },
    React.createElement('div', { className: 'wenmai-verdict' }, '把写完的稿收进来'),
    React.createElement(
      'div',
      { className: 'wenmai-reason' },
      '只预览 Markdown，确认后写入 raw/。不改编译页，也不扫家目录。',
    ),
    React.createElement(
      Actions,
      null,
      React.createElement(
        Button,
        {
          primary: true,
          disabled: busy || !props.cwd,
          onClick: () => void preview(props.cwd ?? ''),
        },
        busy ? '正在预览…' : '收当前工作区',
      ),
    ),
    !props.cwd
      ? React.createElement('div', { className: 'wenmai-meta' }, '当前没有工作区路径，请在下面贴一个本机目录。')
      : null,
    React.createElement(
      'form',
      {
        className: 'wenmai-search',
        onSubmit: (event: React.FormEvent) => {
          event.preventDefault()
          event.stopPropagation()
          void preview(dir)
        },
      },
      React.createElement('input', {
        className: 'wenmai-field',
        value: dir,
        placeholder: '或贴一个本机目录路径',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDir(event.target.value),
      }),
      React.createElement(
        Button,
        { type: 'submit', disabled: busy || !dir.trim() },
        busy ? '正在预览…' : '预览',
      ),
    ),
    model
      ? React.createElement(IngestBody, {
          model,
          cwd: props.cwd,
          embedded: true,
          onDone: (next) => {
            setModel(next)
            if (!next.dryRun && !next.error) props.onChanged?.()
          },
        })
      : null,
  )
}

function statusCounts(model: StatusCardModel): string {
  if (model.error) return model.error
  if (model.running) return '正在读取…'
  const counts = `编译页 ${model.pageCount} · 原文 ${model.rawCount}`
  return model.root ? `${counts} · ${model.root}` : counts
}

export function StatusBody(props: { model: StatusCardModel; compact?: boolean }): React.ReactElement {
  const { model } = props
  if (props.compact) {
    return React.createElement('div', { className: 'wenmai-status-foot' }, statusCounts(model))
  }
  return React.createElement(
    Card,
    { kicker: '文脉 · 状态' },
    React.createElement(
      'div',
      { className: 'wenmai-verdict' },
      model.error ? '读不到库' : model.running ? '正在读取…' : model.initialized ? '库已就绪' : '库还没建',
    ),
    React.createElement('div', { className: 'wenmai-meta' }, statusCounts(model)),
    model.sourceRoots.length > 0
      ? React.createElement(
          'ul',
          { className: 'wenmai-list' },
          model.sourceRoots.map((root) =>
            React.createElement(
              'li',
              { key: `${root.origin}:${root.path}`, className: 'wenmai-item' },
              React.createElement(
                'div',
                { className: 'wenmai-item-title' },
                `${root.readable ? '可读' : '缺失'} · ${root.origin}`,
              ),
              React.createElement('div', { className: 'wenmai-item-path' }, root.path),
            ),
          ),
        )
      : null,
  )
}

export function InitPanel(props: {
  cwd?: string
  onReady: (status: StatusCardModel) => void
}): React.ReactElement {
  const [domain, setDomain] = React.useState(DEFAULT_WRITER_DOMAIN)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const create = async (): Promise<void> => {
    const trimmed = domain.trim() || DEFAULT_WRITER_DOMAIN
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await wenmaiApi({
        op: 'init',
        domain: trimmed,
        workspace: props.cwd,
      })
      const next = statusCardModel(result, false)
      if (next.error) {
        setError(next.error)
        return
      }
      props.onReady(next)
    } finally {
      setBusy(false)
    }
  }
  return React.createElement(
    Card,
    { kicker: '文脉 · 开始' },
    React.createElement('div', { className: 'wenmai-verdict' }, '先建这个库'),
    React.createElement(
      'div',
      { className: 'wenmai-reason' },
      '建库之后才能查撞稿、收旧稿、审视。默认用写作包，不改你现在的稿。',
    ),
    React.createElement('input', {
      className: 'wenmai-field',
      value: domain,
      'aria-label': '这个库覆盖的领域',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDomain(event.target.value),
    }),
    error ? React.createElement('div', { className: 'wenmai-reason' }, error) : null,
    React.createElement(
      Actions,
      null,
      React.createElement(
        Button,
        { primary: true, disabled: busy, onClick: () => void create() },
        busy ? '正在建…' : '建这个库',
      ),
    ),
  )
}

export function StatusCard(props: ToolViewProps): React.ReactElement {
  const running = isToolRunning(props.block)
  const model = statusCardModel(parseToolPayload(props.block), running)
  return React.createElement(StatusBody, { model })
}

function TasksBody(props: { model: TasksCardModel; cwd?: string }): React.ReactElement {
  const [model, setModel] = React.useState(props.model)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  React.useEffect(() => {
    setModel(props.model)
  }, [props.model])
  const act = async (taskOp: 'start' | 'snooze' | 'wontfix', id: string): Promise<void> => {
    setBusyId(id)
    try {
      const result = await wenmaiApi({
        op: 'tasks',
        taskOp,
        id,
        snoozeDays: taskOp === 'snooze' ? 30 : undefined,
        workspace: props.cwd,
      })
      setModel(tasksCardModel(result, false))
    } finally {
      setBusyId(null)
    }
  }
  const row = (task: TaskCardItem): React.ReactElement =>
    React.createElement(
      'li',
      { key: task.id, className: 'wenmai-item' },
      React.createElement('div', { className: 'wenmai-item-title' }, task.why),
      React.createElement(
        'div',
        { className: 'wenmai-item-path' },
        `${task.priority} · ${task.status}${task.suggestedOp ? ` · 建议 ${task.suggestedOp}` : ''}`,
      ),
      task.relatedPages.length > 0
        ? React.createElement('div', { className: 'wenmai-item-snip' }, task.relatedPages.join(' · '))
        : null,
      React.createElement(
        Actions,
        null,
        React.createElement(
          Button,
          {
            primary: true,
            disabled: busyId !== null,
            onClick: () => void act('start', task.id),
          },
          '开始修',
        ),
        React.createElement(
          Button,
          { disabled: busyId !== null, onClick: () => void act('snooze', task.id) },
          '稍后',
        ),
        React.createElement(
          Button,
          { disabled: busyId !== null, onClick: () => void act('wontfix', task.id) },
          '不算问题',
        ),
      ),
    )
  return React.createElement(
    Card,
    { kicker: '文脉 · 今天该修什么' },
    React.createElement(
      'div',
      { className: 'wenmai-verdict' },
      model.error ? '读不到任务' : model.running ? '正在读取…' : model.taskCount === 0 ? '没有待修项' : `${model.taskCount} 条待处理`,
    ),
    model.error ? React.createElement('div', { className: 'wenmai-reason' }, model.error) : null,
    model.tasks.length > 0
      ? React.createElement('ul', { className: 'wenmai-list' }, model.tasks.map(row))
      : React.createElement(
          'div',
          { className: 'wenmai-empty' },
          '没有 finding 就没有任务。修某一条仍走重构，默认先预览。',
        ),
  )
}

export function TasksPanel(props: { model: TasksCardModel; cwd?: string }): React.ReactElement {
  return React.createElement(TasksBody, props)
}

export function TasksCard(props: ToolViewProps): React.ReactElement {
  const running = isToolRunning(props.block)
  const model = tasksCardModel(parseToolPayload(props.block), running)
  return React.createElement(TasksPanel, { model, cwd: props.cwd })
}
