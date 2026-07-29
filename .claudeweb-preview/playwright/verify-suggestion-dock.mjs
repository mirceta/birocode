// UI verify for openspec fix-suggestion-loop-inert (slice 1): the dock loop
// popover shows the engine's live decision readout and the pending chip with
// the brain's confidence. ISOLATED harness (:5228, own CLAUDEWEB_DATADIR),
// stub claude.exe on PATH as a safety net.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import os from 'node:os'

const PORT = 5228
const BASE = `http://localhost:${PORT}`
const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXE = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows/ClaudeWeb.exe`
const DATADIR = `${ROOT}/.claudeweb-preview/iso-datadir-suggestion-ui`
const SCRATCH = `${ROOT}/.claudeweb-preview/suggestion-ui-scratch`
const STUB = `${ROOT}/.claudeweb-preview/suggestion-ui-stub`
const OUT = `${ROOT}/.claudeweb-preview/playwright/out-suggestion`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }
mkdirSync(OUT, { recursive: true })

const S1 = '66666666-6666-6666-6666-666666666661'
const PROMPT_A = 'please deploy the production build and then verify health endpoints carefully'

const log = (...a) => console.log('[suggestion-ui]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const api = (method, path, body) => fetch(`${BASE}/api${path}`, {
  method, headers: H, body: body ? JSON.stringify(body) : undefined,
})

let child = null
async function startHarness() {
  const env = { ...process.env, CLAUDEWEB_PORT: String(PORT), CLAUDEWEB_DATADIR: DATADIR }
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  env[pathKey] = `${STUB.replaceAll('/', '\\')};${env[pathKey] ?? ''}`
  child = spawn(EXE, [], { env, detached: true, stdio: 'ignore' })
  child.unref()
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try { if ((await fetch(`${BASE}/api/health`)).ok) return } catch { /* not up */ }
  }
  throw new Error('harness did not come up on ' + PORT)
}
async function stopHarness() {
  if (!child) return
  try { process.kill(child.pid) } catch { /* gone */ }
  child = null
  await sleep(1500)
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  })
  return r.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
}

const encodeCwd = (p) => p.replace(/[^A-Za-z0-9]/g, '-')
let seededDir = null

const browser = await chromium.launch()
try {
  await rm(DATADIR, { recursive: true, force: true })
  await rm(SCRATCH, { recursive: true, force: true })
  await rm(STUB, { recursive: true, force: true })
  await mkdir(DATADIR, { recursive: true })
  await mkdir(STUB, { recursive: true })
  await copyFile(process.execPath, join(STUB, 'claude.exe'))
  await writeFile(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: true }))
  // NB: an EMPTY DenyList reloads the defaults (which include "deploy" —
  // it would deny-hold PROMPT_A); seed a harmless term instead.
  await writeFile(join(DATADIR, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: false, Threshold: 0.75, ArmedRepoIds: [], DenyList: ['dangerword'],
  }, null, 2))
  await writeFile(join(DATADIR, 'prompts.json'), JSON.stringify({
    Prompts: [{ Id: 'c'.repeat(32), Emoji: '', Label: '', Text: PROMPT_A }],
  }, null, 2))

  const repoPath = join(SCRATCH, 'suggestUi')
  await mkdir(repoPath, { recursive: true })
  seededDir = join(os.homedir(), '.claude', 'projects', encodeCwd(repoPath))
  await mkdir(seededDir, { recursive: true })
  await writeFile(join(seededDir, `${S1}.jsonl`), JSON.stringify({
    type: 'assistant', timestamp: new Date(Date.now() - 300000).toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text: 'The build finished.' }] },
  }) + '\n')

  await startHarness()
  const repo = await (await api('POST', '/repos', { Folder: repoPath, Name: 'suggestUi' })).json()
  await api('POST', '/dock', { id: 'suggestion-ui-tab', repoId: repo.id, repoName: 'suggestUi' })
  await api('POST', '/autopilot/loop', { repoId: repo.id, action: 'start', kind: 'suggestion', mode: 'suggest' })

  // Wait for the engine to pend (below-threshold near-miss).
  let pended = false
  for (let i = 0; i < 25; i++) {
    await sleep(2000)
    const st = await (await api('GET', '/autopilot/loops')).json()
    const l = (st.loops ?? []).find((x) => x.repoId === repo.id)
    if (l?.pendingPrompt) { pended = true; break }
  }
  check('engine pended the below-threshold candidate', pended)

  const token = await login()
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1100 } })
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
  await ctx.addInitScript(() => {
    localStorage.setItem('claudeweb_ui_mode', 'advanced')
    localStorage.setItem('claudeweb_dash_view', 'phones')
    localStorage.setItem('claudeweb_dock_active', 'suggestion-ui-tab')
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log('PAGEERROR:', e.message))
  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(1500)
  if ((await page.locator('.dash').count()) === 0) {
    await page.keyboard.press('Control+Shift+D')
    await page.waitForSelector('.dash', { timeout: 5000 })
  }
  const card = page.locator('.phone', { has: page.locator('.phone__name:text-is("suggestUi")') })
  check('dock card visible', (await card.count()) === 1)

  await card.locator('.phone__loop-btn').click()
  await page.waitForSelector('.phone__loop-pop', { timeout: 5000 })
  // Let the loops poll deliver decision fields into the open popover.
  await page.waitForSelector('.phone__loop-decision', { timeout: 15000 })

  // ---- decision readout: word chip + gate-open reason ----------------------
  const word = await card.locator('.phone__loop-decision-word').textContent()
  check(`decision word rendered (got "${word}")`, (word ?? '').toLowerCase().includes('suggested'))
  const reason = await card.locator('.phone__loop-decision-reason').textContent()
  check(`decision reason rendered gate-open (got "${reason}")`, (reason ?? '').length > 0)

  // ---- pending chip: prompt text + honest confidence -----------------------
  const pendingText = await card.locator('.phone__loop-pending .phone__loop-inspect-pre').textContent()
  check('pending chip shows the routine text', (pendingText ?? '').includes('production build'))
  const confChip = await card.locator('.phone__loop-pending-conf').textContent()
  check(`pending chip shows confidence (got "${confChip}")`, /\d{1,2}%/.test(confChip ?? ''))

  await page.screenshot({ path: join(OUT, '01-decision-pending.png'), fullPage: false })
  log('screenshot: out-suggestion/01-decision-pending.png')
  await ctx.close()
} catch (e) {
  failures++
  log('FATAL:', e.stack || e.message)
} finally {
  await browser.close()
  await stopHarness()
  const rmRetry = async (p) => {
    for (let i = 0; i < 5; i++) {
      try { await rm(p, { recursive: true, force: true }); return } catch { await sleep(2000) }
    }
    log(`WARN: could not remove ${p}`)
  }
  await rmRetry(SCRATCH)
  if (seededDir) await rmRetry(seededDir)
  await rmRetry(DATADIR)
  await rmRetry(STUB)
}
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
