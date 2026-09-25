// Final live e2e: a standard-preset session runs /plan; exit_plan_mode mints
// the plan-review question, the native decision card claims it, and this
// plugin's extension tab takes over the review's sidebar document — the plan
// renders through the native MarkdownText with the plugin's chrome — and the
// turn completes through the card's own approve action.
//
// The target is `DSH_E2E_URL` (default: the local server on 3080, token
// auto-discovered from the web log); a scratch lane seeds its own home and
// mock model and passes the assigned URL. The driver exits non-zero when the
// card was not claimed, the sidebar tab did not render the plan, the approval
// did not settle the turn, or the page reported a script crash.
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'

const BASE = process.env.DSH_E2E_URL
  ?? `http://127.0.0.1:3080/?token=${/token=([A-Za-z0-9_-]+)/.exec(readFileSync('/home/huangyaodong/.dsh/dsh-web.log', 'utf8'))?.[1] ?? ''}`
const TASK = 'Plan a small change: add a --greeting flag to a CLI. Do not read or write any files. '
  + 'Call exit_plan_mode with a short plan of at most five bullet points. '
  + 'Once the plan is approved, reply with the single word DONE and stop.'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1720, height: 980 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() !== 'error') return
  const url = msg.location().url
  // The native open-in-app icon asset 404s on every home (pre-existing).
  if (url.includes('/open-in-app/icon/')) return
  errors.push(url === '' ? msg.text() : `${msg.text()} @ ${url}`)
})
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

/** The resident composer (the session's ready signal). */
const composer = () => page.locator('[contenteditable="true"]').first()

let claimed = false
let sidebarRendered = false
let approvedThroughCard = false
let failure = null
try {
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForSelector('[class*="frame"]', { timeout: 60_000 })
  await page.waitForTimeout(2_000)

  // The review's sidebar tab; the right sidebar docks expanded at this width.
  const tab = page.locator('[data-doc-review-key]').first()
  for (;;) {
    if (await tab.count() > 0) break
    const expand = page.getByRole('button', { name: /Open right sidebar|打开右侧边栏/ })
    if (await expand.count() > 0) await expand.first().click().catch(() => {})
    await page.waitForTimeout(500)
  }

  const input = composer()
  await input.waitFor({ timeout: 30_000 })
  await input.fill(`/plan ${TASK}`)
  await input.press('Enter')

  // The native card claims the review; the plugin's tab renders the plan.
  const card = page.locator('[data-plan-review-key]').first()
  await card.waitFor({ timeout: 8 * 60_000 })
  claimed = true
  await tab.getByRole('heading').first().waitFor({ timeout: 20_000 })
  sidebarRendered = true
  const headings = await tab.getByRole('heading').count()

  // The badge is absent before any comment; the native Approve stays.
  const badge = await card.locator('[data-doc-review-badge]').count()
  const approve = card.getByRole('button', { name: /^(Approve|同意执行)$/ })
  const approveCount = await approve.count()
  const discuss = await card.getByRole('button', { name: /Request changes|要求修改/ }).count()

  // Approve through the native card.
  await approve.first().click()
  await card.waitFor({ state: 'detached', timeout: 60_000 })
  approvedThroughCard = true
  await page.getByText('DONE', { exact: true }).waitFor({ timeout: 5 * 60_000 })

  console.log(JSON.stringify({
    claimed,
    sidebarRendered,
    headings,
    badgeBeforeComment: badge,
    approveCount,
    discussCount: discuss,
    approvedThroughCard,
    errors,
  }, null, 2))
} catch (err) {
  failure = err instanceof Error ? err.message : String(err)
  console.log(JSON.stringify({ claimed, sidebarRendered, approvedThroughCard, failure, errors }, null, 2))
}
process.exit(claimed && sidebarRendered && approvedThroughCard && errors.length === 0 && failure === null ? 0 : 1)