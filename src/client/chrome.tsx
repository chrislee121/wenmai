import * as React from 'react'
import { WENMAI_MARK } from './mark.js'

export function Brand(): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'wenmai-brand' },
    React.createElement('img', {
      className: 'wenmai-mark',
      src: WENMAI_MARK,
      alt: '',
      width: 16,
      height: 16,
    }),
    React.createElement(
      'span',
      { className: 'wenmai-brand-name' },
      '文脉',
      React.createElement('span', { className: 'wenmai-brand-en' }, 'WENMAI'),
    ),
  )
}

export function Card(props: {
  tone?: 'new' | 'review' | 'duplicate' | 'plain'
  kicker?: string
  children: React.ReactNode
}): React.ReactElement {
  return React.createElement(
    'section',
    { className: 'wenmai-card', 'data-tone': props.tone ?? 'plain' },
    props.kicker
      ? React.createElement('div', { className: 'wenmai-kicker' }, props.kicker)
      : null,
    props.children,
  )
}

export function Actions(props: { children: React.ReactNode }): React.ReactElement {
  return React.createElement('div', { className: 'wenmai-actions' }, props.children)
}

export function Button(props: {
  children: React.ReactNode
  primary?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void
}): React.ReactElement {
  return React.createElement(
    'button',
    {
      type: props.type ?? 'button',
      className: 'wenmai-btn',
      'data-primary': props.primary ? 'true' : undefined,
      disabled: props.disabled,
      onClick: props.onClick,
    },
    props.children,
  )
}
