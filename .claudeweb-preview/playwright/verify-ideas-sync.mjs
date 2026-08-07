// E2E for openspec ideas-drive-sync, FULLY ISOLATED (harness A :5230 +
// harness B :5231, each with its own CLAUDEWEB_DATADIR). No test talks to
// real Google: an in-process stub on :5312 implements the Apps Script web-app
// contract — GET/POST /exec answered via a 302 redirect to a body URL (the
// exact shape script.google.com uses), JSON {ok, rev, store} envelopes, CAS
// on baseRev with {ok:false, conflict:true} + current store on mismatch —
// plus fault injection (drop connections = offline, force one conflict).
//
// Scenarios (tasks.md 4.2 + 4.3):
//   0. Unconfigured harnesses make ZERO outbound sync calls
//   1. UI config on A (Playwright): paste URL -> enable -> status chip synced
//   2. Add on A propagates to B
//   3. Concurrent edit: newest UpdatedAt wins on both boxes
//   4. CAS conflict: forced stale-rev push re-merges and still lands
//   5. Delete tombstone survives an offline box returning (B down during delete)
//   6. Offline edits queue (status offline + dirty) and recover when stub returns
import { spawn, execSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import http from 'node:http'
import { chromium } from 'playwright'

const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXEDIR = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows`
const EXE = `${EXEDIR}/ClaudeWeb.exe`
const OUT = `${ROOT}/.claudeweb-preview/playwright`
const PORT_A = 5230
const PORT_B = 5231
const STUB_PORT = 5312
const BASE_A = `http://localhost:${PORT_A}`
const BASE_B = `http://localhost:${PORT_B}`
const SYNC_URL = `http://localhost:${STUB_PORT}/exec`
const DATADIR_A = `${ROOT}/.claudeweb-preview/iso-datadir-ideasync-a`
const DATADIR_B = `${ROOT}/.claudeweb-preview/iso-datadir-ideasync-b`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }

const log = (...a) => console.log('[ideasync]', ...a)
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

// ---- the Apps Script stub ---------------------------------------------------
// State + counters live here; single-threaded node = LockService for free.
const stub = {
  rev: 0,
  store: { ideas: [], tombstones: [] },
  execHits: 0,
  postHits: 0,
  down: false,
  conflictOnce: false,
  bodies: new Map(), // token -> JSON payload served once at /body/<token>
  nextToken: 1,
}
function stubRespond(res, payload) {
  // The Apps Script shape: the /exec call answers 302 to a body URL that then
  // serves the JSON. Exercises the client's follow-redirect (+ POST->GET) path.
  const token = String(stub.nextToken++)
  stub.bodies.set(token, JSON.stringify(payload))
  res.writeHead(302, { Location: `http://localhost:${STUB_PORT}/body/${token}` })
  res.end()
}
const stubServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${STUB_PORT}`)
  if (url.pathname.startsWith('/body/')) {
    const body = stub.bodies.get(url.pathname.slice('/body/'.length))
    if (body === undefined) { res.writeHead(404); res.end() } else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(body) }
    return
  }
  if (url.pathname !== '/exec') { res.writeHead(404); res.end(); return }
  stub.execHits++
  if (stub.down) { req.socket.destroy(); return }
  if (req.method === 'GET') {
    stubRespond(res, { ok: true, rev: stub.rev, store: stub.store })
    return
  }
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    stub.postHits++
    const { baseRev, store } = JSON.parse(raw)
    if (stub.conflictOnce || baseRev !== stub.rev) {
      stub.conflictOnce = false
      stubRespond(res, { ok: false, conflict: true, rev: stub.rev, store: stub.store })
      return
    }
    stub.store = store
    stub.rev++
    stubRespond(res, { ok: true, rev: stub.rev, store: stub.store })
  })
})

// ---- harness lifecycle ------------------------------------------------------
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

  await new Promise((r) => stubServer.listen(STUB_PORT, r))
  log('stub up on', STUB_PORT)

  log('starting harness A + B (both unconfigured)…')
  await startHarness('A', PORT_A, DATADIR_A)
  await startHarness('B', PORT_B, DATADIR_B)

  // ---- 0: unconfigured => zero outbound sync calls --------------------------
  await sleep(8000)
  check(`unconfigured harnesses made zero sync calls (${stub.execHits})`, stub.execHits === 0)
  const s0 = await statusOf(BASE_A)
  check(`unconfigured status is disabled (${s0.state})`, s0.state === 'disabled')

  // ---- 1: configure A through the real sync bar UI --------------------------
  let uiConfigured = false
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
    check('unconfigured sync chip renders (set-up affordance)',
      (await chip.textContent()).length > 0)
    await chip.click()
    await page.locator('.ideas-sync__url').fill(SYNC_URL)
    // Scoped: the hub section (ideas-harness-hub) added a second
    // .ideas-sync__enable checkbox to the form.
    await page.locator('.ideas-sync__form-row .ideas-sync__enable input').check()
    await page.locator('.ideas-sync__form .idea__btn--primary').click()
    // The form collapses back to the chip, which should reach "Synced".
    await page.waitForFunction(() => {
      const c = document.querySelector('.ideas-sync__chip')
      return c && c.dataset.state === 'synced'
    }, { timeout: 20000 })
    check('chip shows synced after paste URL -> enable -> save', true)
    await page.screenshot({ path: join(OUT, 'ideas-sync-bar.png'), fullPage: true })
    await ctx.close()
    uiConfigured = true
  } catch (e) {
    check(`UI config path (${e.message})`, false)
  }
  if (!uiConfigured) {
    await api(BASE_A, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: SYNC_URL, pollSeconds: 5 })
  }
  const cfgA = await (await api(BASE_A, 'GET', '/notes/sync/config')).json()
  check('A config persisted (enabled + URL round-trip)', cfgA.enabled === true && cfgA.syncUrl === SYNC_URL)
  await api(BASE_A, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: SYNC_URL, pollSeconds: 5 })
  await api(BASE_B, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: SYNC_URL, pollSeconds: 5 })
  check('both synced after config', await waitFor('synced', async () =>
    (await statusOf(BASE_A)).state === 'synced' && (await statusOf(BASE_B)).state === 'synced'))

  // ---- 2: add on A propagates to B ------------------------------------------
  const noteA = await (await api(BASE_A, 'POST', '/notes', { text: 'sync-e2e: born on A', priority: 2 })).json()
  check('note created on A', !!noteA.id)
  check('A note arrives on B', await waitFor('propagate', async () =>
    (await notesOf(BASE_B)).some((n) => n.id === noteA.id)))

  // ---- 3: concurrent edit, newest UpdatedAt wins -----------------------------
  await api(BASE_A, 'PATCH', `/notes/${noteA.id}`, { text: 'sync-e2e: A-edit', priority: 2, active: false })
  await sleep(1200) // strictly later wall-clock on B's edit
  await api(BASE_B, 'PATCH', `/notes/${noteA.id}`, { text: 'sync-e2e: B-edit', priority: 2, active: false })
  check('LWW: both boxes converge on the newer (B) edit', await waitFor('lww', async () => {
    const a = (await notesOf(BASE_A)).find((n) => n.id === noteA.id)
    const b = (await notesOf(BASE_B)).find((n) => n.id === noteA.id)
    return a?.text === 'sync-e2e: B-edit' && b?.text === 'sync-e2e: B-edit'
  }))

  // ---- 4: forced CAS conflict re-merges and lands ----------------------------
  const postsBefore = stub.postHits
  stub.conflictOnce = true
  const noteB = await (await api(BASE_B, 'POST', '/notes', { text: 'sync-e2e: conflict survivor' })).json()
  check('conflicted push re-merges and lands on A', await waitFor('conflict', async () =>
    (await notesOf(BASE_A)).some((n) => n.id === noteB.id)))
  check(`conflict retry actually posted twice (${stub.postHits - postsBefore} posts)`,
    stub.postHits - postsBefore >= 2)

  // ---- 5: delete tombstone survives an offline box returning -----------------
  log('stopping B, deleting on A…')
  await stopHarness('B')
  const del = await api(BASE_A, 'DELETE', `/notes/${noteA.id}`)
  check(`delete on A accepted (${del.status})`, del.status === 200)
  check('delete pushed to the shared store', await waitFor('delpush', async () =>
    !(stub.store.ideas ?? stub.store.Ideas ?? []).some((n) => (n.id ?? n.Id) === noteA.id)))
  log('restarting B (same datadir — it still holds the deleted note)…')
  await startHarness('B', PORT_B, DATADIR_B)
  check('returning B learns the tombstone (note stays deleted)', await waitFor('tombstone', async () => {
    const b = await notesOf(BASE_B)
    return !b.some((n) => n.id === noteA.id) && b.some((n) => n.id === noteB.id)
  }))

  // ---- 6: offline edits queue + recover --------------------------------------
  stub.down = true
  const noteOff = await (await api(BASE_A, 'POST', '/notes', { text: 'sync-e2e: written offline' })).json()
  check('offline status surfaces (offline/error + dirty)', await waitFor('offline', async () => {
    const s = await statusOf(BASE_A)
    return (s.state === 'offline' || s.state === 'error') && s.dirty === true
  }, 20000))
  const sOff = await statusOf(BASE_A)
  check('offline error message never leaks the sync URL', !(sOff.lastError ?? '').includes(SYNC_URL))
  stub.down = false
  check('offline edit lands on B after recovery', await waitFor('recover', async () =>
    (await notesOf(BASE_B)).some((n) => n.id === noteOff.id)))
  check('A returns to synced after recovery', await waitFor('resynced', async () =>
    (await statusOf(BASE_A)).state === 'synced'))
} catch (e) {
  failures++
  log('FATAL:', e.message)
} finally {
  await browser.close().catch(() => {})
  await stopHarness('A')
  await stopHarness('B')
  stubServer.close()
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
