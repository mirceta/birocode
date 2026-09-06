// Instrument window.fetch on the live studio: every localview probe (start, end, status,
// aborted?) and the page's long-lived connections, while the prg dock shows console-machine.
import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5099', PW = process.env.PW, APP = process.env.APP || 'console-machine'
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
await ctx.addInitScript(() => {
  localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('claudeweb_dash_view', 'phones')
  window.__probes = []; window.__t0 = Date.now()
  const orig = window.fetch
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url
    const rec = { url, start: Date.now() - window.__t0, signal: !!init?.signal }
    if (url && url.includes('/api/localview/')) window.__probes.push(rec)
    try { const r = await orig.apply(this, arguments); if (rec.start != null) { rec.end = Date.now() - window.__t0; rec.status = r.status } return r }
    catch (e) { rec.end = Date.now() - window.__t0; rec.error = e?.name || String(e); throw e }
  }
  window.__es = 0; const OES = window.EventSource; if (OES) { window.EventSource = function (...a) { window.__es++; return new OES(...a) }; window.EventSource.prototype = OES.prototype }
})
const page = await ctx.newPage()
await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.locator('.app-header__title--btn').click()
const btn = page.locator('.phone__apps .phone__app', { hasText: APP }).first()
await btn.waitFor({ timeout: 30000 })
await btn.click()
await page.waitForTimeout(21000)
const info = await page.evaluate(() => ({
  visibility: document.visibilityState,
  probes: window.__probes.filter((p) => /\/app\/[^/]+\/$/.test(p.url)),
  eventSources: window.__es,
  longLived: performance.getEntriesByType('resource').filter((e) => e.duration > 5000 || e.responseEnd === 0).map((e) => `${e.name.replace(location.origin, '')} ${Math.round(e.duration)}ms`).slice(0, 12),
  empty: document.querySelectorAll('.product-empty').length, slots: document.querySelectorAll('.product-frame__slot').length,
}))
console.log(JSON.stringify(info, null, 1))
await browser.close()
