// Final live e2e: a standard-preset session runs /plan; exit_plan_mode mints
// the plan-review question (the exact shape the adaptive pipeline's 定稿确认
// uses), and the dsh-doc-review takeover must claim it — modal auto-opens
// with the rendered plan, approving through the modal completes the turn.
//
// The target is `DSH_E2E_URL` (default: the local server on 3080); a scratch
// lane seeds its own home and mock model and passes the assigned URL. The
// driver exits non-zero when the takeover was not claimed, the approval did
// not settle the turn, or the composer chain reported a selector crash.
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'

const BASE = process.env.DSH_E2E_URL ?? 'http://127.0.0.1:3080/'
const WORKSPACE = process.env.DSH_E2E_WORKSPACE ?? ''
const TASK = 'Plan a small change: add a --greeting flag to a CLI. Do not read or write any files. '
  + 'Call exit_plan_mode with a short plan of at most five bullet points. '
  + 'Once the plan is approved, reply with the single word DONE and stop.'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', (msg) => {
  if (msg.type() !== 'error') return
  const url = msg.location().url
  errors.push(url === '' ? msg.text() : `${msg.text()} @ ${url}`)
})
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

/** The Lexical composer (the session's ready signal). */
const composer = () => page.locator('[data-composer-input][contenteditable="true"]').first()

/** Dismiss the first-run onboarding when this home has not seen it. */
async function dismissOnboarding() {
  const any = page.getByRole('button', { name: /^(Continue|Configure later|继续|稍后配置)$/ })
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline && await any.count() === 0) await page.waitForTimeout(250)
  if (await any.count() === 0) return
  for (let round = 0; round < 8; round += 1) {
    let dismissed = false
    for (const name of [/^(Continue|继续)$/, /^(Configure later|稍后配置)$/]) {
      const button = page.getByRole('button', { name }).first()
      if (await button.count() === 0) continue
      await button.click()
      dismissed = true
      await page.waitForTimeout(400)
    }
    if (!dismissed) return
  }
}

/** Pick a workspace through the shell dialog (only a home without one needs it). */
async function pickWorkspace(path) {
  const trigger = page.getByRole('button', { name: /^(Choose workspace|选择工作区)/ }).first()
  await trigger.waitFor({ timeout: 30_000 })
  const picker = page.getByRole('dialog', { name: /^(Select Workspace Directory|选择工作区目录)$/ })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await trigger.click()
    try {
      await picker.waitFor({ timeout: 10_000 })
      break
    } catch {
      // A first click can miss while the hero mounts; retry.
    }
  }
  await picker.waitFor({ timeout: 10_000 })
  await picker.getByRole('button', { name: /^(Edit path|编辑路径)$/ }).click()
  const input = picker.getByRole('textbox', { name: /^(Edit path|编辑路径)$/ })
  await input.fill(path)
  await input.press('Enter')
  await picker.getByRole('button', { name: /^(Open|打开)$/ }).click()
  await picker.waitFor({ state: 'hidden', timeout: 15_000 })
}

let claimed = false
let approvedThroughModal = false
let failure = null
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await dismissOnboarding()
  try {
    await composer().waitFor({ timeout: 15_000 })
  } catch {
    if (WORKSPACE === '') throw new Error('the session has no workspace; pass DSH_E2E_WORKSPACE to pick one')
    await pickWorkspace(WORKSPACE)
    await composer().waitFor({ timeout: 30_000 })
  }
  await page.waitForTimeout(1_000)

  // New session (the hero screen hosts the preset chip).
  const newTab = page.getByRole('button', { name: /^(New tab|新标签页)$/ })
  if (await newTab.count() > 0) {
    await newTab.first().click()
    await page.waitForTimeout(1_500)
  }

  // Leave the adaptive preset when this deployment offers it: the lane is the
  // standard-preset plan flow.
  const chip = page.getByRole('button', { name: '自适应模式' })
  if (await chip.count() > 0) {
    await chip.first().click()
    const menu = page.getByRole('menu')
    await menu.waitFor({ timeout: 10_000 })
    await menu.getByRole('menuitem', { name: /^Standard mode|^标准模式/ }).click()
    await page.waitForTimeout(1_500)
  }

  // Send the plan-mode task.
  const textarea = composer()
  await textarea.waitFor({ timeout: 20_000 })
  await textarea.click()
  await page.keyboard.type(`/plan ${TASK}`)
  await page.keyboard.press('Enter')

  // The takeover bar appears and the modal auto-opens.
  const bar = page.locator('[data-doc-review-key]')
  await bar.waitFor({ timeout: 180_000 })
  claimed = true
  const modal = page.locator('[role="dialog"]')
  await modal.waitFor({ timeout: 15_000 })
  const modalTitle = await modal.getAttribute('aria-label')
  const headingCount = await modal.getByRole('heading').count()
  const approve = modal.getByRole('button', { name: /^(Approve|确认执行)$/ })
  const approveCount = await approve.count()
  const cancelCount = await modal.getByRole('button', { name: /Chat about it|去聊天里说/ }).count()
  const dshCardCount = await page.locator('[data-question-key]').count()

  // Approve through the modal.
  await approve.first().click()
  await page.getByText('DONE', { exact: true }).waitFor({ timeout: 180_000 })
  approvedThroughModal = true
  const barGone = await page.locator('[data-doc-review-key]').count() === 0
  const modalGone = await page.locator('[role="dialog"]').count() === 0

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
} catch (error) {
  failure = String(error?.message ?? error)
  console.log(JSON.stringify({ takeoverClaimed: claimed, approvedThroughModal, failure, errors }, null, 2))
} finally {
  await browser.close()
}

const selectorCrashes = errors.filter(text => text.includes('chain selector crashed'))
process.exit(claimed && approvedThroughModal && selectorCrashes.length === 0 && failure === null ? 0 : 1)
