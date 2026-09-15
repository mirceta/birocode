// Renders the Understanding app for openspec human-delegation-watchers through the LIVE
// harness's localview proxy (the exact path the Local tab uses), clicks every section,
// plays the flow to the end, picks a decision and copies the summary. Fails on any
// page error or a missing asset (relative-URL contract).
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5099'
const PW = process.env.PW || fs.readFileSync(new URL('../.livepw', import.meta.url), 'utf8').replace(/\r?\n/g, '')
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const cookie = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
if (!cookie) { console.log('FATAL login', login.status); process.exit(1) }
const H = { Cookie: `claudeweb_session=${cookie}` }
const repos = await fetch(`${BASE}/api/repos`, { headers: H }).then((r) => r.json())
const self = (Array.isArray(repos) ? repos : repos.repos).find((r) => r.isSelf)
const url = `${BASE}/api/localview/${self.id}/app/understanding/`
const checks = {}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: cookie, url: BASE }])
const page = await ctx.newPage()
const errors = [], bad = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/app/understanding/')) bad.push(`${r.status()} ${r.url()}`) })
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
checks['index renders with the new title'] = /Human delegation \+ watchers/.test(await page.title())
checks['css + js loaded (no 4xx/5xx under the app path)'] = bad.length === 0
checks['tab strip has 5 sections'] = (await page.$$('nav [role=tab]')).length === 5
for (const t of ['flow', 'pieces', 'tab', 'decide', 'ideas']) { await page.click(`nav [data-tab="${t}"]`); await page.waitForTimeout(120); checks[`section "${t}" shows`] = await page.isVisible(`#${t}`) }
await page.click('nav [data-tab="flow"]')
for (let i = 0; i < 12; i++) await page.click('#next')
checks['flow steps to the end'] = (await page.textContent('#stepno')).trim() === 'step 9 / 9'
checks['flow lights actors'] = (await page.$$('.actor.lit')).length >= 1
await page.click('nav [data-tab="decide"]')
await page.check('input[name=where][value=both]')
await page.fill('#extra', 'test note')
await page.click('#copy')
const summary = await page.textContent('#summary')
checks['decisions summary reflects the pick + note'] = /-> both:/.test(summary) && /Notes: test note/.test(summary)
checks['no page errors'] = errors.length === 0
await page.click('nav [data-tab="flow"]')
await page.screenshot({ path: new URL('./understanding-delegation.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: false })
await browser.close()
if (errors.length) console.log('page errors:', errors)
if (bad.length) console.log('bad responses:', bad)
let pass = 0
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (v) pass++ }
console.log(`${pass}/${Object.keys(checks).length}  url=${url}`)
process.exit(pass === Object.keys(checks).length ? 0 : 1)
