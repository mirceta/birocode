// openspec codex-account-and-models, isolated instance with a real Codex login:
//   1. GET /api/codex-account carries who/plan; GET /api/codex-usage carries real windows;
//   2. the status strip's Codex chip renders account · plan, the plan/subscription rows
//      and the usage meters (the Claude chip's twin);
//   3. the chat's model picker shows both engine families; on a codex repo it shows the
//      codex default; picking a Claude model flips the repo's Engine to claude on the
//      server and back again when an OpenAI model is picked;
//   4. a REAL codex turn with the picked model (`--model gpt-5.6`) completes; and
//   5. the server guard drops a mismatched model instead of failing the turn.
import { chromium } from 'playwright'

const PORT = process.env.PORT || '5226'
const BASE = `http://127.0.0.1:${PORT}`, PW = process.env.PW || 'iso-codex-acct-4474'
const REPO_ID = process.env.REPO_ID || ''
const LOG = process.env.LOG || ''
import fs from 'node:fs'
const checks = {}
const sse = (raw) => raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => { try { return JSON.parse(l.slice(5)) } catch { return null } }).filter(Boolean)

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const cookie = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
if (!cookie) { console.log('FATAL login', login.status); process.exit(1) }
const H = { Cookie: `claudeweb_session=${cookie}`, 'Content-Type': 'application/json' }
const RH = { ...H, 'X-Repo-Id': REPO_ID }

// 1. the two probes
const acct = await fetch(`${BASE}/api/codex-account`, { headers: H }).then((r) => r.json())
const usage = await fetch(`${BASE}/api/codex-usage`, { headers: H }).then((r) => r.json())
console.log('codex-account:', JSON.stringify({ ...acct, account: acct.account ? acct.account.replace(/^(.).*@/, '$1***@') : null }))
console.log('codex-usage:', JSON.stringify(usage).slice(0, 400))
checks['account: logged in with an email + plan from the login claims'] = acct.authenticated === true && /@/.test(acct.account || '') && !!acct.plan
checks['account: subscription end + auth provider present'] = !!acct.subscriptionUntil && !!acct.authProvider
checks['usage: available with a weekly window and per-model rows'] = usage.available === true && !!usage.weekly && Array.isArray(usage.scopedWeekly) && usage.scopedWeekly.length >= 1
checks['usage: no secret in the payload'] = !/eyJ|sk-|access_token|refresh_token/.test(JSON.stringify(usage) + JSON.stringify(acct))

// 2 + 3. the UI
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: cookie, url: BASE }])
await ctx.addInitScript((repoId) => {
  localStorage.setItem('claudeweb_ui_mode', 'advanced')
  localStorage.setItem('claudeweb_repo', repoId)
  localStorage.setItem('claudeweb_header_strip_collapsed', '0')
  localStorage.setItem('claudeweb_codex_account_collapsed', '0')
  localStorage.setItem('claudeweb_model', 'claude-opus-4-8') // a Claude choice left over from another repo
}, REPO_ID)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForSelector('.acct-chip--codex', { timeout: 20000 })
await page.waitForFunction(() => /@/.test(document.querySelector('.acct-chip--codex .acct-chip__handle')?.textContent || ''), null, { timeout: 20000 }).catch(() => {})
const chip = await page.evaluate(() => {
  const el = document.querySelector('.acct-chip--codex')
  const rows = [...el.querySelectorAll('.acct-chip__row')].map((r) => [r.querySelector('.acct-chip__rk')?.textContent, r.querySelector('.acct-chip__rv, .acct-chip__meter')?.textContent])
  return { handle: el.querySelector('.acct-chip__handle')?.textContent, dot: el.querySelector('.acct-chip__dot')?.className, rows, meters: el.querySelectorAll('.acct-chip__meter').length }
})
console.log('chip:', JSON.stringify({ ...chip, handle: chip.handle?.replace(/^(.).*@/, '$1***@') }))
checks['chip: handle is "account · plan" with a green dot'] = /@/.test(chip.handle || '') && /·/.test(chip.handle || '') && /--ok/.test(chip.dot || '')
checks['chip: plan + subscription + login rows'] = chip.rows.some((r) => r[0] === 'Plan') && chip.rows.some((r) => r[0] === 'Subscription') && chip.rows.some((r) => r[0] === 'Login')
checks['chip: usage meters rendered'] = chip.meters >= 1

await page.waitForSelector('select.chat__model', { timeout: 20000 })
const picker = await page.evaluate(() => { const s = document.querySelector('select.chat__model'); return { value: s.value, groups: [...s.querySelectorAll('optgroup')].map((g) => [g.label, g.dataset.provider, g.querySelectorAll('option').length]) } })
console.log('picker:', JSON.stringify(picker))
checks['picker: two engine groups'] = picker.groups.length === 2 && picker.groups[0][1] === 'claude' && picker.groups[1][1] === 'codex' && picker.groups[1][2] >= 1
checks['picker: on a codex repo the stored Claude choice shows as the codex default'] = picker.value === 'gpt-6-astra'

const providerOf = async () => (await fetch(`${BASE}/api/repos`, { headers: H }).then((r) => r.json())).find((r) => r.id === REPO_ID)?.provider
const waitProvider = async (want) => { for (let i = 0; i < 20; i++) { if ((await providerOf()) === want) return true; await page.waitForTimeout(300) } return false }
await page.selectOption('select.chat__model', 'claude-opus-4-8')
checks['picker: choosing a Claude model flips the repo Engine to claude on the server'] = await waitProvider('claude')
checks['picker: the picker shows the Claude model synchronously (optimistic, no flicker)'] = (await page.evaluate(() => document.querySelector('select.chat__model').value)) === 'claude-opus-4-8'
await page.selectOption('select.chat__model', 'gpt-6-astra')
checks['picker: choosing an OpenAI model flips the Engine back to codex'] = await waitProvider('codex')
checks['picker: the picker shows gpt-6-astra'] = (await page.evaluate(() => document.querySelector('select.chat__model').value)) === 'gpt-6-astra'
checks['ui: no page errors'] = errors.length === 0
await browser.close()

// 4. a real codex turn with the picked model (the client sends model + provider)
const logOffset = LOG && fs.existsSync(LOG) ? fs.statSync(LOG).size : 0
let t0 = Date.now()
let ev = sse(await fetch(`${BASE}/api/chat`, { method: 'POST', headers: RH, body: JSON.stringify({ message: 'Reply with exactly: MODEL-OK', model: 'gpt-6-astra', provider: 'codex' }) }).then((r) => r.text()))
let types = ev.map((e) => e.type)
console.log(`turn (gpt-6-astra) after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, types.join(' '), '|', ev.filter((e) => e.type === 'token').map((e) => e.text).join('').slice(0, 60))
checks['turn: real codex turn with the account model (--model gpt-6-astra) completed'] = types.includes('done') && !types.includes('error')
checks['usage: the account-available models include the model that ran'] = Array.isArray(usage.models) && usage.models.includes('gpt-6-astra')

// 4b. an Engine switch under a live conversation: a Claude session id sent to the codex
// repo must start a NEW codex thread (not fail resuming a foreign id), and the page's
// stale engine must not override the server's (no provider in the body).
t0 = Date.now()
ev = sse(await fetch(`${BASE}/api/chat`, { method: 'POST', headers: RH, body: JSON.stringify({ message: 'Reply with exactly: SWITCH-OK', model: 'claude-fable-5-1', sessionId: '11111111-2222-4333-8444-555555555555' }) }).then((r) => r.text()))
types = ev.map((e) => e.type)
const newSession = ev.find((e) => e.type === 'session')?.sessionId
console.log(`turn (foreign session id on codex repo) after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, types.join(' '), '| new session', newSession)
checks['switch: foreign session id starts a fresh codex thread and completes'] = types.includes('done') && !types.includes('error') && !!newSession && newSession !== '11111111-2222-4333-8444-555555555555'
if (LOG && fs.existsSync(LOG)) {
  const log3 = fs.readFileSync(LOG).subarray(logOffset).toString('utf8')
  checks['switch: log says the session is not a codex conversation and a new one started'] = /is not a codex conversation; starting a new codex conversation/.test(log3)
}

// 5. the guard: a Claude model on the codex engine runs with the default model instead of failing
t0 = Date.now()
ev = sse(await fetch(`${BASE}/api/chat`, { method: 'POST', headers: RH, body: JSON.stringify({ message: 'Reply with exactly: GUARD-OK', model: 'claude-fable-5-1', provider: 'codex', lane: 'ask' }) }).then((r) => r.text()))
types = ev.map((e) => e.type)
console.log(`turn (mismatched model) after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, types.join(' '))
checks['guard: mismatched model dropped, turn still completes on codex'] = types.includes('done') && !types.includes('error')
if (LOG && fs.existsSync(LOG)) {
  const log = fs.readFileSync(LOG).subarray(logOffset).toString('utf8')
  checks['guard: log names the dropped model'] = /\[CHAT\] Model "claude-fable-5-1" is not a codex model/.test(log)
  checks['log: both turns ran on codex'] = (log.match(/\[CLI\] Starting new session .*\(codex\)/g) || []).length >= 2
}

let pass = 0
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (v) pass++ }
console.log(`${pass}/${Object.keys(checks).length}`)
process.exit(pass === Object.keys(checks).length ? 0 : 1)
