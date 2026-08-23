// Final live e2e: a standard-preset session runs /plan; exit_plan_mode mints
// the plan-review question (the exact shape the adaptive pipeline's 定稿确认
// uses), and the dsh-doc-review takeover must claim it — modal auto-opens
// with the rendered plan, approving through the modal completes the turn.
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/'
const TASK = 'Plan a small change: add a --greeting flag to a CLI. Do not read or write any files. '
  + 'Call exit_plan_mode with a short plan of at most five bullet points. '
  + 'Once the plan is approved, reply with the single word DONE and stop.'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
await page.waitForTimeout(2_000)

// New session (the hero screen hosts the preset chip).
const newTab = page.getByRole('button', { name: 'New tab' })
const newTabZh = page.getByRole('button', { name: '新标签页' })
await ((await newTab.count()) > 0 ? newTab : newTabZh).click()
await page.waitForTimeout(1_500)

// Switch the blank session to the standard preset via the chip.
const chip = page.getByRole('button', { name: '自适应模式' })
await chip.click()
const menu = page.getByRole('menu')
await menu.waitFor({ timeout: 10_000 })
const standard = menu.getByRole('menuitem', { name: /^Standard mode|^标准模式/ })
await standard.click()
await page.waitForTimeout(1_500)

// Send the plan-mode task.
const textarea = page.locator('textarea:enabled').first()
await textarea.waitFor({ timeout: 20_000 })
await textarea.fill(`/plan ${TASK}`)
await textarea.press('Enter')

// The takeover bar appears and the modal auto-opens.
const bar = page.locator('[data-doc-review-key]')
await bar.waitFor({ timeout: 180_000 })
const modal = page.locator('[role="dialog"]')
await modal.waitFor({ timeout: 15_000 })
const modalTitle = await modal.getAttribute('aria-label')
const headingCount = await modal.getByRole('heading').count()
const approveCount = await modal.getByRole('button', { name: 'Approve' }).count()
const cancelCount = await modal.getByRole('button', { name: 'Chat about it' }).count()
const dshCardCount = await page.locator('[data-question-key]').count()

// Approve through the modal.
await modal.getByRole('button', { name: 'Approve' }).click()
await page.getByText('DONE', { exact: true }).waitFor({ timeout: 180_000 })
const barGone = (await page.locator('[data-doc-review-key]').count()) === 0
const modalGone = (await page.locator('[role="dialog"]').count()) === 0

console.log(JSON.stringify({
  takeoverClaimed: true,
  modalTitle,
  headingCount,
  approveCount,
  cancelCount,
  dshCardCount,
  approvedThroughModal: true,
  barGone,
  modalGone,
  errors,
}, null, 2))
await browser.close()
