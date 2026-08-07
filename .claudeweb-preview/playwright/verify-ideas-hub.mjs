// E2E for openspec ideas-harness-hub, FULLY ISOLATED (harness A :5240 acts as
// the hub, harness B :5241 syncs against it; each has its own
// CLAUDEWEB_DATADIR). No stub — the hub IS the real endpoint implementation.
//
// Scenarios (tasks.md 3.1 + 3.2):
//   0. Disabled hub + wrong token answer error envelopes; hub-info stays gated
//   1. Enable hub on A (UI via Playwright: toggle renders the origin URL) + copy
//   2. Hub path needs NO session auth; other /api routes still 401
//   3. B syncs through A's hub URL: add on B appears on A's board
//   4. Hub-local add on A propagates to B (rev bump on local edit)
//   5. Delete on B carries to A (tombstone through the hub)
//   6. Raw CAS: stale-baseRev POST answers conflict:true + store; fresh lands
//   7. Self-pointing A's sync at its own hub is a harmless no-op
import { spawn, execSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXEDIR = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows`
const EXE = `${EXEDIR}/ClaudeWeb.exe`
const OUT = `${ROOT}/.claudeweb-preview/playwright`
const PORT_A = 5240
const PORT_B = 5241
const BASE_A = `http://localhost:${PORT_A}`
const BASE_B = `http://localhost:${PORT_B}`
const DATADIR_A = `${ROOT}/.claudeweb-preview/iso-datadir-ideashub-a`
const DATADIR_B = `${ROOT}/.claudeweb-preview/iso-datadir-ideashub-b`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }

const log = (...a) => console.log('[ideashub]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const api = (base, method, p, body) => fetch(`${base}/api${p}`, {
  method, headers: H, body: body === undefined ? undefined : JSON.stringify(body),
})
const notesOf = async (base) => await (await api(base, 'GET', '/notes')).json()
const statusOf = async (base) => await (await api(base, 'GET', '/notes/sync/status')).json()
async function waitFor(name, pred, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try { if (await pred()) return true } catch { /* retry */ }
    await sleep(1000)
  }
  return false
}

const children = { A: null, B: null }
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

const browser = await chromium.launch()
try {
  await rm(DATADIR_A, { recursive: true, force: true })
  await rm(DATADIR_B, { recursive: true, force: true })
  await mkdir(DATADIR_A, { recursive: true })
  await mkdir(DATADIR_B, { recursive: true })

  // Fresh frontend into the exe dir (exe-local dist shadows the repo dist).
  execSync(`robocopy "${ROOT.replaceAll('/', '\\')}\\client\\dist" "${EXEDIR.replaceAll('/', '\\')}\\client\\dist" /MIR /NFL /NDL /NJH /NP & exit 0`, { shell: 'cmd.exe', stdio: 'ignore' })

  log('starting harness A (hub) + B (client)…')
  await startHarness('A', PORT_A, DATADIR_A)
  await startHarness('B', PORT_B, DATADIR_B)

  // ---- 0: disabled hub / wrong token / gating --------------------------------
  const disabled = await (await fetch(`${BASE_A}/api/notes/hub/some-token?fn=get`)).json()
  check(`disabled hub answers ok:false + error (${disabled.error})`, disabled.ok === false && !!disabled.error)
  const infoUnauthed = await fetch(`${BASE_A}/api/notes/hub-info`)
  check(`hub-info without auth is 401 (${infoUnauthed.status})`, infoUnauthed.status === 401)
  const notesUnauthed = await fetch(`${BASE_A}/api/notes`)
  check(`/api/notes without auth is still 401 (${notesUnauthed.status})`, notesUnauthed.status === 401)

  // ---- 1: enable hub on A through the real sync bar UI -----------------------
  let token = null
  try {
    const loginRes = await fetch(`${BASE_A}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PW }),
    })
    const session = loginRes.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
    check('logged in for a session cookie', !!session)
    const ctx = await browser.newContext()
    await ctx.addCookies([{ name: 'claudeweb_session', value: session, url: BASE_A }])
    await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'))
    const page = await ctx.newPage()
    await page.goto(`${BASE_A}/studio/ideas`, { waitUntil: 'domcontentloaded' })

    const chip = page.locator('.ideas-sync__chip')
    await chip.waitFor({ state: 'visible', timeout: 15000 })
    await chip.click()
    const hubToggle = page.locator('.ideas-sync__hub .ideas-sync__enable input')
    await hubToggle.waitFor({ state: 'visible', timeout: 10000 })
    // Controlled checkbox: it flips only after POST /notes/hub-info resolves,
    // so click() + wait for the URL row (the real assertion), never check().
    await hubToggle.click()
    const urlInput = page.locator('.ideas-sync__hub-url-row .ideas-sync__url')
    await urlInput.waitFor({ state: 'visible', timeout: 10000 })
    const shownUrl = await urlInput.inputValue()
    check(`hub URL renders under the browsing origin (${shownUrl.slice(0, 60)}…)`,
      shownUrl.startsWith(`${BASE_A}/api/notes/hub/`))
    token = shownUrl.split('/').pop()
    check('token looks like 256-bit base64url (len ≥ 40)', (token ?? '').length >= 40)
    await page.screenshot({ path: join(OUT, 'ideas-hub-bar.png'), fullPage: true })
    await ctx.close()
  } catch (e) {
    check(`UI hub enable path (${e.message})`, false)
  }
  if (!token) {
    const info = await (await api(BASE_A, 'POST', '/notes/hub-info', { enabled: true })).json()
    token = info.token
  }
  const HUB_URL = `${BASE_A}/api/notes/hub/${token}`

  // ---- 2: hub contract path is session-auth-free -----------------------------
  const bare = await (await fetch(`${HUB_URL}?fn=get`)).json()
  check('hub GET without any auth answers ok:true', bare.ok === true && bare.rev >= 0)
  const wrong = await (await fetch(`${BASE_A}/api/notes/hub/${'x'.repeat(43)}?fn=get`)).json()
  check('wrong token answers ok:false + error, no store', wrong.ok === false && !wrong.store)

  // ---- 3: B syncs through the hub — add on B lands on A ----------------------
  await api(BASE_B, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: HUB_URL, pollSeconds: 5 })
  check('B reaches synced against the hub', await waitFor('bsync', async () =>
    (await statusOf(BASE_B)).state === 'synced'))
  const noteB = await (await api(BASE_B, 'POST', '/notes', { text: 'hub-e2e: born on B', priority: 1 })).json()
  check('note created on B', !!noteB.id)
  check('B note lands on hub A board', await waitFor('b2a', async () =>
    (await notesOf(BASE_A)).some((n) => n.id === noteB.id)))

  // ---- 4: hub-local add on A propagates to B (rev bump) ----------------------
  const revBefore = (await (await fetch(`${HUB_URL}?fn=get`)).json()).rev
  const noteA = await (await api(BASE_A, 'POST', '/notes', { text: 'hub-e2e: born on hub A' })).json()
  const revAfter = (await (await fetch(`${HUB_URL}?fn=get`)).json()).rev
  check(`hub-local edit bumps rev (${revBefore} -> ${revAfter})`, revAfter > revBefore)
  check('hub-local note reaches B', await waitFor('a2b', async () =>
    (await notesOf(BASE_B)).some((n) => n.id === noteA.id)))

  // ---- 5: delete on B carries to A -------------------------------------------
  await api(BASE_B, 'DELETE', `/notes/${noteA.id}`)
  check('delete on B removes the note on hub A', await waitFor('del', async () =>
    !(await notesOf(BASE_A)).some((n) => n.id === noteA.id)))

  // ---- 6: raw CAS conflict ----------------------------------------------------
  const cur = await (await fetch(`${HUB_URL}?fn=get`)).json()
  const stale = await (await fetch(HUB_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRev: cur.rev - 1, store: { Ideas: [], Tombstones: [] } }),
  })).json()
  check(`stale baseRev answers conflict:true + rev + store (rev ${stale.rev})`,
    stale.ok === false && stale.conflict === true && stale.rev === cur.rev && !!stale.store)
  const fresh = await (await fetch(HUB_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRev: cur.rev, store: cur.store }),
  })).json()
  check(`fresh baseRev lands (rev ${fresh.rev})`, fresh.ok === true && fresh.rev === cur.rev + 1)
  check('merged POST kept the board intact (B note survives)',
    (await notesOf(BASE_A)).some((n) => n.id === noteB.id))

  // ---- 7: A pointing its own sync at its own hub is a no-op ------------------
  const countBefore = (await notesOf(BASE_A)).length
  await api(BASE_A, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: HUB_URL, pollSeconds: 5 })
  check('self-pointing A reaches synced', await waitFor('selfsync', async () =>
    (await statusOf(BASE_A)).state === 'synced'))
  await sleep(8000)
  const countAfter = (await notesOf(BASE_A)).length
  check(`self-sync leaves the board unchanged (${countBefore} -> ${countAfter})`, countAfter === countBefore)
  const sSelf = await statusOf(BASE_A)
  check('self-sync settles clean (no error)', !sSelf.lastError)
} catch (e) {
  failures++
  log('FATAL:', e.message)
} finally {
  await browser.close().catch(() => {})
  await stopHarness('A')
  await stopHarness('B')
  const rmRetry = async (p) => {
    for (let i = 0; i < 5; i++) {
      try { await rm(p, { recursive: true, force: true }); return } catch { await sleep(2000) }
    }
    log(`WARN: could not remove ${p}`)
  }
  await rmRetry(DATADIR_A)
  await rmRetry(DATADIR_B)
}
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
