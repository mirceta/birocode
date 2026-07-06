// openspec dock-layout-controls — browser-verify the dock layout controls.
// Isolated :5215 harness (own CLAUDEWEB_DATADIR), seeded 12-dock roster.
// Asserts: zero top chrome (.app-content--dash / .dash padding-top 0, old
// size/zoom groups gone); the ▤ Layout popover opens, closes on Esc and
// outside click; explicit "2 per row" renders 2 equal full-width columns;
// explicit height applies to every cell (fixed-h class + px height); Auto
// restores both; cards vs phones buckets are independent; zoom slider writes
// the persisted key and scales .phone__screen; settings survive a reload.
// Net-zero: its dock tabs live in the iso datadir only.
import { chromium } from 'playwright'

const BASE = process.env.TEST_BASE || 'http://localhost:5215'
const PW = process.env.TEST_PW || 'changeme' // fresh iso datadir seeds the default
const OUT = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-dock-layout.png'
const OUT_ROWS = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-dock-layout-2perrow.png'

const r = {}
let pass = true
const expect = (k, got, ok) => { r[k] = `${ok ? 'PASS' : 'FAIL'} (${got})`; if (!ok) pass = false }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: PW } })
await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'))

const TABS = Array.from({ length: 12 }, (_, i) => `DOCKLAYOUT-${String(i + 1).padStart(2, '0')}`)
const mkTab = (id) => ctx.request.post(`${BASE}/api/dock`, { data: { id, repoId: id, repoName: `Dock layout roster ${id}`, status: 'idle', createdAt: 0 } })

async function openDash(page) {
  await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle', timeout: 20000 })
  const btn = page.locator('.app-header__title--btn')
  await btn.waitFor({ timeout: 10000 })
  await btn.click()
  await page.locator('.dash__header').waitFor({ timeout: 10000 })
  await page.locator('.dash__grid > *').first().waitFor({ timeout: 10000 })
}

// input[type=range] through React: set via the native setter + input event.
const setSlider = (loc, v) => loc.evaluate((el, val) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(el, val)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}, String(v))

const gridCols = (page) => page.locator('.dash__grid').evaluate((el) =>
  getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat))

try {
  for (const id of TABS) await mkTab(id)
  const page = await ctx.newPage()
  await openDash(page)

  // 1) Zero top chrome + old control groups gone.
  const pads = await page.evaluate(() => ({
    content: getComputedStyle(document.querySelector('.app-content--dash')).paddingTop,
    dash: getComputedStyle(document.querySelector('.dash')).paddingTop,
  }))
  expect('topChrome.contentPad0', pads.content, pads.content === '0px')
  expect('topChrome.dashPad0', pads.dash, pads.dash === '0px')
  expect('oldControlsGone', 'size+zoom groups', (await page.locator('.dash__size, .dash__zoom').count()) === 0)

  // 2) Popover open / Esc / outside-click.
  const trigger = page.locator('.dash__layout-btn')
  expect('popover.triggerPresent', await trigger.count(), (await trigger.count()) === 1)
  await trigger.click()
  expect('popover.opens', await page.locator('.dash__layout-menu').count(), (await page.locator('.dash__layout-menu').count()) === 1)
  await page.keyboard.press('Escape')
  expect('popover.escCloses', await page.locator('.dash__layout-menu').count(), (await page.locator('.dash__layout-menu').count()) === 0)
  await trigger.click()
  // Outside click on the inert toolbar label (a dock card would navigate away).
  await page.locator('.dash__docktoolbar-label').click()
  expect('popover.outsideCloses', await page.locator('.dash__layout-menu').count(), (await page.locator('.dash__layout-menu').count()) === 0)

  // 3) Cards: 2 per row → exactly 2 equal columns filling the grid width.
  await trigger.click()
  await page.locator('.dash__layout-seg-btn', { hasText: /^2$/ }).click()
  const cols2 = await gridCols(page)
  const gw = await page.locator('.dash__grid').evaluate((el) => el.clientWidth)
  const fill = cols2.length === 2 && Math.abs(cols2[0] - cols2[1]) < 2 && Math.abs(cols2[0] + cols2[1] + 8 - gw) < 6
  expect('cards.twoPerRowFills', `cols=[${cols2.map((c) => c.toFixed(0))}] grid=${gw}`, fill)

  // 4) Explicit height on every cell.
  const hSlider = page.locator('.dash__layout-row').nth(1).locator('.dash__layout-slider')
  await setSlider(hSlider, 400)
  expect('height.fixedClass', await page.locator('.dash__grid--fixed-h').count(), (await page.locator('.dash__grid--fixed-h').count()) === 1)
  const heights = await page.locator('.dash__grid .dash-cell').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  expect('height.appliesToAll', `n=${heights.length} h≈${heights[0]?.toFixed(0)}`, heights.length > 0 && heights.every((h) => Math.abs(h - 400) < 3))
  await page.screenshot({ path: OUT_ROWS, fullPage: false })

  // 5) Auto restores both.
  await page.locator('.dash__layout-row').nth(1).locator('.dash__layout-seg-btn', { hasText: /auto/i }).click()
  expect('height.autoRestores', await page.locator('.dash__grid--fixed-h').count(), (await page.locator('.dash__grid--fixed-h').count()) === 0)
  await page.locator('.dash__layout-seg .dash__layout-seg-btn', { hasText: /auto/i }).click()
  const colsAuto = await gridCols(page)
  expect('cards.autoRestores', `cols=${colsAuto.length}`, colsAuto.length === 4) // ⌈√12⌉ = 4
  await page.locator('.dash__layout-seg-btn', { hasText: /^2$/ }).click() // leave cards at 2 for persistence + bucket checks

  // 6) Phones bucket independent: set 3 per row in phones, cards keeps 2.
  // (the view-tab click lands outside the popover and closes it — reopen)
  await page.locator('.dash__view', { hasText: /phone/i }).click()
  await page.locator('.dash__grid--phones').waitFor({ timeout: 10000 })
  await trigger.click()
  await page.locator('.dash__layout-seg-btn', { hasText: /^3$/ }).click()
  const colsPhones = await gridCols(page)
  expect('phones.threePerRow', `cols=${colsPhones.length}`, colsPhones.length === 3)

  // 7) Zoom slider scales phone content + persists its key.
  const zSlider = page.locator('.dash__layout-row').nth(2).locator('.dash__layout-slider')
  await setSlider(zSlider, 1.5)
  const zoomState = await page.evaluate(() => ({
    key: localStorage.getItem('claudeweb_dash_content_zoom'),
    screen: document.querySelector('.phone__screen')?.style.zoom,
  }))
  expect('zoom.keyAndScreen', JSON.stringify(zoomState), zoomState.key === '1.5' && zoomState.screen === '1.5')

  // 8) Back to cards: still 2 per row (buckets independent).
  await page.locator('.dash__view').first().click()
  const colsBack = await gridCols(page)
  expect('cards.bucketKept', `cols=${colsBack.length}`, colsBack.length === 2)
  await page.screenshot({ path: OUT, fullPage: false })

  // 9) Reload: settings persist (cards 2 per row; phones 3; zoom 1.5).
  await page.reload({ waitUntil: 'networkidle' })
  const btn = page.locator('.app-header__title--btn')
  await btn.click()
  await page.locator('.dash__grid > *').first().waitFor({ timeout: 10000 })
  const colsReload = await gridCols(page)
  const zoomReload = await page.evaluate(() => localStorage.getItem('claudeweb_dash_content_zoom'))
  const gridKey = await page.evaluate(() => localStorage.getItem('claudeweb_dash_grid'))
  expect('persist.afterReload', `cols=${colsReload.length} zoom=${zoomReload} grid=${gridKey}`,
    colsReload.length === 2 && zoomReload === '1.5' && JSON.parse(gridKey).phones.cols === 3)

  await page.close()
} catch (e) {
  r.error = String(e)
  pass = false
} finally {
  await browser.close()
}

console.log(JSON.stringify(r, null, 2))
console.log('shots:', OUT, OUT_ROWS)
console.log(pass ? 'ALL PASS' : 'SOME FAILED')
process.exit(pass ? 0 : 1)
