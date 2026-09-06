// Board task d1ce7236: reproduce the local-app flap on the LIVE harness (read-only:
// only LOCAL buttons are clicked; nothing is sent to any agent). Opens the studio
// dashboard, clicks the named local app on the first dock card that has it, then
// samples the view every 500 ms for WATCH_MS and logs every /api/localview request
// (status, duration, in-flight count at start, failures/aborts).
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:5099', PW = process.env.PW
const APP = process.env.APP || 'Understanding'
const WATCH_MS = Number(process.env.WATCH_MS || 20000)
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('claudeweb_dash_view', 'phones') })
const page = await ctx.newPage()
const t0 = Date.now()
const ms = () => String(Date.now() - t0).padStart(6, ' ')
let inFlight = 0
const started = new Map()
page.on('request', (r) => { inFlight++; started.set(r, { at: Date.now(), inFlight }) })
page.on('requestfinished', (r) => { inFlight--; const s = started.get(r); if (r.url().includes('/api/localview/')) console.log(`${ms()} ms  localview ${r.method()} ${r.url().replace(BASE, '')} -> ${r.response()?.status?.() ?? '?'} in ${Date.now() - (s?.at || 0)} ms (in-flight at start: ${s?.inFlight})`) })
page.on('requestfailed', (r) => { inFlight--; const s = started.get(r); if (r.url().includes('/api/localview/')) console.log(`${ms()} ms  localview ${r.method()} ${r.url().replace(BASE, '')} -> FAILED ${r.failure()?.errorText} after ${Date.now() - (s?.at || 0)} ms (in-flight at start: ${s?.inFlight})`) })
page.on('pageerror', (e) => console.log(`${ms()} ms  PAGE ERROR ${e.message}`))

await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 30000 })
// The dock wall is the Dashboard overlay behind the header title button (plans/dashboard-title-button.md).
await page.locator('.app-header__title--btn').waitFor({ timeout: 30000 })
await page.locator('.app-header__title--btn').click()
// The LOCAL buttons live on the full dock cards: the "Phones" view (the compact Cards view has none).
const btn = page.locator('.phone__apps .phone__app', { hasText: APP }).first()
await btn.waitFor({ timeout: 30000 })
const card = btn.locator('xpath=ancestor::*[contains(@class,"phone")][1]')
console.log(`${ms()} ms  clicking "${APP}" (in-flight now: ${inFlight})`)
await btn.click()
let last = ''
const end = Date.now() + WATCH_MS
while (Date.now() < end) {
  const state = await page.evaluate(() => {
    const empty = document.querySelectorAll('.product-empty').length
    const slots = document.querySelectorAll('.product-frame__slot').length
    const frames = Array.from(document.querySelectorAll('.laf-frame')).filter((f) => f.style.display !== 'none').length
    const iframes = document.querySelectorAll('iframe.product-frame').length
    return `empty=${empty} slots=${slots} visibleHostedFrames=${frames} iframes=${iframes}`
  })
  if (state !== last) { console.log(`${ms()} ms  VIEW ${state}`); last = state }
  await page.waitForTimeout(500)
}
await page.screenshot({ path: 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-local-app-flap.png' })
console.log(`${ms()} ms  done; in-flight at end: ${inFlight}`)
await browser.close()
