// Screenshot the rebuilt Understanding app (Ideas "Active" plan) on live :5099.
// Build-less local app served from the repo working tree, so no deploy needed.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5099', PW = 'Kurackurac123!'
const SELF = 'e8e87ab70f9448fa89d78c6c91fd92fc'
const APP = `${BASE}/api/localview/${SELF}/app/understanding/`
const OUT = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview'

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
if (!token) { console.log('FATAL login', login.status); process.exit(1) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1040, height: 1000 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
const page = await ctx.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))

await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForSelector('.hero h1', { timeout: 10000 })
const title = await page.locator('.hero h1').innerText()
const tabCount = await page.locator('#tabs button').count()
await page.screenshot({ path: `${OUT}/out-understanding-ideas-change.png`, fullPage: true })

// Flow view + exercise the interactive Active toggle.
await page.locator('#tabs button', { hasText: 'How it flows' }).click()
await page.waitForTimeout(300)
await page.locator('#demo-backlog .mini').first().click() // activate one
await page.waitForTimeout(300)
const activeCount = await page.locator('#demo-active .demo__idea').count()
await page.screenshot({ path: `${OUT}/out-understanding-ideas-flow.png`, fullPage: true })

// Architecture view.
await page.locator('#tabs button', { hasText: 'Where it lives' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/out-understanding-ideas-arch.png`, fullPage: true })

await browser.close()
await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: `claudeweb_session=${token}` } }).catch(() => {})
console.log(JSON.stringify({ title, tabCount, activeAfterToggle: activeCount, consoleErrors: errs }, null, 2))
