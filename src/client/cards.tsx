import * as React from 'react'
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
} from '../ui/models.js'
import { wenmaiApi } from './api.js'
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

export function WrittenBody(props: { model: WrittenCardModel }): React.ReactElement {
  const { model } = props
  return React.createElement(
    Card,
    { tone: toneOf(model.verdict), kicker: model.query ? `文脉 · ${model.query}` : '文脉' },
    React.createElement('div', { className: 'wenmai-verdict' }, model.headline),
    model.reason ? React.createElement('div', { className: 'wenmai-reason' }, model.reason) : null,
    model.hits.length > 0
      ? React.createElement(
          'ul',
          { className: 'wenmai-list' },
          model.hits.map((hit) =>
            React.createElement(
              'li',
              { key: hit.path, className: 'wenmai-item' },
              React.createElement('div', { className: 'wenmai-item-title' }, hit.title),
              React.createElement('div', { className: 'wenmai-item-path' }, hit.path),
              hit.snippet
                ? React.createElement('div', { className: 'wenmai-item-snip' }, hit.snippet)
                : null,
            ),
          ),
        )
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
}): React.ReactElement {
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<IngestCardModel | null>(null)
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
      setDone(ingestCardModel(result, false))
    } finally {
      setBusy(false)
    }
  }
  const headline = model.error
    ? '收录失败'
    : model.dryRun
      ? `将收录 ${model.planned} 篇`
      : `已写入 ${model.ingested} 篇`
  return React.createElement(
    Card,
    { kicker: '文脉 · 收录' },
    React.createElement('div', { className: 'wenmai-verdict' }, headline),
    React.createElement(
      'div',
      { className: 'wenmai-meta' },
      model.dir || model.error || '没有可收录的稿',
    ),
    model.files.length > 0
      ? React.createElement(
          'ul',
          { className: 'wenmai-list' },
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
          null,
          React.createElement(
            Button,
            { primary: true, disabled: busy, onClick: () => void confirm() },
            busy ? '正在写入…' : '确认收录',
          ),
        )
      : null,
    !model.dryRun && model.ingested > 0
      ? React.createElement('div', { className: 'wenmai-meta' }, '只写进了 raw/，编译页请另外交代。')
      : null,
  )
}

export function IngestCard(props: ToolViewProps): React.ReactElement {
  const running = isToolRunning(props.block)
  const model = ingestCardModel(parseToolPayload(props.block), running)
  return React.createElement(IngestBody, { model, cwd: props.cwd })
}

export function StatusBody(props: { model: StatusCardModel }): React.ReactElement {
  const { model } = props
  return React.createElement(
    Card,
    { kicker: '文脉 · 状态' },
    React.createElement(
      'div',
      { className: 'wenmai-verdict' },
      model.error ? '读不到库' : model.initialized ? '库已就绪' : '还没初始化',
    ),
    React.createElement(
      'div',
      { className: 'wenmai-meta' },
      model.error
        ? model.error
        : `编译页 ${model.pageCount} · 原文 ${model.rawCount}${model.root ? ` · ${model.root}` : ''}`,
    ),
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
      model.error ? '读不到任务' : model.taskCount === 0 ? '没有待修项' : `${model.taskCount} 条待处理`,
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
