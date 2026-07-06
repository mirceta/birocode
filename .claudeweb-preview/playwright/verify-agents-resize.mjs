// openspec dock-resizable-agents-panel — browser-verify the free-mode
// right-edge width grip on the agents panel. Isolated harness (own
// CLAUDEWEB_DATADIR, default :5216), seeded 6-dock roster. Asserts: grip
// present in free mode; dragging it left narrows .dash__main and an explicit
// 2-per-row grid keeps 2 (narrower) columns; width persists to
// claudeweb_dash_agents_w and survives a reload; double-click clears back to
// full width; the ↺ reset-layout button clears a saved width too; grid mode
// renders no grip and ignores the saved width. Net-zero: dock tabs live in
// the iso datadir only.
import { chromium } from 'playwright'

const BASE = process.env.TEST_BASE || 'http://localhost:5216'
const PW = process.env.TEST_PW || 'changeme' // fresh iso datadir seeds the default
const OUT = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-agents-resize.png'
const KEY = 'claudeweb_dash_agents_w'

const r = {}
let pass = true
const expect = (k, got, ok) => { r[k] = `${ok ? 'PASS' : 'FAIL'} (${got})`; if (!ok) pass = false }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: PW } })
await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'))

const TABS = Array.from({ length: 6 }, (_, i) => `AGRESIZE-${String(i + 1).padStart(2, '0')}`)
const mkTab = (id) => ctx.request.post(`${BASE}/api/dock`, { data: { id, repoId: id, repoName: `Agents resize roster ${id}`, status: 'idle', createdAt: 0 } })

async function openDash(page) {
  await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle', timeout: 20000 })
  const btn = page.locator('.app-header__title--btn')
  await btn.waitFor({ timeout: 10000 })
  await btn.click()
  await page.locator('.dash__header').waitFor({ timeout: 10000 })
  await page.locator('.dash__grid > *').first().waitFor({ timeout: 10000 })
}

const mainW = (page) => page.locator('.dash__main').evaluate((el) => el.getBoundingClientRect().width)
const gridCols = (page) => page.locator('.dash__grid').evaluate((el) =>
  getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat))
const savedW = (page) => page.evaluate((k) => localStorage.getItem(k), KEY)

// Drag the right-edge grip horizontally by dx using raw mouse events (React
// pointer handlers + pointer capture pick these up fine in headless chromium).
async function dragGrip(page, dx) {
  const box = await page.locator('.dash__main-resize').boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + Math.min(box.height / 2, 200)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y, { steps: 5 })
  await page.mouse.move(x + dx, y, { steps: 5 })
  await page.mouse.up()
}

try {
  for (const id of TABS) await mkTab(id)
  const page = await ctx.newPage()
  await openDash(page)

  // 1) Free mode (desktop default) renders the right-edge grip.
  expect('grip.presentInFree', await page.locator('.dash__main-resize').count(),
    (await page.locator('.dash__main-resize').count()) === 1)

  // 2) Pin cards to 2 per row so re-wrap is assertable, then drag 400px left.
  await page.locator('.dash__layout-btn').click()
  await page.locator('.dash__layout-seg-btn', { hasText: /^2$/ }).click()
  await page.keyboard.press('Escape')
  const w0 = await mainW(page)
  await dragGrip(page, -400)
  const w1 = await mainW(page)
  expect('drag.narrows', `w ${w0.toFixed(0)}→${w1.toFixed(0)}`, Math.abs(w1 - (w0 - 400)) < 8)
  expect('drag.persistsKey', await savedW(page), Math.abs(parseInt(await savedW(page), 10) - w1) < 8)
  const cols = await gridCols(page)
  expect('drag.gridRewraps2Cols', `cols=[${cols.map((c) => c.toFixed(0))}]`,
    cols.length === 2 && cols[0] < (w0 - 8) / 2 && Math.abs(cols[0] + cols[1] + 8 - w1) < 10)
  await page.screenshot({ path: OUT, fullPage: false })

  // 3) Reload: the saved width still applies in free mode.
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.app-header__title--btn').click()
  await page.locator('.dash__grid > *').first().waitFor({ timeout: 10000 })
  const wReload = await mainW(page)
  expect('reload.widthKept', `w=${wReload.toFixed(0)}`, Math.abs(wReload - w1) < 8)

  // 4) Double-click the grip: cleared key, back to full width.
  await page.locator('.dash__main-resize').dblclick()
  expect('dblclick.clearsKey', String(await savedW(page)), (await savedW(page)) === null)
  const wCleared = await mainW(page)
  expect('dblclick.fullWidth', `w=${wCleared.toFixed(0)}`, Math.abs(wCleared - w0) < 8)

  // 5) ↺ reset layout clears a saved width too (button shows for width-only).
  await dragGrip(page, -300)
  expect('reset.btnShows', await page.locator('.dash__layout-ctl .dash__swap', { hasText: '↺' }).count(),
    (await page.locator('.dash__layout-ctl .dash__swap', { hasText: '↺' }).count()) === 1)
  await page.locator('.dash__layout-ctl .dash__swap', { hasText: '↺' }).click()
  expect('reset.clearsKey', String(await savedW(page)), (await savedW(page)) === null)

  // 6) Grid mode: no grip, saved width ignored (panel back in the flex flow).
  await dragGrip(page, -300)
  const wSaved = parseInt(await savedW(page), 10)
  await page.locator('.dash__swap', { hasText: '⤢' }).click() // free → grid (button shows the TARGETless free glyph while free)
  expect('grid.noGrip', await page.locator('.dash__main-resize').count(),
    (await page.locator('.dash__main-resize').count()) === 0)
  const wGrid = await mainW(page)
  expect('grid.widthIgnored', `saved=${wSaved} grid w=${wGrid.toFixed(0)}`, wGrid > wSaved + 100)

  await page.close()
} catch (e) {
  r.error = String(e)
  pass = false
} finally {
  await browser.close()
}

console.log(JSON.stringify(r, null, 2))
console.log('shot:', OUT)
console.log(pass ? 'ALL PASS' : 'SOME FAILED')
process.exit(pass ? 0 : 1)
