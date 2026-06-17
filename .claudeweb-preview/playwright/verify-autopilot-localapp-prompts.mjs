// Browser-verify the EDITABLE Routine-prompts subtab in the LIVE local app
// (autopilot-app/), served under /api/localview/{repo}/app/autopilot/.
//
// Must run against :5099 — the operator gate is host-only (WinForms), so only the
// live harness shows the #live panel; an isolated Kestrel instance would be gated
// off and the subtab would never render.
//
// Side effects on the SHARED prompts library are netted to zero: we add a uniquely
// tagged throwaway prompt, assert the round-trip, then DELETE it in finally.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5099', PW = 'Kurackurac123!'
const SELF = 'e8e87ab70f9448fa89d78c6c91fd92fc'
const APP = `${BASE}/api/localview/${SELF}/app/autopilot/`
const OUT = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-autopilot-localapp-prompts.png'
const TAG = 'VERIFY-DELETEME-' + Date.now()

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
if (!token) { console.log('FATAL login', login.status); process.exit(1) }
const cookie = `claudeweb_session=${token}`

let createdId = null
try {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 } })
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
  const page = await ctx.newPage()
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))

  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('#live:not([hidden])', { timeout: 15000 }) // gate must be ON

  // Open the Routine-prompts subtab (lazy-loads library + mined drafts).
  await page.locator('#subtabs button[data-sub="prompts"]').click()
  await page.waitForSelector('#rp-list .rp-item, #rp-list .empty', { timeout: 10000 })
  await page.waitForTimeout(2500) // let the discover scan populate drafts
  const startRows = await page.locator('#rp-list .rp-item').count()
  const draftRows = await page.locator('#rp-mined .routine').count()

  // ADD a throwaway prompt via the form.
  await page.locator('#rp-add-label').fill('verify')
  await page.locator('#rp-add-text').fill(TAG + ' this is a long prompt to confirm it wraps instead of rendering one character per line')
  await page.locator('#rp-add-btn').click()
  await page.waitForFunction((tag) => [...document.querySelectorAll('#rp-list .rp-item__text')].some((c) => c.textContent.includes(tag)), TAG, { timeout: 8000 })
  const afterAddRows = await page.locator('#rp-list .rp-item').count()

  // Find its id from the API so we can clean up even if the UI test fails later.
  const lib = await (await fetch(`${BASE}/api/prompts`, { headers: { Cookie: cookie } })).json()
  createdId = lib.find((p) => (p.text || '').includes(TAG))?.id

  // EDIT it: open the edit row, change the label, save. Once in edit mode the TAG
  // text moves into an <input value> (not text content), so hasText can't match the
  // row anymore — target the sole .rp-item--edit row instead.
  await page.locator('#rp-list .rp-item', { hasText: TAG }).locator('button', { hasText: 'Edit' }).click()
  const editRow = page.locator('#rp-list .rp-item--edit')
  await editRow.locator('.rp-edit__label').fill('verify-edited')
  await editRow.locator('button', { hasText: 'Save' }).click()
  await page.waitForFunction((tag) => {
    const it = [...document.querySelectorAll('#rp-list .rp-item')].find((el) => el.textContent.includes(tag))
    return it && it.querySelector('.rp-item__label')?.textContent === 'verify-edited'
  }, TAG, { timeout: 8000 })
  const editOk = true

  await page.screenshot({ path: OUT, fullPage: true })

  // DELETE it via the UI and confirm it's gone.
  await page.locator('#rp-list .rp-item', { hasText: TAG }).locator('button', { hasText: 'Delete' }).click()
  await page.waitForFunction((tag) => ![...document.querySelectorAll('#rp-list .rp-item__text')].some((c) => c.textContent.includes(tag)), TAG, { timeout: 8000 })
  const afterDelRows = await page.locator('#rp-list .rp-item').count()
  createdId = null // deleted through the UI; nothing to clean up

  await browser.close()
  console.log(JSON.stringify({ startRows, draftRows, afterAddRows, editOk, afterDelRows, consoleErrors: errs }, null, 2))
  console.log('saved', OUT)
} finally {
  if (createdId) {
    await fetch(`${BASE}/api/prompts/${createdId}`, { method: 'DELETE', headers: { Cookie: cookie } }).catch(() => {})
    console.log('cleaned up stray test prompt', createdId)
  }
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } }).catch(() => {})
}
