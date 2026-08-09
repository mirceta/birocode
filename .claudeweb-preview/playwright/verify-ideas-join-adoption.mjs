// E2E for openspec adopt-preexisting-ideas-on-join, FULLY ISOLATED (harness A
// :5240 acts as the hub, harness B :5241 joins it; each has its own
// CLAUDEWEB_DATADIR). API-only — the behavior under test is backend sync
// choreography, no UI claims are made here.
//
// The transition case: B lived on the OLD system (local-only board) and holds
// ideas of its own; the team moves to the NEW system (shared store on A's hub).
// Scenarios (tasks.md 2.2):
//   1. Pre-existing ideas on B are uploaded to the hub on first contact —
//      as the FIRST exchange (hub rev moves before B's first poll interval
//      could even elapse), and B's board becomes the union
//   2. Nothing remote is lost: A's own ideas survive, B receives them, and an
//      idea deleted on A before the join does NOT resurrect from... (it never
//      existed on B — covered instead: A's tombstones survive the join)
//   3. Offline join: B pointed at a dead port keeps local ideas, then
//      converges (uploads) after the URL is corrected to the live hub
//   4. Re-point: B moved from hub A to hub C seeds C with its board too
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'

const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXEDIR = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows`
const EXE = `${EXEDIR}/ClaudeWeb.exe`
const PORT_A = 5240
const PORT_B = 5241
const PORT_C = 5242
const BASE_A = `http://localhost:${PORT_A}`
const BASE_B = `http://localhost:${PORT_B}`
const BASE_C = `http://localhost:${PORT_C}`
const DATADIR_A = `${ROOT}/.claudeweb-preview/iso-datadir-joinadopt-a`
const DATADIR_B = `${ROOT}/.claudeweb-preview/iso-datadir-joinadopt-b`
const DATADIR_C = `${ROOT}/.claudeweb-preview/iso-datadir-joinadopt-c`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }

const log = (...a) => console.log('[joinadopt]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const api = (base, method, p, body) => fetch(`${base}/api${p}`, {
  method, headers: H, body: body === undefined ? undefined : JSON.stringify(body),
})
const notesOf = async (base) => await (await api(base, 'GET', '/notes')).json()
const statusOf = async (base) => await (await api(base, 'GET', '/notes/sync/status')).json()
const addNote = async (base, text) => await (await api(base, 'POST', '/notes', { text })).json()
async function enableHub(base) {
  const info = await (await api(base, 'POST', '/notes/hub-info', { enabled: true })).json()
  return `${base}/api/notes/hub/${info.token}`
}
const hubGet = async (hubUrl) => await (await fetch(`${hubUrl}?fn=get`)).json()
async function waitFor(name, pred, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try { if (await pred()) return true } catch { /* retry */ }
    await sleep(500)
  }
  return false
}

const children = {}
async function startHarness(key, port, datadir) {
  const env = { ...process.env, CLAUDEWEB_PORT: String(port), CLAUDEWEB_DATADIR: datadir }
  children[key] = spawn(EXE, [], { env, detached: true, stdio: 'ignore' })
  children[key].unref()
  const base = `http://localhost:${port}`
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try { if ((await fetch(`${base}/api/health`)).ok) return } catch { /* not up */ }
  }
  throw new Error(`harness ${key} did not come up on ${port}`)
}
async function stopHarness(key) {
  if (!children[key]) return
  try { process.kill(children[key].pid) } catch { /* gone */ }
  children[key] = null
  await sleep(1500)
}

try {
  for (const d of [DATADIR_A, DATADIR_B, DATADIR_C]) {
    await rm(d, { recursive: true, force: true })
    await mkdir(d, { recursive: true })
  }

  log('starting harness A (hub) + B (joining node)…')
  await startHarness('A', PORT_A, DATADIR_A)
  await startHarness('B', PORT_B, DATADIR_B)

  // ---- setup: the OLD world ---------------------------------------------------
  // A (future hub) has its own board, including one idea deleted pre-join.
  const a1 = await addNote(BASE_A, 'joinadopt: hub-native idea')
  const aDead = await addNote(BASE_A, 'joinadopt: deleted on hub before join')
  await api(BASE_A, 'DELETE', `/notes/${aDead.id}`)
  // B is a plain old-system node: ideas exist, sync has NEVER been configured.
  const b1 = await addNote(BASE_B, 'joinadopt: B pre-existing idea 1')
  const b2 = await addNote(BASE_B, 'joinadopt: B pre-existing idea 2')
  const b3 = await addNote(BASE_B, 'joinadopt: B pre-existing idea 3')
  check('setup: A has 1 live + 1 tombstoned, B has 3 pre-existing',
    !!a1.id && !!aDead.id && !!b1.id && !!b2.id && !!b3.id)
  const sB0 = await statusOf(BASE_B)
  check(`B starts with sync disabled (${sB0.state})`, sB0.state === 'disabled')

  // ---- 1+2: B joins the NEW system --------------------------------------------
  const HUB_A = await enableHub(BASE_A)
  const revBeforeJoin = (await hubGet(HUB_A)).rev
  await api(BASE_B, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: HUB_A, pollSeconds: 30 })
  // pollSeconds is deliberately LONG (30 s): if B's pre-existing ideas reach the
  // hub within a few seconds, it was the first-contact seed push — the old
  // poll → RemoteStale → debounced-push path could not have run yet.
  const seeded = await waitFor('seed push', async () => {
    const store = (await hubGet(HUB_A)).store
    const ids = new Set((store?.Ideas ?? store?.ideas ?? []).map((n) => n.Id ?? n.id))
    return ids.has(b1.id) && ids.has(b2.id) && ids.has(b3.id)
  }, 10000)
  check('all 3 of B\'s pre-existing ideas are in the hub store within 10 s of joining', seeded)
  const revAfterJoin = (await hubGet(HUB_A)).rev
  check(`join moved the hub rev (${revBeforeJoin} -> ${revAfterJoin})`, revAfterJoin > revBeforeJoin)

  check('hub-native idea survived the join on A', (await notesOf(BASE_A)).some((n) => n.id === a1.id))
  check('B received the hub-native idea (board = union)', await waitFor('a2b', async () =>
    (await notesOf(BASE_B)).some((n) => n.id === a1.id)))
  check('A\'s pre-join delete stayed deleted on A', !(await notesOf(BASE_A)).some((n) => n.id === aDead.id))
  check('A\'s pre-join delete did not appear on B', !(await notesOf(BASE_B)).some((n) => n.id === aDead.id))
  const hubStore = (await hubGet(HUB_A)).store
  const hubTombs = hubStore?.Tombstones ?? hubStore?.tombstones ?? []
  check('A\'s tombstone survived the seeding push', hubTombs.some((t) => (t.Id ?? t.id) === aDead.id))
  check('B settles synced', await waitFor('bsynced', async () => (await statusOf(BASE_B)).state === 'synced'))

  // ---- 3: offline join --------------------------------------------------------
  log('starting harness C (second hub, also the offline-join target)…')
  await startHarness('C', PORT_C, DATADIR_C)
  const HUB_C = await enableHub(BASE_C)
  await stopHarness('C') // C goes dark: its hub URL is now unreachable
  const b4 = await addNote(BASE_B, 'joinadopt: B idea born while re-pointing')
  await api(BASE_B, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: HUB_C, pollSeconds: 5 })
  check('B goes offline against the dark store (local board intact)', await waitFor('boffline', async () => {
    const s = await statusOf(BASE_B)
    return s.state === 'offline' || s.state === 'error'
  }))
  check('local ideas untouched while offline', (await notesOf(BASE_B)).some((n) => n.id === b4.id))

  // ---- 3b+4: the store comes up — the join converges without user action ------
  await startHarness('C', PORT_C, DATADIR_C) // same DATADIR: token + hub state persist
  const converged = await waitFor('offline converge', async () => {
    const store = (await hubGet(HUB_C)).store
    const ids = new Set((store?.Ideas ?? store?.ideas ?? []).map((n) => n.Id ?? n.id))
    return ids.has(b1.id) && ids.has(b4.id) && ids.has(a1.id)
  }, 30000)
  check('after the store comes up, B\'s whole board (incl. pre-existing + A\'s idea) lands on hub C', converged)
  check('B settles synced against C', await waitFor('bsyncedc', async () => (await statusOf(BASE_B)).state === 'synced'))
} catch (e) {
  failures++
  log('FATAL:', e.message)
} finally {
  await stopHarness('A')
  await stopHarness('B')
  await stopHarness('C')
  const rmRetry = async (p) => {
    for (let i = 0; i < 5; i++) {
      try { await rm(p, { recursive: true, force: true }); return } catch { await sleep(2000) }
    }
    log(`WARN: could not remove ${p}`)
  }
  await rmRetry(DATADIR_A)
  await rmRetry(DATADIR_B)
  await rmRetry(DATADIR_C)
}
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
