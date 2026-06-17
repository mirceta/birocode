// Editable Routine-prompts tab, browser-verified on the isolated :5210 preview.
// The recommender's label space is now the user's EDITABLE custom prompts; mined
// history shows as drafts you can adopt. prompts.json is SHARED with live :5099, so
// this test only ever adds/edits/deletes a uniquely-MARKED prompt and restores the
// library to exactly its starting set in finally (never touches the real 6).
import { chromium } from 'playwright'

const BASE = 'http://localhost:5210', PW = 'Kurackurac123!'
const MARK = '__verify_ap_prompt__'
const OUT = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-autopilot-prompts.png'

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
if (!token) { console.log('FATAL login', login.status); process.exit(1) }
const cookie = `claudeweb_session=${token}`
const H = { 'Content-Type': 'application/json', Cookie: cookie }

const getPrompts = async () => (await fetch(`${BASE}/api/prompts`, { headers: { Cookie: cookie } })).json()
const purgeMarked = async () => {
  for (const p of await getPrompts()) {
    if ((p.text || '').includes(MARK) || (p.label || '').includes(MARK))
      await fetch(`${BASE}/api/prompts/${p.id}`, { method: 'DELETE', headers: { Cookie: cookie } })
  }
}

try {
  await purgeMarked()
  const baseline = (await getPrompts()).length

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 } })
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
  await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced') })
  const page = await ctx.newPage()
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))

  await page.goto(`${BASE}/studio/autopilot`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.locator('.ap-tabs button', { hasText: 'Routine prompts' }).click()
  await page.waitForTimeout(6000) // discovery scan for the drafts section

  const libBefore = await page.locator('.rp-item').count()
  const hasAddForm = await page.locator('.rp-add').count()
  const draftRows = await page.locator('.autopilot__list .routine').count()
  const addButtons = await page.locator('.routine__add').count()

  // --- ADD via the UI form ---
  await page.locator('.rp-add__text').fill(`${MARK} keep it`)
  await page.locator('.rp-add__label').fill(`${MARK} label`)
  await page.locator('.rp-add__btn').click()
  await page.waitForTimeout(1500)
  const libAfterAdd = await page.locator('.rp-item').count()

  // --- EDIT via the UI (find the marked row, Edit -> change text -> Save) ---
  const marked = page.locator('.rp-item', { hasText: MARK }).first()
  await marked.locator('.rp-mini', { hasText: 'Edit' }).click()
  await page.waitForTimeout(400)
  await page.locator('.rp-edit__text').fill(`${MARK} edited deploy`)
  await page.locator('.rp-mini', { hasText: 'Save' }).click()
  await page.waitForTimeout(1500)
  const editedShows = await page.locator('.rp-item__text', { hasText: `${MARK} edited deploy` }).count()

  // Confirm the recommender picked it up (API label space now contains the edit).
  const labelSpace = (await (await fetch(`${BASE}/api/autopilot`, { headers: { Cookie: cookie } })).json()).routines
  const inLabelSpace = labelSpace.some((r) => (r.label || '').includes(`${MARK} edited deploy`))

  await page.screenshot({ path: OUT, fullPage: true })

  // --- DELETE via the UI ---
  const markedRow = page.locator('.rp-item', { hasText: MARK }).first()
  await markedRow.locator('.rp-mini--danger').click()
  await page.waitForTimeout(1500)
  const libAfterDelete = await page.locator('.rp-item').count()

  await browser.close()

  console.log(JSON.stringify({
    baseline, libBefore, hasAddForm, draftRows, addButtons,
    libAfterAdd, editedShows, inLabelSpace, libAfterDelete,
    pass: hasAddForm === 1 && libAfterAdd === libBefore + 1 && editedShows === 1
      && inLabelSpace && libAfterDelete === libBefore && draftRows > 0,
    consoleErrors: errs,
  }, null, 2))
  console.log('saved', OUT)
} finally {
  await purgeMarked() // restore library to its starting set, no matter what failed
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } }).catch(() => {})
  console.log('cleaned up (purged marked prompts, logged out)')
}
