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
import { Button } from './chrome.js'
import { StatusBody, TasksPanel, WrittenBody } from './cards.js'

export function WenmaiTab(props: { cwd?: string; onCollapse?: () => void }): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<StatusCardModel>(() => statusCardModel(null, true))
  const [tasks, setTasks] = React.useState<TasksCardModel>(() => tasksCardModel(null, true))
  const [written, setWritten] = React.useState<WrittenCardModel | null>(null)
  const [checking, setChecking] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [statusResult, tasksResult] = await Promise.all([
          wenmaiApi({ op: 'status', workspace: props.cwd }),
          wenmaiApi({ op: 'tasks', taskOp: 'list', workspace: props.cwd }),
        ])
        if (cancelled) return
        setStatus(statusCardModel(statusResult, false))
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
    if (!trimmed) return
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

  return React.createElement(
    'div',
    { className: 'wenmai-tab' },
    React.createElement(
      'header',
      { className: 'wenmai-tab-head' },
      React.createElement(
        'div',
        { className: 'wenmai-tab-copy' },
        React.createElement('div', { className: 'wenmai-kicker' }, 'WENMAI'),
        React.createElement('div', { className: 'wenmai-tab-title' }, '写之前先看一眼'),
        React.createElement('div', { className: 'wenmai-reason' }, '查选题、看库是否就绪、以及今天该修什么。不在这里改编译页。'),
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
        placeholder: '这个选题我写过没有',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
      }),
      React.createElement(
        Button,
        { type: 'submit', primary: true, disabled: checking || !query.trim() },
        checking ? '在查…' : '查写过没有',
      ),
    ),
    written ? React.createElement(WrittenBody, { model: written }) : null,
    React.createElement(StatusBody, { model: status }),
    React.createElement(TasksPanel, { model: tasks, cwd: props.cwd }),
  )
}
