// Board task d1ce7236 (openspec local-app-liveness-hysteresis), isolated instance: the
// Local tab shows the self repo's Understanding app. Its liveness probes are made SLOW
// (5 s, longer than the old 3 s abort) and then, once the app is up, two of them are
// answered with the harness's own "unreachable" 502 — the app must stay rendered through
// both; only a sustained run of harness-down verdicts (> 10 s) may hide it. On the old
// code the first slow probe already flipped the frame to "Nothing is running yet".
import { chromium } from 'playwright'

const PORT = process.env.PORT || '5223'
const BASE = `http://127.0.0.1:${PORT}`, PW = process.env.PW || 'iso-flap-4474'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }
const checks = {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const repos = await fetch(`${BASE}/api/repos`, { headers: H }).then((r) => r.json())
const self = repos.find((r) => r.isSelf)
const appUrl = `/api/localview/${self.id}/app/understanding/`
// The harness's own verdicts carry the header (backend half of the change).
const dead = await fetch(`${BASE}/api/localview/${self.id}/app/no-such-app/`, { headers: H })
checks['proxy: 404 for an unknown app carries X-ClaudeWeb-Localview: no-app'] = dead.status === 404 && dead.headers.get('x-claudeweb-localview') === 'no-app'
const deadPortRepo = repos.find((r) => (r.localApps || []).some((a) => a.kind === 'repo' && a.port === 5305))
if (deadPortRepo) {
  const r502 = await fetch(`${BASE}/api/localview/${deadPortRepo.id}/app/${deadPortRepo.localApps.find((a) => a.port === 5305).id}/`, { headers: H })
  checks['proxy: 502 for a dead port carries X-ClaudeWeb-Localview: unreachable'] = r502.status === 502 && r502.headers.get('x-claudeweb-localview') === 'unreachable'
}

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
await ctx.addInitScript((repoId) => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('claudeweb_repo', repoId) }, self.id)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// Route only the PROBE (a fetch), never the iframe's document request: slow every
// probe by 5 s; while `failNext` > 0 answer with the harness's own unreachable 502.
let probes = 0, failNext = 0, delayMs = 5000, lastPassAt = 0, downsSinceUp = 0
const log = []
await page.route(`**${appUrl}`, async (route) => {
  const req = route.request()
  if (req.resourceType() !== 'fetch') return route.continue()
  probes++
  const n = probes
  await sleep(delayMs)
  if (failNext > 0) {
    failNext--
    downsSinceUp++
    log.push(`probe #${n}: harness 502 unreachable (after ${delayMs} ms)`)
    return route.fulfill({ status: 502, headers: { 'x-claudeweb-localview': 'unreachable', 'content-type': 'application/json' }, body: '{"error":"The local app is not responding."}' })
  }
  lastPassAt = Date.now(); downsSinceUp = 0
  log.push(`probe #${n}: passed through (after ${delayMs} ms)`)
  return route.continue()
})
const t0 = Date.now()
const view = () => page.evaluate(() => { const root = document.querySelector('.localapp') || document; return { empty: root.querySelectorAll('.product-empty').length, slots: root.querySelectorAll('.product-frame__slot').length } })

await page.goto(`${BASE}/studio/local`, { waitUntil: 'domcontentloaded', timeout: 30000 })
// Pick the Understanding app explicitly (the first repo app may be dead on this box).
await page.locator('.localapp__app-pick').first().waitFor({ timeout: 30000 })
await page.locator('.localapp__app-pick', { hasText: 'Understanding' }).first().click()
await page.waitForFunction(() => /Understanding/.test(document.querySelector('.localapp__app--on')?.textContent || ''), null, { timeout: 10000 })

// 1. Old code: the first probe aborts at 3 s → empty forever. New: up after ~5 s.
await page.waitForFunction(() => (document.querySelector('.localapp') || document).querySelectorAll('.product-frame__slot').length === 1, null, { timeout: 20000 }).catch(() => {})
const t1 = Date.now() - t0
const v1 = await view()
console.log(`t+${t1} ms first render:`, JSON.stringify(v1), '| probes so far', probes)
checks['the app renders although every probe takes 5 s'] = v1.slots === 1 && v1.empty === 0

// 2. Two harness-down verdicts in a row: the app stays. (Fast probes from here on —
//    the slow-probe case is proven above; a pending probe blocks the next tick.)
delayMs = 300
failNext = 2
let flipped = false
const until = Date.now() + 30000
let target = null
while (Date.now() < until) {
  const v = await view(); if (v.empty > 0) { flipped = true; break }
  if (failNext === 0 && target === null) target = probes + 1   // one more (good) probe after the two downs
  if (target !== null && probes >= target) break
  await sleep(250)
}
console.log(`t+${Date.now() - t0} ms after two down verdicts: flipped=${flipped}; log: ${log.join(' | ')}`)
checks['two consecutive harness-down probes do not hide a live app'] = !flipped && failNext === 0

// 3. A sustained outage (every probe down) hides it — within ~25 s, not before ~10 s.
failNext = 99
const tOut = Date.now()
let hiddenAt = null
while (Date.now() - tOut < 40000) { const v = await view(); if (v.empty > 0) { hiddenAt = Date.now() - tOut; break } await sleep(250) }
console.log(`sustained outage: hidden after ${hiddenAt} ms; log tail: ${log.slice(-4).join(' | ')}`)
const sinceLastUp = hiddenAt === null ? null : Date.now() - lastPassAt
console.log(`  at hide: ${downsSinceUp} consecutive downs, ${sinceLastUp} ms since the last good probe`)
checks['a sustained harness-down outage does hide the app'] = hiddenAt !== null
checks['…but only after three consecutive misses spanning ten seconds since the last good probe'] = hiddenAt === null || (downsSinceUp >= 3 && sinceLastUp >= 10000)

// 4. Recovery: probes pass again → the app comes back on the next good sample.
failNext = 0; delayMs = 200
const tBack = Date.now()
let backAt = null
while (Date.now() - tBack < 20000) { const v = await view(); if (v.slots === 1 && v.empty === 0) { backAt = Date.now() - tBack; break } await sleep(250) }
console.log(`recovery: back after ${backAt} ms`)
checks['the app comes back on the next good probe'] = backAt !== null
checks['no page errors'] = errors.length === 0
await page.screenshot({ path: 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-local-app-flap-fixed.png' })

for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'ok ' : 'BAD'} ${k}`)
if (errors.length) console.log(errors.join('\n').slice(0, 500))
const pass = Object.values(checks).every(Boolean)
console.log(pass ? 'PASS' : 'FAIL')
await browser.close()
process.exit(pass ? 0 : 1)
