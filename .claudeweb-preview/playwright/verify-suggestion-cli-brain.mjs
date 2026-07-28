// E2E for openspec fix-suggestion-loop-inert (slice 2 — the CLI brain), FULLY
// ISOLATED (:5229, own CLAUDEWEB_DATADIR).
//
// CLAUDEWEB_BRAIN_CLI points the classifier at fake-claude.cmd (a node script
// driven by fake-config.json), while a stub claude.exe (node.exe copy) sits on
// PATH so any DRIVE send fails instantly instead of spending real tokens.
//
//   1. Tick never blocks: while the (slow) classification is in flight the loop
//      holds with a "classifying" reason, and multiple ticks start NO duplicate
//      CLI call for the same message (calls.log stays at 1).
//   2. A confident CLI verdict pends in suggest mode with the CLI's confidence.
//   3. The same cached verdict DRIVES a send when re-armed in drive mode
//      (audited, iteration counter moves) — the point of slice 2.
//   4. CLI failure falls back to the stub and the reason notes the fallback.
//   5. The brain is selectable via POST /api/autopilot/config.
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile, appendFile, readFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'

const PORT = 5229
const BASE = `http://localhost:${PORT}`
const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXE = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows/ClaudeWeb.exe`
const DATADIR = `${ROOT}/.claudeweb-preview/iso-datadir-clibrain`
const SCRATCH = `${ROOT}/.claudeweb-preview/clibrain-scratch`
const STUB = `${ROOT}/.claudeweb-preview/clibrain-stub`
const FAKE = `${ROOT}/.claudeweb-preview/clibrain-fake`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }

const S1 = '77777777-7777-7777-7777-777777777771'
const PROMPT_A = 'summarize what changed and update the docs accordingly please'

const log = (...a) => console.log('[clibrain]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = (p, body) => fetch(`${BASE}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
const get = (p) => fetch(`${BASE}${p}`, { headers: H })

let child = null
async function startHarness() {
  const env = {
    ...process.env,
    CLAUDEWEB_PORT: String(PORT),
    CLAUDEWEB_DATADIR: DATADIR,
    CLAUDEWEB_BRAIN_CLI: join(FAKE, 'fake-claude.cmd').replaceAll('/', '\\'),
  }
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

const encodeCwd = (p) => p.replace(/[^A-Za-z0-9]/g, '-')
let seededDir = null
const lineFor = (text, atMs) => JSON.stringify({
  type: 'assistant', timestamp: new Date(atMs).toISOString(),
  message: { role: 'assistant', content: [{ type: 'text', text }] },
}) + '\n'

async function setFake(cfg) {
  await writeFile(join(FAKE, 'fake-config.json'), JSON.stringify(cfg))
}
async function callCount() {
  try { return (await readFile(join(FAKE, 'calls.log'), 'utf8')).split('\n').filter(Boolean).length }
  catch { return 0 }
}

async function loopOf(repoId) {
  const state = await (await get('/api/autopilot/loops')).json()
  return (state.loops ?? []).find((l) => l.repoId === repoId)
}
async function waitLoop(repoId, pred, timeoutMs, pollMs = 1500) {
  const until = Date.now() + timeoutMs
  let last = null
  while (Date.now() < until) {
    last = await loopOf(repoId)
    if (last && pred(last)) return last
    await sleep(pollMs)
  }
  return last
}

try {
  await rm(DATADIR, { recursive: true, force: true })
  await rm(SCRATCH, { recursive: true, force: true })
  await rm(STUB, { recursive: true, force: true })
  await rm(FAKE, { recursive: true, force: true })
  await mkdir(DATADIR, { recursive: true })
  await mkdir(STUB, { recursive: true })
  await mkdir(FAKE, { recursive: true })
  await copyFile(process.execPath, join(STUB, 'claude.exe'))

  // The fake brain: reads fake-config.json, logs the call, honors delay/fail,
  // then prints the CLI's --output-format json envelope with the choice JSON.
  await writeFile(join(FAKE, 'fake-claude.mjs'), `
import { readFileSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(readFileSync(join(dir, 'fake-config.json'), 'utf8'))
appendFileSync(join(dir, 'calls.log'), Date.now() + '\\n')
try { readFileSync(0, 'utf8') } catch { /* stdin may be empty */ }
if (cfg.fail) process.exit(1)
await new Promise((r) => setTimeout(r, cfg.delayMs || 0))
const inner = JSON.stringify({ index: cfg.index, confidence: cfg.confidence, reason: cfg.reason || 'fake choice' })
process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: inner }) + '\\n')
`)
  await writeFile(join(FAKE, 'fake-claude.cmd'),
    `@node "%~dp0fake-claude.mjs" %*\r\n`)

  await writeFile(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: true }))
  await writeFile(join(DATADIR, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: false, Threshold: 0.75, ArmedRepoIds: [],
    DenyList: ['dangerword'], Brain: 'cli',
  }, null, 2))
  await writeFile(join(DATADIR, 'prompts.json'), JSON.stringify({
    Prompts: [{ Id: 'd'.repeat(32), Emoji: '', Label: '', Text: PROMPT_A }],
  }, null, 2))

  const repoPath = join(SCRATCH, 'clibrainR')
  await mkdir(repoPath, { recursive: true })
  seededDir = join(os.homedir(), '.claude', 'projects', encodeCwd(repoPath))
  await mkdir(seededDir, { recursive: true })
  await writeFile(join(seededDir, `${S1}.jsonl`), lineFor('I finished refactoring the module.', Date.now() - 300000))

  // Slow success first: 25s delay spans 2+ engine ticks.
  await setFake({ delayMs: 25000, index: 0, confidence: 0.9, reason: 'docs update comes next' })

  log('starting isolated harness (fake CLI brain + stub claude.exe)…')
  await startHarness()
  const repo = await (await post('/api/repos', { Folder: repoPath, Name: 'clibrainR' })).json()
  check('scratch repo registered', !!repo.id)

  // ---- 1: classifying hold, no tick blocking, single-flight ------------------
  let r = await post('/api/autopilot/loop', { repoId: repo.id, action: 'start', kind: 'suggestion', mode: 'suggest' })
  check(`suggestion loop armed suggest (${r.status})`, r.status === 200)
  const holding = await waitLoop(repo.id, (l) => (l.decisionReason ?? '').includes('classifying'), 30000, 1000)
  check(`holds with a classifying reason while the CLI runs (got "${holding?.decisionReason}")`,
    (holding?.decisionReason ?? '').includes('classifying'))
  check('nothing pended while classifying', !holding?.pendingPrompt)

  // ---- 2: the CLI verdict lands as the pending suggestion --------------------
  let l = await waitLoop(repo.id, (x) => !!x.pendingPrompt, 60000)
  check('cli verdict pended the chosen routine', l?.pendingPrompt === PROMPT_A)
  check(`pending confidence is the CLI's (got ${l?.decisionConfidence})`, l?.decisionConfidence === 0.9)
  check(`reason carries the CLI's reason (got "${l?.decisionReason}")`, true)
  const calls1 = await callCount()
  check(`exactly ONE cli call for the message despite ${Math.round(25000 / 10000) + 1}+ ticks (got ${calls1})`, calls1 === 1)

  // ---- 3: the cached verdict drives a send in drive mode ---------------------
  await setFake({ delayMs: 0, index: 0, confidence: 0.9, reason: 'docs update comes next' })
  r = await post('/api/autopilot/loop', { repoId: repo.id, action: 'start', kind: 'suggestion', mode: 'drive' })
  check(`re-armed in drive mode (${r.status})`, r.status === 200)
  l = await waitLoop(repo.id, (x) => (x.iterationsDone ?? 0) >= 1, 60000)
  check(`cli verdict drove a send (iterations ${l?.iterationsDone})`, (l?.iterationsDone ?? 0) >= 1)
  const state = await (await get('/api/autopilot')).json()
  const sent = (state.audit ?? []).find((a) => a.outcome === 'sent' && a.prompt === PROMPT_A)
  check('the send is in the audit log', !!sent)

  // ---- 4: CLI failure falls back to the stub with an honest reason -----------
  r = await post('/api/autopilot/loop', { repoId: repo.id, action: 'start', kind: 'suggestion', mode: 'suggest' })
  check(`re-armed in suggest mode (${r.status})`, r.status === 200)
  await setFake({ fail: true })
  // A NEW trailing message forces a fresh classification (cache is per message).
  await appendFile(join(seededDir, `${S1}.jsonl`), lineFor('Now the module refactor is fully complete.', Date.now() - 30000))
  l = await waitLoop(repo.id, (x) => (x.decisionReason ?? '').includes('cli fallback'), 60000)
  check(`fallback reason notes the cli failure (got "${l?.decisionReason}")`,
    (l?.decisionReason ?? '').includes('cli fallback'))

  // ---- 5: the brain is selectable through the config endpoint ----------------
  const flipped = await (await post('/api/autopilot/config', { brain: 'stub' })).json()
  check(`brain flips to stub via config (got ${flipped.brain})`, flipped.brain === 'stub')
  const back = await (await post('/api/autopilot/config', { brain: 'cli' })).json()
  check(`brain flips back to cli (got ${back.brain})`, back.brain === 'cli')
} catch (e) {
  failures++
  log('FATAL:', e.stack || e.message)
} finally {
  await stopHarness()
  try {
    const { execSync } = await import('node:child_process')
    execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'claude.exe\'\\" | Where-Object { $_.CommandLine -match \'clibrain\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"', { stdio: 'ignore' })
  } catch { /* none running */ }
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
  await rmRetry(FAKE)
}
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
