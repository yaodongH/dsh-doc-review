// Smoke check: dsh-doc-review must boot inside the live web app — the client
// bundle loads, apply() runs (stylesheet injected, chain entry registered),
// and no console errors/warnings come from the plugin.
import { chromium } from '/home/huangyaodong/deepseek-harness-workspace/deepseek-harness/apps/web/node_modules/playwright/index.mjs'

const BASE = 'http://127.0.0.1:3080/'
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
const warnings = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
  if (msg.type() === 'warning') warnings.push(msg.text())
})
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
await page.waitForTimeout(3_000)

const styleInjected = await page.evaluate(() =>
  document.querySelector('style[data-dsh-doc-review]') !== null)
const pluginCss = await page.evaluate(() => {
  const tag = document.querySelector('style[data-dsh-doc-review]')
  return tag === null ? 0 : tag.textContent.length
})
const moduleLoaded = await page.evaluate(() => {
  const scripts = [...document.querySelectorAll('script')].map(s => s.src)
  return scripts.some(src => src.includes('dsh-doc-review'))
})

console.log(JSON.stringify({ styleInjected, pluginCss, moduleLoaded, errors, warnings }, null, 2))
await browser.close()
