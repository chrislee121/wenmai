import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { UserConfig } from 'tsdown'

const ID = 'dsh-wenmai'

const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
] as const

export default (): UserConfig[] => {
  const configs: UserConfig[] = []
  if (existsSync(resolve(process.cwd(), 'src/client/index.ts'))) {
    configs.push({
      name: `${ID}/client`,
      entry: { client: 'src/client/index.ts' },
      outDir: 'dist',
      format: 'cjs',
      platform: 'browser',
      target: 'es2022',
      dts: false,
      sourcemap: true,
      clean: false,
      deps: {
        neverBundle: [...PLATFORM_MODULES],
        alwaysBundle: (id: string) => (PLATFORM_MODULES.includes(id as never) ? undefined : true),
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      },
      outputOptions: {
        entryFileNames: 'client.js',
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
        footer: 'return module.exports; } });',
        intro: 'var module = { exports: {} }; var exports = module.exports;',
      },
    })
  }
  return configs
}
