import * as React from 'react'
import {
  statusCardModel,
  tasksCardModel,
  writtenCardModel,
  type StatusCardModel,
  type TasksCardModel,
  type WrittenCardModel,
} from '../ui/models.js'
import { wenmaiApi } from './api.js'
import { Brand, Button } from './chrome.js'
import { InitPanel, IngestPanel, StatusBody, TasksPanel, WrittenBody } from './cards.js'

export function WenmaiTab(props: { cwd?: string; onCollapse?: () => void }): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<StatusCardModel>(() => statusCardModel(null, true))
  const [tasks, setTasks] = React.useState<TasksCardModel>(() => tasksCardModel(null, true))
  const [written, setWritten] = React.useState<WrittenCardModel | null>(null)
  const [checking, setChecking] = React.useState(false)
  const ready = status.initialized && !status.error

  const loadTasks = async (): Promise<void> => {
    const result = await wenmaiApi({ op: 'tasks', taskOp: 'list', workspace: props.cwd })
    setTasks(tasksCardModel(result, false))
  }

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const statusResult = await wenmaiApi({ op: 'status', workspace: props.cwd })
        if (cancelled) return
        const next = statusCardModel(statusResult, false)
        setStatus(next)
        if (!next.initialized || next.error) {
          setTasks(tasksCardModel({ ok: true, op: 'list', taskCount: 0, tasks: [] }, false))
          return
        }
        const tasksResult = await wenmaiApi({ op: 'tasks', taskOp: 'list', workspace: props.cwd })
        if (cancelled) return
        setTasks(tasksCardModel(tasksResult, false))
      } catch (error) {
        if (cancelled) return
        const failed = { ok: false, error: error instanceof Error ? error.message : '请求失败' }
        setStatus(statusCardModel(failed, false))
        setTasks(tasksCardModel(failed, false))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.cwd])

  const check = async (): Promise<void> => {
    const trimmed = query.trim()
    if (!trimmed || !ready) return
    setChecking(true)
    setWritten(writtenCardModel(null, true))
    try {
      const result = await wenmaiApi({ op: 'written', query: trimmed, workspace: props.cwd })
      setWritten(writtenCardModel(result, false))
    } catch (error) {
      setWritten(
        writtenCardModel(
          {
            ok: false,
            query: trimmed,
            error: error instanceof Error ? error.message : '查询失败',
          },
          false,
        ),
      )
    } finally {
      setChecking(false)
    }
  }

  const refreshStatus = async (): Promise<void> => {
    const result = await wenmaiApi({ op: 'status', workspace: props.cwd })
    setStatus(statusCardModel(result, false))
  }

  const onReady = (next: StatusCardModel): void => {
    setStatus(next)
    void loadTasks()
  }

  return React.createElement(
    'div',
    { className: 'wenmai-tab' },
    React.createElement(
      'header',
      { className: 'wenmai-tab-head' },
      React.createElement(
        'div',
        { className: 'wenmai-tab-copy' },
        React.createElement(Brand, null),
        React.createElement('div', { className: 'wenmai-tab-title' }, '写之前先看一眼'),
        React.createElement(
          'div',
          { className: 'wenmai-reason' },
          ready
            ? '查选题、收旧稿、以及今天该修什么。不在这里改编译页。'
            : '先建库，才能查撞稿、收旧稿、审视。',
        ),
      ),
      props.onCollapse
        ? React.createElement(
            Button,
            { onClick: props.onCollapse },
            '收起',
          )
        : null,
    ),
    React.createElement(
      'form',
      {
        className: 'wenmai-search',
        onSubmit: (event: React.FormEvent) => {
          event.preventDefault()
          event.stopPropagation()
          void check()
        },
      },
      React.createElement('input', {
        value: query,
        placeholder: ready ? '这个选题我写过没有' : '先建库再查写过没有',
        disabled: !ready,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
      }),
      React.createElement(
        Button,
        { type: 'submit', primary: true, disabled: checking || !ready || !query.trim() },
        checking ? '在查…' : '查写过没有',
      ),
    ),
    written ? React.createElement(WrittenBody, { model: written }) : null,
    !status.running && !status.initialized && !status.error
      ? React.createElement(InitPanel, { cwd: props.cwd, onReady })
      : null,
    ready ? React.createElement(IngestPanel, { cwd: props.cwd, onChanged: () => void refreshStatus() }) : null,
    ready ? React.createElement(TasksPanel, { model: tasks, cwd: props.cwd, rawCount: status.rawCount }) : null,
    React.createElement(StatusBody, { model: status, compact: true }),
  )
}
