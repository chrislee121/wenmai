declare module '@deepseek-ai/cordis' {
  export interface Context {
    tools: {
      register(tool: unknown): void
    }
    commands: {
      register(command: {
        name: string
        description: string
        input?: { hint?: string }
        handler: (invocation: {
          rawInput: string
          signal: AbortSignal
          agent?: { session?: { header?: { cwd?: string }; cwd?: string } }
        }) => Promise<{
          kind: 'success' | 'error'
          text: string
        }>
      }): void
    }
    systemPrompt: {
      section(spec: { name: string; order: number; text: string }): void
      context(spec: {
        name: string
        order: number
        text: string | ((assembleContext?: unknown) => string)
      }): void
    }
    effect(factory: () => void | (() => void) | Promise<void | (() => void)>): void
  }
}

declare module '@deepseek-ai/dsh-tools' {
  export interface ToolExec {
    signal: AbortSignal & { throwIfAborted?: () => void }
    agent?: { session?: { header?: { cwd?: string }; cwd?: string } }
  }

  export function defineTool(def: {
    name: string
    description: string
    parameters: Record<string, unknown>
    output: {
      schema: Record<string, unknown>
      render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
    }
    execute: (args: any, exec: ToolExec) => Promise<unknown>
  }): unknown
}
