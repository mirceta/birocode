// Browser-verify the Ideas "Active" section on the isolated :5210 instance.
// Shares %APPDATA% notes.json with live, so we use a uniquely tagged throwaway
// idea and DELETE it in finally (net-zero on the real list).
import { chromium } from 'playwright'

const BASE = 'http://localhost:5210', PW = 'Kurackurac123!'
const OUT = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-ideas-active.png'
const TAG = 'VERIFY-ACTIVE-DELETEME-' + Date.now()

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
if (!token) { console.log('FATAL login', login.status); process.exit(1) }
const cookie = `claudeweb_session=${token}`
const api = (p, opt = {}) => fetch(`${BASE}${p}`, { ...opt, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opt.headers || {}) } })

let createdId = null
const results = {}
try {
  // Seed a throwaway idea (starts in backlog).
  const created = await (await api('/api/notes', { method: 'POST', body: JSON.stringify({ text: TAG, priority: 0, active: false }) })).json()
  createdId = created.id
  results.seededActive = created.active // expect false

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } })
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
  await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'))
  const page = await ctx.newPage()
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))

  await page.goto(`${BASE}/studio/ideas`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  const testCard = () => page.locator('.idea', { hasText: TAG })
  await testCard().waitFor({ timeout: 10000 })

  // Initially: our card is NOT inside an Active group.
  results.inActiveBefore = await page.locator('.ideas__group--active .idea', { hasText: TAG }).count()

  // ACTIVATE via the card toggle.
  await testCard().locator('.idea__active-btn').click()
  await page.locator('.ideas__group--active .idea', { hasText: TAG }).waitFor({ timeout: 8000 })
  results.inActiveAfterToggle = await page.locator('.ideas__group--active .idea', { hasText: TAG }).count()
  results.backlogHeaderShown = await page.locator('.ideas__group-head', { hasText: 'Backlog' }).count()

  // Persisted on the backend?
  await page.waitForTimeout(400)
  const afterToggle = await (await api(`/api/notes`)).json()
  results.apiActiveAfterToggle = afterToggle.find((n) => n.id === createdId)?.active

  // Persists across a reload?
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.ideas__group--active .idea', { hasText: TAG }).waitFor({ timeout: 8000 })
  results.inActiveAfterReload = await page.locator('.ideas__group--active .idea', { hasText: TAG }).count()

  await page.screenshot({ path: OUT, fullPage: true })

  // Filter narrows both groups (type the tag → only our idea remains).
  await page.locator('.ideas__filter').fill(TAG)
  await page.waitForTimeout(300)
  results.visibleWhenFiltered = await page.locator('.idea').count()

  // DEACTIVATE → back to backlog (clear filter first so the card is present).
  await page.locator('.ideas__filter').fill('')
  await page.waitForTimeout(200)
  await testCard().locator('.idea__active-btn').click()
  await page.waitForTimeout(500)
  results.inActiveAfterOff = await page.locator('.ideas__group--active .idea', { hasText: TAG }).count()
  const afterOff = await (await api(`/api/notes`)).json()
  results.apiActiveAfterOff = afterOff.find((n) => n.id === createdId)?.active

  results.consoleErrors = errs
  await browser.close()
  console.log(JSON.stringify(results, null, 2))
  console.log('saved', OUT)
} finally {
  if (createdId) await api(`/api/notes/${createdId}`, { method: 'DELETE' }).catch(() => {})
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
  console.log('cleaned up test idea', createdId)
}
