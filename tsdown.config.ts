import { defineConfig } from 'tsdown'

/**
 * Browser bundle for a web client plugin row: a closure-factory artifact that
 * calls `window.__ModuleLoader__.load({ id, factory })` and resolves externals
 * (react and the module-table baseline: the store engine and ui-primitives)
 * through the injected require. Everything else is inlined; this plugin keeps
 * every @deepseek-ai value import on the module-table baseline, so the only
 * bare requests left in the bundle are react and the two baseline packages.
 */
const BASELINE_EXTERNALS = [
  'react', 'react/jsx-runtime',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
]

function clientBundle(pluginId: string, entryFile: string) {
  return {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs' as const,
    platform: 'browser' as const,
    dts: false,
    sourcemap: false,
    clean: false,
    external: BASELINE_EXTERNALS,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
      'import.meta.resolve': 'undefined',
    },
    inputOptions: {
      resolve: {
        conditionNames: ['browser', 'import', 'require', 'default'],
      },
    },
    noExternal: (id: string) => (
      BASELINE_EXTERNALS.includes(id)
        ? undefined
        : true
    ),
    outputOptions: {
      entryFileNames: entryFile,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  }
}

export default defineConfig([
  {
    entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  clientBundle('dsh-doc-review', 'client.js'),
  clientBundle('dsh-external/dsh-doc-review', 'client-registry.js'),
])
