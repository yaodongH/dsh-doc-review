// Chinese-locale verification: same demo as demo-live.mjs but the browser
// advertises zh-CN, so the plugin's copy and the localized intent buttons
// must render in Chinese. Leaves the review pending for the user.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/'
const SHOT_DIR = '/home/huangyaodong/deepseek-harness-workspace/dsh-doc-review/demo'
const TASK = 'Plan a small change: add a --greeting flag to a CLI. Do not read or write any files. '
  + 'Call exit_plan_mode with a COMPLETE plan in markdown that includes: a # heading naming the plan, '
  + 'three ## sections (Approach, Steps, Risks), a bullet list inside Steps, '
  + 'one markdown table, and one short code block. '
  + 'Once the plan is approved, reply with the single word DONE and stop.'

mkdirSync(SHOT_DIR, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
await page.waitForTimeout(2_000)

const newTab = page.getByRole('button', { name: 'New tab' })
const newTabZh = page.getByRole('button', { name: '新建标签页' })
await ((await newTab.count()) > 0 ? newTab : newTabZh).click()
await page.waitForTimeout(1_500)
const chip = page.getByRole('button', { name: '自适应模式' })
await chip.click()
const menu = page.getByRole('menu')
await menu.waitFor({ timeout: 10_000 })
const standard = menu.getByRole('menuitem', { name: /^Standard mode|^标准模式/ })
await standard.click()
await page.waitForTimeout(1_500)

const textarea = page.locator('textarea:enabled').first()
await textarea.waitFor({ timeout: 20_000 })
await textarea.fill(`/plan ${TASK}`)
await textarea.press('Enter')

const bar = page.locator('[data-doc-review-key]')
await bar.waitFor({ timeout: 180_000 })
const modal = page.locator('[role="dialog"]')
await modal.waitFor({ timeout: 15_000 })

// Localized copy checks (zh-CN environment).
const approveZh = await modal.getByRole('button', { name: '确认执行' }).count()
const declineZh = await modal.getByRole('button', { name: '拒绝' }).count()
const cancelZh = await modal.getByRole('button', { name: '去聊天里说' }).count()
const submitZh = await modal.getByRole('button', { name: '提交' }).count()
const closeZh = await modal.getByRole('button', { name: '关闭审阅窗口' }).count()
const englishLabels = await modal.getByRole('button', { name: /^Approve$|^Keep planning$|^Chat about it$/ }).count()

await modal.screenshot({ path: join(SHOT_DIR, 'modal-open-zh.png') })
await page.screenshot({ path: join(SHOT_DIR, 'modal-fullpage-zh.png') })
await modal.getByRole('button', { name: '关闭审阅窗口' }).click()
await page.locator('[role="dialog"]').waitFor({ state: 'detached', timeout: 5_000 })
await bar.screenshot({ path: join(SHOT_DIR, 'bar-collapsed-zh.png') })
const expandZh = await page.getByRole('button', { name: '展开完整文档' }).count()
await page.getByRole('button', { name: '展开完整文档' }).click()
await modal.waitFor({ timeout: 5_000 })


const dims = await page.evaluate(() => {
  const footer = document.querySelector('.dr-modal-footer')
  const actions = document.querySelector('.dr-actions-row')
  const custom = document.querySelector('.dr-custom')
  const input = document.querySelector('.dr-custom-input')
  return {
    footerH: footer ? Math.round(footer.getBoundingClientRect().height) : null,
    actionsH: actions ? Math.round(actions.getBoundingClientRect().height) : null,
    customH: custom ? Math.round(custom.getBoundingClientRect().height) : null,
    inputH: input ? Math.round(input.getBoundingClientRect().height) : null,
    btnH: actions ? Math.round(actions.querySelectorAll('button')[0]?.getBoundingClientRect().height ?? 0) : null,
    gap: footer ? parseFloat(getComputedStyle(footer).gap) : null,
    padBottom: footer ? parseFloat(getComputedStyle(footer).paddingBottom) : null,
  }
})
await modal.screenshot({ path: join(SHOT_DIR, 'modal-open-zh-compact.png') })

console.log(JSON.stringify({
  zhEnvironment: true,
  approveZh: approveZh === 1,
  declineZh: declineZh === 1,
  cancelZh: cancelZh === 1,
  submitZh: submitZh === 1,
  closeZh: closeZh === 1,
  expandZh: expandZh === 1,
  englishLabels,
  screenshots: ['demo/modal-open-zh.png', 'demo/modal-fullpage-zh.png', 'demo/bar-collapsed-zh.png'],
  leftPendingForUser: true,
  ...dims,
  errors,
}, null, 2))
await browser.close()
