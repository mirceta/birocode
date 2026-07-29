// E2E for openspec fix-suggestion-loop-inert (slice 1), FULLY ISOLATED
// (:5227, own CLAUDEWEB_DATADIR). Reproduces the 2026-07-28 live inertness and
// asserts the fixes:
//
//   1. Suggest mode pends the below-threshold best candidate: an armed 💡 loop
//      records the near-miss routine as pendingPrompt with its honest
//      confidence — the armed loop visibly DOES something.
//   2. Drive mode is unchanged: the same below-threshold verdict holds as an
//      escalation, sends nothing, iteration counter stays 0.
//   3. No candidate still holds (no pend, reason says no routine matched).
//   4. Deny-list is word-scoped + named: "prod" in the deny list does NOT
//      block a routine containing "production" (the pend in #1 proves it),
//      but DOES block a routine containing "prod" as a word, with the term
//      named in the reason — and the denied routine is never pended.
//   5. A loop on a missing repo resolves error/repo-missing instead of being
//      silently skipped (the live web-flow-autodev zombie).
//   6. Gate closed: the loops projection still carries the decision WORD but
//      reason/label/confidence and pendingPrompt are null.
//
// A stub claude.exe (node.exe copy) is prepended to PATH as a safety net so no
// real CLI run can ever fire from this test.
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile, appendFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'

const PORT = 5227
const BASE = `http://localhost:${PORT}`
const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXE = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows/ClaudeWeb.exe`
const DATADIR = `${ROOT}/.claudeweb-preview/iso-datadir-suggestion`
const SCRATCH = `${ROOT}/.claudeweb-preview/suggestion-scratch`
const STUB = `${ROOT}/.claudeweb-preview/suggestion-stub`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }

const S1 = '55555555-5555-5555-5555-555555555551'
const S2 = '55555555-5555-5555-5555-555555555552'

// The label space (global prompts.json). A's text contains "production" —
// NOT deny-blocked by the "prod" deny term (word-boundary). B's text contains
// "prod" as a whole word — always deny-blocked.
const PROMPT_A = 'please deploy the production build and then verify health endpoints carefully'
const PROMPT_B = 'run the cleanup script against prod cluster tonight'

const log = (...a) => console.log('[suggestion]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = (p, body) => fetch(`${BASE}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
const get = (p) => fetch(`${BASE}${p}`, { headers: H })

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

const encodeCwd = (p) => p.replace(/[^A-Za-z0-9]/g, '-')
const seededDirs = []
function transcriptPath(repoPath, sessionId) {
  const dir = join(os.homedir(), '.claude', 'projects', encodeCwd(repoPath))
  if (!seededDirs.includes(dir)) seededDirs.push(dir)
  return { dir, file: join(dir, `${sessionId}.jsonl`) }
}
const lineFor = (text, atMs) => JSON.stringify({
  type: 'assistant', timestamp: new Date(atMs).toISOString(),
  message: { role: 'assistant', content: [{ type: 'text', text }] },
}) + '\n'
async function seedTranscript(repoPath, sessionId, text, atMs) {
  const { dir, file } = transcriptPath(repoPath, sessionId)
  await mkdir(dir, { recursive: true })
  await writeFile(file, lineFor(text, atMs))
}
async function appendMessage(repoPath, sessionId, text, atMs) {
  const { file } = transcriptPath(repoPath, sessionId)
  await appendFile(file, lineFor(text, atMs))
}

async function loopOf(repoId) {
  const state = await (await get('/api/autopilot/loops')).json()
  return (state.loops ?? []).find((l) => l.repoId === repoId)
}
async function waitLoop(repoId, pred, timeoutMs) {
  const until = Date.now() + timeoutMs
  let last = null
  while (Date.now() < until) {
    last = await loopOf(repoId)
    if (last && pred(last)) return last
    await sleep(2000)
  }
  return last // last observation, so failures print real state
}

try {
  await rm(DATADIR, { recursive: true, force: true })
  await rm(SCRATCH, { recursive: true, force: true })
  await rm(STUB, { recursive: true, force: true })
  await mkdir(DATADIR, { recursive: true })
  await mkdir(STUB, { recursive: true })
  await copyFile(process.execPath, join(STUB, 'claude.exe'))
  await writeFile(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: true }))
  await writeFile(join(DATADIR, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: false, Threshold: 0.75, ArmedRepoIds: [], DenyList: ['prod'],
  }, null, 2))
  await writeFile(join(DATADIR, 'prompts.json'), JSON.stringify({
    Prompts: [
      { Id: 'a'.repeat(32), Emoji: '', Label: '', Text: PROMPT_A },
      { Id: 'b'.repeat(32), Emoji: '', Label: '', Text: PROMPT_B },
    ],
  }, null, 2))

  const repoAPath = join(SCRATCH, 'suggestA')
  const repoBPath = join(SCRATCH, 'suggestB')
  await mkdir(repoAPath, { recursive: true })
  await mkdir(repoBPath, { recursive: true })
  // "The build finished." overlaps PROMPT_A on exactly one significant word
  // (build) → strength 1/2 → confidence ≈ 0.43, well below threshold 0.75.
  await seedTranscript(repoAPath, S1, 'The build finished.', Date.now() - 300000)
  await seedTranscript(repoBPath, S2, 'The build finished.', Date.now() - 300000)

  log('starting isolated harness…')
  await startHarness()

  const repoA = await (await post('/api/repos', { Folder: repoAPath, Name: 'suggestA' })).json()
  const repoB = await (await post('/api/repos', { Folder: repoBPath, Name: 'suggestB' })).json()
  check('scratch repos registered', !!repoA.id && !!repoB.id)

  // ---- 1: suggest mode pends the below-threshold best candidate --------------
  let r = await post('/api/autopilot/loop', { repoId: repoA.id, action: 'start', kind: 'suggestion', mode: 'suggest' })
  check(`suggestion loop armed suggest (${r.status})`, r.status === 200)
  let l = await waitLoop(repoA.id, (x) => !!x.pendingPrompt, 45000)
  check('below-threshold match pends the routine', l?.pendingPrompt === PROMPT_A)
  check(`decision is "suggestion" (got ${l?.decision})`, l?.decision === 'suggestion')
  const conf = l?.decisionConfidence
  check(`pending confidence is honest and below threshold (got ${conf})`,
    typeof conf === 'number' && conf > 0.2 && conf < 0.75)
  check('decision reason disclosed while gate open', typeof l?.decisionReason === 'string' && l.decisionReason.length > 0)
  check('loop stays armed (non-terminal)', l?.active === true)

  // ---- 2: drive mode still holds below threshold — nothing sent --------------
  r = await post('/api/autopilot/loop', { repoId: repoA.id, action: 'start', kind: 'suggestion', mode: 'drive' })
  check(`re-armed in drive mode (${r.status})`, r.status === 200)
  l = await waitLoop(repoA.id, (x) => x.decision === 'escalate', 45000)
  check(`drive mode escalates below threshold (decision ${l?.decision})`, l?.decision === 'escalate')
  check(`drive escalate reason says below threshold (got "${l?.decisionReason}")`,
    (l?.decisionReason ?? '').includes('below threshold'))
  check('drive mode pended nothing', !l?.pendingPrompt)
  check(`drive mode sent nothing (iterations ${l?.iterationsDone})`, l?.iterationsDone === 0)
  check('drive loop stays armed', l?.active === true)

  // ---- 3: no candidate at all still holds without a pend ---------------------
  r = await post('/api/autopilot/loop', { repoId: repoA.id, action: 'start', kind: 'suggestion', mode: 'suggest' })
  check(`re-armed in suggest mode (${r.status})`, r.status === 200)
  await appendMessage(repoAPath, S1, 'Zebra quokka xylophone contemplation.', Date.now() - 60000)
  l = await waitLoop(repoA.id, (x) => (x.decisionReason ?? '').includes('no routine'), 45000)
  check(`no-candidate holds with the no-match reason (got "${l?.decisionReason}")`,
    (l?.decisionReason ?? '').includes('no routine matched'))
  check('no-candidate pends nothing', !l?.pendingPrompt)

  // ---- 4: deny-list blocks by whole word, names the term ---------------------
  // This message matches PROMPT_B hardest; B contains "prod" as a word.
  await appendMessage(repoAPath, S1, 'The cleanup script ran against the prod cluster tonight.', Date.now() - 30000)
  l = await waitLoop(repoA.id, (x) => (x.decisionReason ?? '').includes('deny-listed'), 45000)
  check(`denied routine escalates naming the term (got "${l?.decisionReason}")`,
    (l?.decisionReason ?? '').includes('deny-listed "prod"'))
  check('denied routine is never pended', !l?.pendingPrompt)

  // ---- 5: missing repo folder resolves error/repo-missing --------------------
  await rm(repoAPath, { recursive: true, force: true })
  l = await waitLoop(repoA.id, (x) => !x.active, 45000)
  check(`missing repo resolves the loop (status ${l?.status})`, l?.status === 'error')
  check(`stop reason is repo-missing (${l?.stopReason})`, l?.stopReason === 'repo-missing')

  // ---- 6: gate closed → decision word only, reasons and pend nulled ----------
  // First give repoB a live pend so there is something the closed gate must hide.
  r = await post('/api/autopilot/loop', { repoId: repoB.id, action: 'start', kind: 'suggestion', mode: 'suggest' })
  check(`repoB suggestion loop armed (${r.status})`, r.status === 200)
  l = await waitLoop(repoB.id, (x) => !!x.pendingPrompt, 45000)
  check('repoB pended while gate open', l?.pendingPrompt === PROMPT_A)

  log('restarting with the operator gate CLOSED…')
  await stopHarness()
  await writeFile(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: false }))
  await startHarness()
  const closed = await (await get('/api/autopilot/loops')).json()
  check('projection reports gate closed', closed.gateOpen === false)
  const lb = (closed.loops ?? []).find((x) => x.repoId === repoB.id)
  check('armed loop still listed after restart', lb?.active === true)
  check(`decision word present gate-closed (got ${lb?.decision})`, typeof lb?.decision === 'string' && lb.decision.length > 0)
  check('decision reason nulled gate-closed', lb?.decisionReason == null)
  check('decision label nulled gate-closed', lb?.decisionLabel == null)
  check('decision confidence nulled gate-closed', lb?.decisionConfidence == null)
  check('pending prompt nulled gate-closed', lb?.pendingPrompt == null)
} catch (e) {
  failures++
  log('FATAL:', e.stack || e.message)
} finally {
  await stopHarness()
  const rmRetry = async (p) => {
    for (let i = 0; i < 5; i++) {
      try { await rm(p, { recursive: true, force: true }); return } catch { await sleep(2000) }
    }
    log(`WARN: could not remove ${p}`)
  }
  await rmRetry(SCRATCH)
  for (const d of seededDirs) await rmRetry(d)
  await rmRetry(DATADIR)
  await rmRetry(STUB)
}
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
