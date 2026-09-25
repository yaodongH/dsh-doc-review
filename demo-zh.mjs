// Chinese-locale demo: drives the native plan review (/plan) with a rich
// markdown plan, takes over its sidebar tab, comments at a block, and leaves
// the review pending for the user. Captures the demo screenshots: the native
// card with the unsubmitted badge, the sidebar review tab with the comment
// card, and the hover affordance.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'

const LOG = '/home/huangyaodong/.dsh/dsh-web.log'
const BASE = `http://127.0.0.1:3080/?token=${/token=([A-Za-z0-9_-]+)/.exec(readFileSync('/home/huangyaodong/.dsh/dsh-web.log', 'utf8'))?.[1] ?? ''}`
const SHOT_DIR = '/home/huangyaodong/deepseek-harness-workspace/dsh-doc-review/demo'
const TASK = 'Plan a small change: add a --greeting flag to a CLI. Do not read or write any files. '
  + 'Call exit_plan_mode with a COMPLETE plan in markdown that includes: a # heading naming the plan, '
  + 'three ## sections (Approach, Steps, Risks), a bullet list inside Steps, '
  + 'one markdown table, and one short code block. '
  + 'Once the plan is approved, reply with the single word DONE and stop.'

mkdirSync(SHOT_DIR, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1720, height: 980 }, locale: 'zh-CN' })
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
await page.waitForTimeout(2_000)

await page.getByRole('button', { name: /新建会话|New session/i }).first().click()
await page.waitForTimeout(1_500)

const chip = page.getByRole('button', { name: /自适应模式|Adaptive mode/ }).first()
if ((await chip.count()) > 0) {
  await chip.click()
  const menu = page.getByRole('menu')
  await menu.waitFor({ timeout: 10_000 })
  await menu.getByRole('menuitem', { name: /^Standard mode|^标准模式/ }).click()
  await page.waitForTimeout(1_500)
}

const input = page.locator('[contenteditable="true"]').first()
await input.waitFor({ timeout: 20_000 })
await input.fill(`/plan ${TASK}`)
await input.press('Enter')

// The native decision card and the plugin's review tab.
const card = page.locator('[data-plan-review-key]')
await card.waitFor({ timeout: 240_000 })
const tab = page.locator('[data-doc-review-key]')
for (;;) {
  if ((await tab.count()) > 0) break
  const expand = page.getByRole('button', { name: /打开右侧边栏|Open right sidebar/ })
  if ((await expand.count()) > 0) await expand.first().click().catch(() => {})
  await page.waitForTimeout(1_000)
}
await tab.getByRole('heading').first().waitFor({ timeout: 20_000 })

// The native card keeps its Approve path while the comment is unsubmitted.
const approveCard = await card.getByRole('button', { name: /同意执行|Approve/ }).count()

// Comment at a block through the right-click.
const body = tab.locator('.drr-body')
const paragraph = body.locator('p').first()
await paragraph.waitFor({ timeout: 20_000 })
await paragraph.click({ button: 'right' })
const editorInput = page.locator('.drr-editor-input')
await editorInput.waitFor({ timeout: 10_000 })
await editorInput.fill('这一步需要说明验收标准')
await page.getByRole('button', { name: /发布|Publish/ }).click()
await tab.locator('.drr-comment').getByText('这一步需要说明验收标准').waitFor({ timeout: 10_000 })

const checks = {
  approveCardStillAvailable: approveCard > 0,
  unsubmittedBadge: (await card.locator('[data-doc-review-badge]').getByRole('button', { name: '1 条未提交评论' }).count()) > 0,
  tabCount: (await page.getByText('1 条评论', { exact: true }).count()) > 0,
  commentCard: (await tab.locator('.drr-comment').count()) > 0,
  nativeHeadings: (await tab.getByRole('heading').count()) > 0,
}

await tab.screenshot({ path: join(SHOT_DIR, 'review-tab-zh.png') })
await page.screenshot({ path: join(SHOT_DIR, 'review-fullpage-zh.png') })

// Hover affordance for the demo shot.
const block = body.locator('h2').first()
if ((await block.count()) > 0) {
  await block.hover()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(SHOT_DIR, 'review-affordance-zh.png') })
}

console.log(JSON.stringify({
  zhEnvironment: true,
  approveCardStillAvailable: approveCard > 0,
  unsubmittedBadge: checks,
  screenshots: ['demo/review-tab-zh.png', 'demo/review-fullpage-zh.png', 'demo/review-affordance-zh.png'],
  leftPendingForUser: true,
  errors,
}, null, 2))
await browser.close()