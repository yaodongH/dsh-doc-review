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
 * When the sibling DSH checkout is absent (e.g. a CI run that could not fetch
 * it), the source aliases cannot resolve, so the suite is skipped with
 * passWithNoTests — the typecheck and build jobs still validate the plugin
 * against the published @deepseek-ai packages.
 */
const REPO = resolve(process.cwd(), '..', 'deepseek-harness')

const SOURCE_ALIASES = [
  ['@deepseek-ai/dsh-client-runtime/client', 'packages/client/runtime/src/client/index.ts'],
  ['@deepseek-ai/dsh-client-connection/client', 'packages/client/connection/src/client/index.ts'],
  ['@deepseek-ai/dsh-client-ui-primitives', 'packages/client/ui-primitives/src/index.ts'],
  ['@deepseek-ai/dsh-client-ui-slots', 'packages/client/ui-slots/src/index.ts'],
  ['@deepseek-ai/dsh-client-locale', 'packages/client/locale/src/index.ts'],
] as const

const hasDshSource = existsSync(resolve(REPO, 'packages', 'client', 'runtime', 'src'))

export default defineConfig({
  resolve: {
    alias: SOURCE_ALIASES.map(([find, replacement]) => ({
      find,
      replacement: resolve(REPO, replacement),
    })),
  },
  test: {
    // Node by default; DOM specs opt in with a per-file jsdom pragma.
    include: hasDshSource ? ['tests/**/*.spec.{ts,tsx}'] : [],
    passWithNoTests: true,
  },
})
