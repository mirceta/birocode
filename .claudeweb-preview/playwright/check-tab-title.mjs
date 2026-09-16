// Board task c97579f3: the browser tab title is the connected machine's LAN IP.
// Against an isolated instance: the shell served at "/", "/index.html" and an SPA route
// carries the IP in <title> and the metas BEFORE any login (first paint); /api/health
// exposes lanIp without auth; after login the title stays the IP across navigation
// (React never resets it to the greeting); assets and favicon still load.
import { chromium } from 'playwright'

const PORT = process.env.PORT || '5227'
const BASE = `http://127.0.0.1:${PORT}`, PW = process.env.PW || 'iso-title-4474'
const checks = {}
const ipRe = /^\d{1,3}(\.\d{1,3}){3}$/

const health = await fetch(`${BASE}/api/health`).then((r) => r.json())
console.log('health:', JSON.stringify(health))
checks['health (no auth) carries a LAN IPv4'] = ipRe.test(health.lanIp || '')
const ip = health.lanIp

for (const p of ['/', '/index.html', '/studio', '/studio/files']) {
  const r = await fetch(`${BASE}${p}`)
  const html = await r.text()
  const title = html.match(/<title>(.*?)<\/title>/)?.[1]
  checks[`shell at ${p}: <title> is the LAN IP (first paint, pre-login)`] = r.status === 200 && title === ip
  checks[`shell at ${p}: metas injected + no-store`] = html.includes(`<meta name="claudeweb-host" content="${ip}">`) && /no-store/.test(r.headers.get('cache-control') || '')
  checks[`shell at ${p}: greeting gone`] = !/Merhaba|Hello everyone/.test(html)
}
const asset = (await fetch(`${BASE}/`).then((r) => r.text())).match(/src="([^"]+\.js)"/)?.[1]
checks['hashed asset still served'] = !!asset && (await fetch(`${BASE}${asset}`)).status === 200

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 30000 })
checks['browser: title before login is the IP'] = (await page.title()) === ip
// log in through the API, then load the app as a logged-in user
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const cookie = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
await ctx.addCookies([{ name: 'claudeweb_session', value: cookie, url: BASE }])
await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(800)
checks['browser: title after login + React render is still the IP'] = (await page.title()) === ip
await page.goto(`${BASE}/studio/files`, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(800)
checks['browser: title after navigating to /studio/files stays the IP'] = (await page.title()) === ip
const greetingStillShown = await page.evaluate(() => /Hello everyone|Merhaba/.test(document.body.innerText))
checks['the greeting still exists in the page header (only the tab title changed)'] = greetingStillShown
checks['no page errors'] = errors.length === 0
console.log('final document.title =', await page.title())
await browser.close()

let pass = 0
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (v) pass++ }
console.log(`${pass}/${Object.keys(checks).length}`)
process.exit(pass === Object.keys(checks).length ? 0 : 1)
