// Smoke check: dsh-doc-review 0.2.0 must boot inside the live web app — the
// client row loads and materializes (apply() runs: stylesheet injected), and
// no console errors come from the page.
import { readFileSync } from 'node:fs'
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'

const LOG = '/home/huangyaodong/.dsh/dsh-web.log'
const BASE = `http://127.0.0.1:3080/?token=${/token=([A-Za-z0-9_-]+)/.exec(readFileSync(LOG, 'utf8'))?.[1] ?? ''}`
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForSelector('[class*="frame"]', { timeout: 30000 })
await page.waitForTimeout(4_000)

// The plugin's row arrives with the composed module combo; its factory runs
// at materialization, installing the surface stylesheet.
const styleInjected = await page.evaluate(() =>
  [...document.querySelectorAll('style')].some(style => style.hasAttribute('data-dsh-doc-review-styles')))
const pluginCss = await page.evaluate(() => {
  const tag = [...document.querySelectorAll('style')].find(style => style.hasAttribute('data-dsh-doc-review-styles'))
  return tag === undefined ? 0 : (tag.textContent ?? '').length
})

console.log(JSON.stringify({ styleInjected, pluginCss, errors }, null, 2))
if (!styleInjected || errors.length > 0) process.exit(1)
await browser.close()
