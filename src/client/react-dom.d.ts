declare module 'react-dom' {
  import type { ReactElement, ReactNode } from 'react'
  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string,
  ): ReactElement
}
