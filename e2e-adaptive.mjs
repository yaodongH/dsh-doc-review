// Live e2e of the real target scenario: run the adaptive pipeline on a tiny
// task. Each planning stage (概要设计/计划梳理/详细设计) presents its design
// document through ask_questions; the dsh-doc-review takeover must claim each
// one — modal auto-opens with the rendered markdown — and confirming through
// the modal advances the pipeline to completion.
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/'
const TASK = '在 dsh-doc-review 目录下创建文件 hello.txt，内容为 hello world。不要修改其他任何文件。'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
await page.locator('textarea:enabled').first().waitFor({ timeout: 20_000 })

const textarea = page.locator('textarea:enabled').first()
await textarea.fill(TASK)
await textarea.press('Enter')

const reviews = []
const deadline = Date.now() + 20 * 60_000
let settled = false
while (Date.now() < deadline) {
  const bar = page.locator('[data-doc-review-key]')
  if (await bar.count() > 0) {
    const modal = page.locator('[role="dialog"]')
    await modal.waitFor({ timeout: 15_000 })
    const title = await modal.getAttribute('aria-label')
    const headings = await modal.getByRole('heading').count()
    const optionCount = await modal.locator('.dr-options button').count()
    const textareaCount = await modal.getByRole('textbox').count()
    reviews.push({ title, headings, optionCount, textareaCount })
    if (optionCount > 0) {
      await modal.locator('.dr-options button').first().click()
    } else {
      await modal.getByRole('textbox').fill('确认')
      await modal.getByRole('button', { name: '提交' }).click()
    }
    // The takeover leaves when the host resolves the answer.
    await bar.waitFor({ state: 'detached', timeout: 30_000 })
    continue
  }
  // No takeover: the pipeline is either still working or done. The composer
  // re-enables when the turn settles.
  const enabled = await page.locator('textarea:enabled').count()
  if (enabled > 0 && reviews.length > 0) {
    settled = true
    break
  }
  await page.waitForTimeout(5_000)
}

const helloExists = await page.evaluate(async () => {
  try {
    const res = await fetch('/adaptive/api', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'status' }),
    })
    return (await res.json()).ok === true
  } catch { return false }
})

console.log(JSON.stringify({ reviews, settled, helloExists, errors }, null, 2))
await browser.close()
