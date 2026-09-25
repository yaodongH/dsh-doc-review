import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Test resolution: the @deepseek-ai client packages load as SOURCE, not as
 * their installed lib/client.js module-table bundles (those register through
 * window.__ModuleLoader__ and cannot run in vitest). This mirrors the DSH
 * repository's own tsconfig-paths-to-src test resolution. The repo path is
 * anchored on the process cwd (vitest re-bundles this config under
 * node_modules/.vite-temp, so import.meta.url is not stable).
 *
 * Only the spec-visible VALUE imports need an alias: react and the UI
 * primitives the panel renders with. Every @deepseek-ai client type this
 * package consumes (the composer chain owner props, the pending-question
 * carrier, the locale seat) is `import type` and erased before vitest sees it.
 *
 * When the sibling DSH checkout is absent (e.g. a CI run that could not fetch
 * it), the source aliases cannot resolve, so the suite is skipped with
 * passWithNoTests — the typecheck and build jobs still validate the plugin
 * against the published @deepseek-ai packages.
 */
const REPO = resolve(process.cwd(), '..', 'deepseek-harness')

const SOURCE_ALIASES = [
  ['@deepseek-ai/dsh-client-ui-primitives', 'packages/client/ui-primitives/src/index.ts'],
  // The store engine's installed lib requires zustand through the strict
  // pnpm graph, which this plugin cannot see; the DSH source resolves its
  // implementation libraries from the sibling checkout's own install.
  ['@deepseek-ai/dsh-client-store', 'packages/client/store/src/index.ts'],
] as const

const hasDshSource = existsSync(resolve(REPO, 'packages', 'client', 'ui-primitives', 'src'))

export default defineConfig({
  resolve: {
    alias: SOURCE_ALIASES.map(([find, replacement]) => ({
      find,
      replacement: resolve(REPO, replacement),
    })),
    // The aliased DSH sources import react from the sibling checkout's own
    // install; without dedupe the panel renders on one React and the spec's
    // react-dom on another, and every hook call throws.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  test: {
    // Node by default; DOM specs opt in with a per-file jsdom pragma.
    include: hasDshSource ? ['tests/**/*.spec.{ts,tsx}'] : [],
    passWithNoTests: true,
  },
})
