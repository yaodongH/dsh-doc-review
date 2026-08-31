// Live e2e of the line-comment feature (文档行内评论) inside the real web app.
//
// Scenario 1 — adaptive pipeline (the primary doc-review surface):
//   a real design question is claimed by the takeover; the modal renders the
//   document as a line grid; comments are added through the gutter and the
//   right-click popup, edited, deleted, and survive a page reload (localStorage
//   persistence keyed by the stable wait key); submitting comments delivers the
//   aggregated feedback to the pipeline, the review advances, and the whole
//   task completes with the requested file created.
//
// Scenario 2 — standard plan-mode (the plan-review intent, English UI):
//   a /plan review is claimed; adding a comment blocks the Approve path
//   (a half-finished review can never be approved), clearing the comments
//   restores it, and approving through the modal completes the turn with DONE.
//
// Asserts are hard failures: any failed assertion prints FAIL and the script
// exits non-zero. Console errors from the page are reported as well.
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://127.0.0.1:3080/'
const HELLO = join('/home/huangyaodong/deepseek-harness-workspace', 'dsh-doc-review', 'hello.txt')
const TASK = '在 dsh-doc-review 目录下创建文件 hello.txt，内容为 hello world。不要修改其他任何文件。'
const PLAN_TASK = 'Plan a small change: add a --greeting flag to a CLI. Do not read or write any files. '
  + 'Call exit_plan_mode with a short plan of at most five bullet points. '
  + 'Once the plan is approved, reply with the single word DONE and stop.'

const failures = []
const results = []
function check(cond, label) {
  if (cond) return true
  failures.push(label)
  console.log(`FAIL: ${label}`)
  return false
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// --- locale label sets (the app UI is English in a fresh profile; zh fallback) ---
const EN = {
  newTab: 'New tab', newSession: 'New session', expand: 'Expand full document',
  chatAbout: 'Chat about it',
  add: 'Add comment', placeholder: 'Type your comment', publish: 'Publish',
  edit: 'Edit comment', del: 'Delete comment', save: 'Save',
  submitAll: 'Submit comments', cancelAll: 'Cancel', approve: 'Approve',
  confirmTitle: 'Clear all comments?', confirmOk: 'Confirm', confirmCancel: 'Not yet',
  count: n => `${n} comments`,
  lineMark: 'This line has comments',
  standard: /^Standard mode|^标准模式/, adaptive: /^Adaptive mode|^自适应模式/,
}
const ZH = {
  newTab: '新标签页', newSession: '新建会话', expand: '展开完整文档',
  chatAbout: '去聊天里说',
  add: '添加评论', placeholder: '输入你的评论', publish: '发布',
  edit: '编辑评论', del: '删除评论', save: '保存',
  submitAll: '提交评论', cancelAll: '取消', approve: '确认执行',
  confirmTitle: '确认清空所有评论？', confirmOk: '确定', confirmCancel: '再想想',
  count: n => `${n} 条评论`,
  lineMark: '本行有评论',
  standard: /^标准模式|Standard mode/, adaptive: /^自适应模式|Adaptive mode/,
}

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
await page.waitForTimeout(2_000)

// Locale detection: the fresh app chrome is English unless zh labels appear.
const l = (await page.getByRole('button', { name: '新标签页' }).count()) > 0 ? ZH : EN

/** Open a brand-new session. The restored session's tab strip may be hidden
 * (its 'New tab' button is only in the a11y tree when the tab bar is shown),
 * but the sidebar 'New session' affordance is always visible and lands on a
 * fresh tab whose composer is enabled. */
async function openNewSession() {
  const newSession = page.getByRole('button', { name: l.newSession }).first()
  await newSession.waitFor({ timeout: 40_000 })
  await newSession.click()
  await sleep(1_500)
}

// ============================================================================
// Scenario 1 — adaptive pipeline: the full comment lifecycle
// ============================================================================
async function scenario1() {
  // Remove any artifact a previous run left behind, so completion is proven
  // by THIS run's pipeline.
  try { rmSync(HELLO, { force: true }) } catch { /* read-only FS — the file check still applies */ }
  const out = { steps: {} }
  const textarea = page.locator('textarea:enabled').first()
  await textarea.waitFor({ timeout: 30_000 })
  await textarea.fill(TASK)
  await textarea.press('Enter')

  // The takeover claims the design review: bar appears, modal auto-opens.
  const bar = page.locator('[data-doc-review-key]').first()
  await bar.waitFor({ timeout: 10 * 60_000 })
  const modal = page.locator('[role="dialog"]').first()
  await modal.waitFor({ timeout: 15_000 })
  out.title = await modal.getAttribute('aria-label')
  console.log('S1: review claimed —', out.title)

  // The document renders as a line grid.
  const rows = modal.locator('[data-line]')
  out.lineCount = await rows.count()
  check(out.lineCount >= 3, 'S1: line grid rendered with rows')

  // 1. Add a comment through the gutter on the first line.
  const firstRow = rows.first()
  await firstRow.locator('.dr-line-gutter-num').click()
  const editor1 = firstRow.locator('.dr-comment-editor-input')
  await editor1.waitFor({ timeout: 10_000 })
  await editor1.fill('第一行评论')
  await modal.getByRole('button', { name: l.publish }).click()
  await firstRow.getByText('第一行评论').waitFor({ timeout: 10_000 })
  check(await page.getByText(l.count(1), { exact: true }).count() > 0, 'S1: count badge 1 comment')
  check(await modal.locator('.dr-options button').count() === 0, 'S1: options hidden while comments exist')
  check(await modal.getByRole('button', { name: l.submitAll }).count() > 0, 'S1: 提交评论 footer present')

  // 2. Add a second comment through the right-click popup on a middle line.
  const ctxRow = rows.nth(Math.max(1, Math.floor((await rows.count()) / 2)))
  const ctxLine = Number(await ctxRow.getAttribute('data-line'))
  await ctxRow.click({ button: 'right' })
  await page.getByRole('button', { name: l.add }).waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: l.add }).click()
  // The editor opens on the anchored line — locate it from the modal and check it.
  const editor2 = modal.locator('.dr-comment-editor-input').first()
  await editor2.waitFor({ timeout: 10_000 })
  const editorRow = editor2.locator('xpath=ancestor::*[@data-line][1]')
  const editorLine = Number(await editorRow.getAttribute('data-line'))
  check(editorLine === ctxLine, `S1: right-click editor anchors to line ${ctxLine} (got ${editorLine})`)
  await editor2.fill('右键评论')
  await modal.getByRole('button', { name: l.publish }).click()
  await modal.locator(`[data-line="${ctxLine}"] .dr-comment`).getByText('右键评论').waitFor({ timeout: 10_000 })
  check(await modal.locator(`[data-line="${ctxLine}"].dr-line-commented`).count() === 1, 'S1: context line marked commented')
  check(await page.getByText(l.count(2), { exact: true }).count() > 0, 'S1: count badge 2 comments')

  // 3. Edit the right-clicked comment: prefilled text, save, updated copy.
  await modal.locator(`[data-line="${ctxLine}"] .dr-comment`).getByRole('button', { name: l.edit }).click()
  const editInput = modal.locator(`[data-line="${ctxLine}"] .dr-comment-editor-input`)
  await editInput.waitFor({ timeout: 10_000 })
  check((await editInput.inputValue()) === '右键评论', 'S1: edit editor pre-filled')
  await editInput.fill('右键评论（已修改）')
  // The comment block is replaced by the editor while editing — scope to the row.
  await modal.locator(`[data-line="${ctxLine}"]`).getByRole('button', { name: l.save }).click()
  await modal.locator(`[data-line="${ctxLine}"] .dr-comment`).getByText('右键评论（已修改）').waitFor({ timeout: 10_000 })
  check(await modal.locator(`[data-line="${ctxLine}"] .dr-comment`).getByText('右键评论', { exact: true }).count() === 0, 'S1: edited text replaced')

  console.log('S1: lifecycle done — submit flow next')
  // 4. Delete the first comment: count back to one.
  await firstRow.locator('.dr-comment').getByRole('button', { name: l.del }).click()
  await sleep(300)
  check(await page.getByText(l.count(1), { exact: true }).count() > 0, 'S1: count badge back to 1')
  check(await firstRow.locator('.dr-comment').count() === 0, 'S1: first comment removed')

  // 5. Persistence: comments survive a page reload (localStorage keyed by wait key).
  const keysBefore = await page.evaluate(() =>
    Object.keys(localStorage).filter(k => k.startsWith('dsh-doc-review:v1:comments:')))
  check(keysBefore.length >= 1, 'S1: persisted comments entry exists')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  const bar2 = page.locator('[data-doc-review-key]').first()
  await bar2.waitFor({ timeout: 90_000 })
  await page.locator('[role="dialog"]').first().waitFor({ timeout: 30_000 })
  await page.getByText('右键评论（已修改）').waitFor({ timeout: 10_000 })
  check(await page.getByText(l.count(1), { exact: true }).count() > 0, 'S1: comment restored after reload')
  check(await page.locator('[data-doc-review-key] .dr-bar-count').count() > 0, 'S1: bar count badge after reload')

  // 6. Submit the comments: aggregated feedback is answered, storage cleared,
  //    and the pipeline advances (a new review arrives or the turn settles).
  const bodyBefore = await page.locator('.dr-modal-body').innerText()
  await page.getByRole('button', { name: l.submitAll }).click()
  await bar2.waitFor({ state: 'detached', timeout: 90_000 })
  check(true, 'S1: comments submitted and review settled')
  const keysAfter = await page.evaluate(() =>
    Object.keys(localStorage).filter(k => k.startsWith('dsh-doc-review:v1:comments:')))
  check(keysAfter.length === 0, 'S1: persisted comments cleared on submit')
  console.log('S1: feedback submitted — waiting for the pipeline to advance')

  // The pipeline consumed the feedback: either a revised review appears (the
  // document changed — evidence the feedback landed) or the stage advances.
  // The end-to-end completion criterion is the requested artifact itself
  // (hello.txt): the composer can be enabled while a stage subagent is still
  // working, so the loop polls for the file and confirms any review it meets.
  const deadline = Date.now() + 18 * 60_000
  let feedbackSeen = false
  let settled = false
  while (Date.now() < deadline && !settled) {
    if (await page.locator('[data-doc-review-key]').count() > 0) {
      const modalN = page.locator('[role="dialog"]').first()
      await modalN.waitFor({ timeout: 30_000 })
      const bodyAfter = await modalN.locator('.dr-modal-body').innerText()
      if (!feedbackSeen && bodyAfter.trim() !== bodyBefore.trim()) {
        feedbackSeen = true
        check(true, 'S1: follow-up review carries a revised document')
      }
      const opts = modalN.locator('.dr-options button')
      if (await opts.count() > 0) {
        await opts.first().click()
      } else {
        await modalN.locator('.dr-custom-input').fill('确认')
        await modalN.getByRole('button', { name: l.submit }).click()
      }
      await page.locator('[data-doc-review-key]').first().waitFor({ state: 'detached', timeout: 60_000 })
      continue
    }
    if (existsSync(HELLO)) { settled = true; break }
    await sleep(5_000)
  }
  check(settled, 'S1: pipeline completed the task after the comment feedback')
  out.feedbackSeen = feedbackSeen
  out.helloCreated = existsSync(HELLO)
  return out
}

// ============================================================================
// Scenario 2 — standard plan-mode: comments block approval until cleared
// ============================================================================
async function scenario2() {
  console.log('S2: starting plan-mode scenario')
  const out = {}
  // Fresh tab, switch the preset chip to standard.
  await openNewSession()
  const chip = page.locator('button', { hasText: l.adaptive }).first()
  if (await chip.count() > 0) {
    await chip.click()
    const menu = page.getByRole('menu')
    await menu.waitFor({ timeout: 10_000 })
    await menu.getByRole('menuitem', { name: l.standard }).click()
    await sleep(1_500)
  }
  const textarea = page.locator('textarea:enabled').first()
  await textarea.waitFor({ timeout: 30_000 })
  await textarea.fill(`/plan ${PLAN_TASK}`)
  await textarea.press('Enter')

  const bar = page.locator('[data-doc-review-key]').first()
  await bar.waitFor({ timeout: 5 * 60_000 })
  const modal = page.locator('[role="dialog"]').first()
  await modal.waitFor({ timeout: 15_000 })
  out.title = await modal.getAttribute('aria-label')

  // The plan review surfaces the Approve path.
  const approve = modal.getByRole('button', { name: l.approve })
  await approve.waitFor({ timeout: 10_000 })
  check(true, 'S2: plan review claimed with Approve')

  // A comment blocks the approval surface entirely.
  const row = modal.locator('[data-line]').first()
  await row.locator('.dr-line-gutter-num').click()
  await row.locator('.dr-comment-editor-input').fill('计划里补充验收标准')
  await modal.getByRole('button', { name: l.publish }).click()
  await row.getByText('计划里补充验收标准').waitFor({ timeout: 10_000 })
  check(await modal.getByRole('button', { name: l.approve }).count() === 0, 'S2: Approve blocked while a comment exists')
  check(await modal.getByRole('button', { name: l.submitAll }).count() > 0, 'S2: comment footer shown on plan review')

  // Clearing the comments (取消 → 确定) restores the decision surface.
  await modal.getByRole('button', { name: l.cancelAll }).click()
  const confirmDialog = page.getByRole('dialog', { name: l.confirmTitle })
  await confirmDialog.waitFor({ timeout: 10_000 })
  await confirmDialog.getByRole('button', { name: l.confirmOk }).click()
  await sleep(300)
  check(await modal.getByRole('button', { name: l.approve }).count() > 0, 'S2: Approve restored after clearing comments')

  // Approving through the modal completes the turn: the agent replies DONE.
  await approve.click()
  await page.getByText('DONE', { exact: true }).waitFor({ timeout: 5 * 60_000 })
  check(true, 'S2: approved through the modal, DONE observed')
  out.done = true
  return out
}

// ============================================================================
// Run
// ============================================================================
try {
  console.log('S1: starting adaptive-pipeline scenario')
  await openNewSession()
  const s1 = await scenario1()
  results.push({ scenario: 'adaptive-comments', ...s1 })
  const s2 = await scenario2()
  results.push({ scenario: 'plan-comments', ...s2 })
} catch (err) {
  failures.push(`uncaught: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
} finally {
  console.log(JSON.stringify({ results, failures, errors }, null, 2))
  await browser.close()
}
process.exitCode = failures.length > 0 ? 1 : 0
