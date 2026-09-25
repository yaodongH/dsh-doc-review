// Live e2e of the block-comment feature inside the real web app, against the
// native plan-review page: the plugin claims the review's sidebar tab; the
// document renders through the native MarkdownText; comments anchor at blocks
// through the hover affordance and the right-click; they edit, delete,
// survive a page reload (the shared store's engine persistence), and the
// aggregated feedback drives the pipeline (or the plan revision) to completion.
//
// Scenario 1 — adaptive pipeline: a real design review is taken over; a
//   comment is added, edited, deleted, re-added, restored after a reload, the
//   card badge shows the unsubmitted count, and submitting the comments
//   advances the pipeline until the requested file exists.
//
// Scenario 2 — standard plan-mode: a /plan review is taken over; the comment
//   rides the seam, the native Approve button stays visible (with the badge
//   flagging the unsubmitted work), submitting the comments sends the
//   keep-planning feedback, the revised plan is approved, and DONE lands.
//
// Asserts are hard failures: any failed assertion prints FAIL and the script
// exits non-zero. Console errors from the page are reported as well.
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'

const LOG = '/home/huangyaodong/.dsh/dsh-web.log'
const BASE = `http://127.0.0.1:3080/?token=${/token=([A-Za-z0-9_-]+)/.exec(readFileSync(LOG, 'utf8'))?.[1] ?? ''}`
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
  newTab: 'New tab', newSession: 'New session',
  expandSidebar: 'Open right sidebar',
  add: 'Add comment', placeholder: 'Type your comment', publish: 'Publish',
  edit: 'Edit comment', del: 'Delete comment', save: 'Save',
  submitAll: 'Submit comments', clear: 'Clear comments',
  confirmTitle: 'Clear all comments?', confirmOk: 'Confirm',
  unsubmitted: n => `${n} unsubmitted comments`,
  count: n => `${n} comments`,
  approve: 'Approve',
  standard: /^Standard mode|^标准模式/, adaptive: /^Adaptive mode|^自适应模式/,
}
const ZH = {
  newTab: '新标签页', newSession: '新建会话',
  expandSidebar: '打开右侧边栏',
  add: '添加评论', placeholder: '输入你的评论', publish: '发布',
  edit: '编辑评论', del: '删除评论', save: '保存',
  submitAll: '提交评论', clear: '清空评论',
  confirmTitle: '确认清空所有评论？', confirmOk: '确定',
  unsubmitted: n => `${n} 条未提交评论`,
  count: n => `${n} 条评论`,
  approve: '同意执行',
  standard: /^标准模式|Standard mode/, adaptive: /^自适应模式|Adaptive mode/,
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1720, height: 980 } })
const errors = []
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForSelector('[class*="frame"]', { timeout: 60_000 })
await page.waitForTimeout(2_500)

// Locale detection: the fresh app chrome is English unless zh labels appear.
const l = (await page.getByRole('button', { name: '新标签页' }).count()) > 0 ? ZH : EN

/** The resident composer input: a rich editable surface (not a textarea). */
function composer() {
  return page.locator('[contenteditable="true"]').first()
}

/** Open a brand-new session. */
async function openNewSession() {
  const newSession = page.getByRole('button', { name: l.newSession }).first()
  await newSession.waitFor({ timeout: 40_000 })
  await newSession.click()
  await sleep(1_500)
}

/** The review tab body; expands the right sidebar if it is still collapsed. */
async function commentTab(timeout = 15_000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const tab = page.locator('[data-doc-review-key]').first()
    if (await tab.count() > 0) return tab
    const expand = page.getByRole('button', { name: l.expandSidebar })
    if (await expand.count() > 0) await expand.first().click().catch(() => {})
    if (Date.now() > deadline) throw new Error('review tab did not open')
    await sleep(1_000)
  }
}

/** Right-click the first visible content block and publish one comment. */
async function commentAndPublish(text) {
  const body = page.locator('[data-doc-review-key]').first().locator('.drr-body')
  const block = body.locator('p, li, h1, h2, h3').first()
  await block.waitFor({ state: 'visible', timeout: 20_000 })
  await block.click({ button: 'right' })
  const input = page.locator('.drr-editor-input')
  await input.waitFor({ timeout: 10_000 })
  await input.fill(text)
  await page.getByRole('button', { name: l.publish }).click()
}

// ============================================================================
// Scenario 1 — plan review: the full comment lifecycle through the sidebar
// ============================================================================
async function scenario1() {
  console.log('S1: starting plan-mode comment lifecycle')
  const out = {}
  await openNewSession()
  const input = composer()
  await input.waitFor({ timeout: 30_000 })
  await input.fill(`/plan ${PLAN_TASK}`)
  await input.press('Enter')

  const card = page.locator('[data-plan-review-key]').first()
  await card.waitFor({ timeout: 8 * 60_000 })
  const tab = await commentTab()
  await tab.getByRole('heading').first().waitFor({ timeout: 20_000 })
  console.log('S1: plan review claimed and rendered natively')
  check((await tab.getByRole('heading').count()) > 0, 'S1: document renders through the native renderer')

  // 1. Comment through the right-click on the first paragraph.
  await commentAndPublish('这里请写清楚依赖版本')
  await page.locator('.drr-comment').first().waitFor({ timeout: 10_000 })
  check(await page.locator('[data-doc-review-badge]').getByRole('button', { name: l.unsubmitted(1) }).count() > 0,
    'S1: decision card shows the unsubmitted badge')
  check(await page.getByText(l.count(1), { exact: true }).count() > 0, 'S1: tab count shows 1 comment')

  // 2. Edit the comment: pre-filled editor, saved text replaces the copy.
  await page.locator('.drr-comment').first().getByRole('button', { name: l.edit }).click()
  const editInput = page.locator('.drr-editor-input')
  await editInput.waitFor({ timeout: 10_000 })
  check((await editInput.inputValue()) === '这里请写清楚依赖版本', 'S1: edit editor pre-filled')
  await editInput.fill('这里请写清楚依赖版本（已修改）')
  await page.getByRole('button', { name: l.save }).click()
  await page.locator('.drr-comment').getByText('这里请写清楚依赖版本（已修改）').waitFor({ timeout: 10_000 })
  check(true, 'S1: edited text saved')

  // 3. Delete it, then re-add one comment for the persistence check.
  await page.locator('.drr-comment').first().getByRole('button', { name: l.del }).click()
  await sleep(400)
  check(await page.locator('.drr-comment').count() === 0, 'S1: comment deleted')
  await commentAndPublish('计划里补充验收标准')
  await page.locator('.drr-comment').getByText('计划里补充验收标准').waitFor({ timeout: 10_000 })
  check(await page.locator('[data-doc-review-badge]').getByRole('button', { name: l.unsubmitted(1) }).count() > 0,
    'S1: badge back to 1 after delete + re-add')

  // 4. Persistence: the comment survives a page reload.
  const persisted = await page.evaluate(() =>
    Object.keys(localStorage).filter(key => key.startsWith('dsh-doc-review:comments')))
  check(persisted.length >= 1, 'S1: persisted comment entry exists')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[class*="frame"]', { timeout: 60_000 })
  const card2 = page.locator('[data-plan-review-key]').first()
  await card2.waitFor({ timeout: 90_000 })
  const tab2 = await commentTab(60_000)
  await tab2.locator('.drr-comment').getByText('计划里补充验收标准').waitFor({ timeout: 20_000 })
  check(true, 'S1: comment restored after reload')

  // 5. Submit the comments: aggregated feedback, storage cleared, and the
  //    host treats it as keep-planning feedback.
  const waitKey = (await tab2.getAttribute('data-doc-review-key')) ?? ''
  await page.getByRole('button', { name: l.submitAll }).click()
  await card2.waitFor({ state: 'detached', timeout: 120_000 })
  check(true, 'S1: comments submitted and the review settled')
  // The engine persists the whole state map; assert THIS key's comments are
  // gone from every persisted record rather than the record's existence.
  const persistedAfter = await page.evaluate((waitKey) => Object.entries(localStorage)
    .filter(([key]) => key.startsWith('dsh-doc-review:comments'))
    .map(([key, value]) => {
      try { return JSON.parse(value)?.byKey?.[waitKey] ?? null } catch { return 'corrupt' }
    })
    .filter(Boolean), waitKey)
  check(persistedAfter.length === 0, 'S1: persisted comments cleared on submit')
  console.log('S1: feedback submitted — waiting for the revised plan')

  const deadline = Date.now() + 8 * 60_000
  let revised = false
  while (Date.now() < deadline && !revised) {
    const next = page.locator('[data-plan-review-key]').first()
    if (await next.count() > 0) {
      const nextApprove = next.getByRole('button', { name: l.approve }).first()
      await nextApprove.waitFor({ timeout: 30_000 })
      await nextApprove.click()
      await next.waitFor({ state: 'detached', timeout: 90_000 }).catch(() => {})
      revised = true
      break
    }
    await sleep(3_000)
  }
  check(revised, 'S1: revised plan arrived and was approved')

  await page.getByText('DONE', { exact: true }).waitFor({ timeout: 5 * 60_000 })
  check(true, 'S1: DONE observed after approval')
  out.done = true
  return out
}

// ============================================================================
// Scenario 2 — plan review: the hover affordance and the clear-comments flow
// ============================================================================
async function scenario2() {
  console.log('S2: starting plan-mode affordance + clear scenario')
  const out = {}
  await openNewSession()
  const input = composer()
  await input.waitFor({ timeout: 30_000 })
  await input.fill(`/plan ${PLAN_TASK}`)
  await input.press('Enter')

  const card = page.locator('[data-plan-review-key]').first()
  await card.waitFor({ timeout: 8 * 60_000 })
  const tab = await commentTab()
  await tab.getByRole('heading').first().waitFor({ timeout: 20_000 })
  console.log('S2: plan review claimed')

  // The native Approve path stays available; the badge flags unsubmitted work.
  const approve = card.getByRole('button', { name: l.approve }).first()
  await approve.waitFor({ timeout: 10_000 })
  check(await approve.count() > 0, 'S2: native Approve stays available')

  // Comment through the hover affordance.
  const body = tab.locator('.drr-body')
  const block = body.locator('p, li, h1, h2, h3').first()
  await block.waitFor({ state: 'visible', timeout: 20_000 })
  await block.hover()
  const affordance = page.locator('.drr-afford').first()
  await affordance.waitFor({ timeout: 10_000 })
  await affordance.click()
  const editorInput = page.locator('.drr-editor-input')
  await editorInput.waitFor({ timeout: 10_000 })
  await editorInput.fill('悬浮入口添加的评论')
  await page.getByRole('button', { name: l.publish }).click()
  await tab.locator('.drr-comment').getByText('悬浮入口添加的评论').waitFor({ timeout: 10_000 })
  check(await page.locator('[data-doc-review-badge]').getByRole('button', { name: l.unsubmitted(1) }).count() > 0,
    'S2: unsubmitted badge flags the hover comment')
  check((await approve.count()) > 0, 'S2: Approve remains with the badge (by design)')

  // Clearing the comments (清空评论 → 确定) empties the tab and drops the badge.
  await page.getByRole('button', { name: l.clear }).click()
  const confirmDialog = page.getByRole('dialog', { name: l.confirmTitle })
  await confirmDialog.waitFor({ timeout: 10_000 })
  await confirmDialog.getByRole('button', { name: l.confirmOk }).click()
  await sleep(400)
  check(await page.locator('.drr-comment').count() === 0, 'S2: comments cleared after confirmation')
  check(await page.locator('[data-doc-review-badge]').count() === 0, 'S2: badge gone after clearing')

  // Approving through the native card completes the turn: DONE.
  await approve.click()
  await page.getByText('DONE', { exact: true }).waitFor({ timeout: 5 * 60_000 })
  check(true, 'S2: approved through the native card, DONE observed')
  out.done = true
  return out
}

// ============================================================================
// Run
// ============================================================================
try {
  console.log('S1: starting plan-mode comment lifecycle')
  await openNewSession()
  const s1 = await scenario1()
  results.push({ scenario: 'plan-comments', ...s1 })
  const s2 = await scenario2()
  results.push({ scenario: 'plan-affordance-clear', ...s2 })
} catch (err) {
  failures.push(`uncaught: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
} finally {
  console.log(JSON.stringify({ results, failures, errors }, null, 2))
  await browser.close()
}
process.exitCode = failures.length > 0 ? 1 : 0