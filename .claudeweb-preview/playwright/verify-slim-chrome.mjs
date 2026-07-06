// openspec dashboard-slim-chrome — browser-verify the slimmed dashboard chrome.
// Isolated :5214 harness (own datadir), seeded 12-dock roster.
// Desktop: no "Dashboard" heading; docks bar + all controls share ONE row
// (overlapping y-ranges); the toolbar horizontally scrolls the large roster;
// aria labels survive; size/zoom/view/only-important/close still function.
// Phone: controls wrap BELOW the docks bar and stay usable; logs the first
// grid tile's top edge (compared against the pre-change build by the runner).
// Net-zero: its dock tabs live in the iso datadir only.
import { chromium } from 'playwright'

const BASE = process.env.TEST_BASE || 'http://localhost:5214'
const PW = process.env.TEST_PW || 'changeme' // fresh iso datadir seeds the default
const OUT_DESK = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-slim-chrome-desktop.png'
const OUT_PHONE = 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-slim-chrome-phone.png'
const MEASURE_ONLY = process.env.MEASURE_ONLY === '1' // pre-change baseline run: just log phone tile y

const r = {}
let pass = true
const expect = (k, got, ok) => { r[k] = `${ok ? 'PASS' : 'FAIL'} (${got})`; if (!ok) pass = false }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: PW } })
await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'))

const TABS = Array.from({ length: 12 }, (_, i) => `SLIMCHROME-${String(i + 1).padStart(2, '0')}`)
const mkTab = (id) => ctx.request.post(`${BASE}/api/dock`, { data: { id, repoId: id, repoName: `Slim chrome roster ${id}`, status: 'idle', createdAt: 0 } })

async function openDash(page) {
  await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle', timeout: 20000 })
  const btn = page.locator('.app-header__title--btn')
  await btn.waitFor({ timeout: 10000 })
  await btn.click()
  await page.locator('.dash__header').waitFor({ timeout: 10000 })
  await page.locator('.dash__grid > *').first().waitFor({ timeout: 10000 })
}

const box = (loc) => loc.boundingBox()
const sameRow = (a, b) => a && b && a.y < b.y + b.height && b.y < a.y + a.height // y-ranges overlap

try {
  for (const id of TABS) await mkTab(id)

  if (!MEASURE_ONLY) {
    // ---------- Desktop (1280x1000) ----------
    const page = await ctx.newPage()
    await openDash(page)

    // 1) No title label; header + toolbar still there; aria labels survive.
    expect('desk.noTitleNode', await page.locator('.dash__title').count(), (await page.locator('.dash__title').count()) === 0)
    expect('desk.noHeadingText', await page.locator('.dash__header h2').count(), (await page.locator('.dash__header h2').count()) === 0)
    expect('desk.toolbarPresent', await page.locator('.dash__docktoolbar').count(), (await page.locator('.dash__docktoolbar').count()) === 1)
    const viewsLabel = await page.locator('.dash__views').getAttribute('aria-label')
    const sizeLabel = await page.locator('.dash__size').getAttribute('aria-label')
    expect('desk.ariaLabelsSurvive', `views="${viewsLabel}" size="${sizeLabel}"`, !!viewsLabel && !!sizeLabel)

    // 2) One shared bar: toolbar + every control group overlap in y.
    const tb = await box(page.locator('.dash__docktoolbar'))
    for (const sel of ['.dash__size', '.dash__zoom', '.dash__layout-ctl', '.dash__views', '.dash__only-important', '.dash__close']) {
      const b = await box(page.locator(sel))
      expect(`desk.oneRow ${sel}`, `toolbar y=${tb?.y?.toFixed(0)} ctl y=${b?.y?.toFixed(0)}`, sameRow(tb, b))
    }

    // 3) Large roster scrolls inside the bar instead of wrapping.
    const scroll = await page.locator('.dash__docktoolbar').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
    expect('desk.toolbarScrolls', `scrollWidth=${scroll.sw} clientWidth=${scroll.cw}`, scroll.sw > scroll.cw)
    // all 12 roster tabs exist in the toolbar even if scrolled out of view
    expect('desk.rosterComplete', await page.locator('.dash__docktab').count(), (await page.locator('.dash__docktab').count()) === TABS.length)

    // 4) Controls keep working from the shared bar.
    await page.locator('.dash__view', { hasText: /phone/i }).click()
    expect('desk.viewSwitch', await page.locator('.dash__grid--phones').count(), (await page.locator('.dash__grid--phones').count()) === 1)
    await page.locator('.dash__view').first().click() // back to cards
    const onlyImp = page.locator('.dash__only-important')
    const before = await onlyImp.getAttribute('aria-checked')
    await onlyImp.click()
    const after = await onlyImp.getAttribute('aria-checked')
    expect('desk.onlyImportantToggles', `${before} -> ${after}`, before !== after)
    await onlyImp.click() // restore
    const zoomBtn = page.locator('.dash__zoom-btn').first() // A- : must stay enabled+clickable
    await zoomBtn.click()
    const sizeMinus = page.locator('.dash__size-btn').first()
    await sizeMinus.click()
    expect('desk.zoomSizeClickable', 'clicked A- and size-', true)
    await page.screenshot({ path: OUT_DESK, fullPage: false })
    // close button dismisses the overlay
    await page.locator('.dash__close').click()
    await page.waitForTimeout(300)
    expect('desk.closeWorks', await page.locator('.dash__header').count(), (await page.locator('.dash__header').count()) === 0)
    await page.close()
  }

  // ---------- Phone (390x844) ----------
  const phone = await ctx.newPage()
  await phone.setViewportSize({ width: 390, height: 844 })
  await openDash(phone)
  const tileY = (await box(phone.locator('.dash__grid > *').first()))?.y
  r['phone.firstTileY'] = `${tileY?.toFixed(1)}`
  console.log(`PHONE_TILE_Y=${tileY?.toFixed(1)}`)

  if (!MEASURE_ONLY) {
    const tbP = await box(phone.locator('.dash__docktoolbar'))
    const viewsP = await box(phone.locator('.dash__views'))
    expect('phone.controlsWrapBelow', `toolbar y=${tbP?.y?.toFixed(0)}+${tbP?.height?.toFixed(0)} views y=${viewsP?.y?.toFixed(0)}`,
      !!tbP && !!viewsP && viewsP.y >= tbP.y + tbP.height - 2)
    // controls remain usable after the wrap
    const onlyImpP = phone.locator('.dash__only-important')
    const b1 = await onlyImpP.getAttribute('aria-checked')
    await onlyImpP.click()
    expect('phone.controlsUsable', `${b1} -> ${await onlyImpP.getAttribute('aria-checked')}`, b1 !== (await onlyImpP.getAttribute('aria-checked')))
    await onlyImpP.click()
    await phone.screenshot({ path: OUT_PHONE, fullPage: false })
  }
  await phone.close()
} catch (e) {
  r.error = String(e)
  pass = false
} finally {
  await browser.close()
}

console.log(JSON.stringify(r, null, 2))
if (!MEASURE_ONLY) console.log('shots:', OUT_DESK, OUT_PHONE)
console.log(pass ? 'ALL PASS' : 'SOME FAILED')
process.exit(pass ? 0 : 1)
