// E2E for fix-ideas-sync-url-guidance, FULLY ISOLATED: one harness on :5243
// with a fresh data dir (default auth 'changeme', localhost seeded on the IP
// allowlist so the config API is reachable).
//
// Scenarios:
//   1. PUT sync config with a site-root URL (with and without scheme) → 400
//      with hub-path guidance, and the stored config is unchanged
//   2. Scheme-less FULL hub-shaped URL saves (normalized to https://…)
//   3. Sync pointed at a gated non-hub path → status lastError carries the
//      hub-path guidance, states "error" (not a raw HttpClient message), and
//      never contains the configured URL
//   4. Sync pointed at the instance's own real hub URL → reaches "synced"
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'

const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXE = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows/ClaudeWeb.exe`
const PORT = 5243
const BASE = `http://localhost:${PORT}`
const DATADIR = `${ROOT}/.claudeweb-preview/iso-datadir-sync-guard`
const AUTH = { 'X-Auth-Password': 'changeme', 'Content-Type': 'application/json' }

const log = (...a) => console.log('[sync-guard]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const putConfig = (body) => fetch(`${BASE}/api/notes/sync/config`, {
  method: 'PUT', headers: AUTH, body: JSON.stringify(body),
})
const getJson = (path) => fetch(`${BASE}${path}`, { headers: AUTH }).then((r) => r.json())

let child = null
try {
  await rm(DATADIR, { recursive: true, force: true })
  await mkdir(DATADIR, { recursive: true })

  child = spawn(EXE, [], {
    env: { ...process.env, CLAUDEWEB_PORT: String(PORT), CLAUDEWEB_DATADIR: DATADIR },
    detached: true, stdio: 'ignore',
  })
  child.unref()

  let up = false
  for (let i = 0; i < 40 && !up; i++) {
    await sleep(500)
    try { up = (await fetch(`${BASE}/api/health`)).ok } catch { /* not yet */ }
  }
  if (!up) throw new Error(`harness did not come up on ${PORT}`)

  // 1. Site-root URLs are rejected with guidance; config stays untouched.
  for (const bad of ['https://next5.example', 'next5.example', 'https://next5.example/']) {
    const res = await putConfig({ enabled: true, syncUrl: bad, pollSeconds: 5 })
    const body = res.status === 400 ? await res.json() : {}
    check(`root URL "${bad}" rejected with hub guidance (${res.status})`,
      res.status === 400 && /api\/notes\/hub\/<token>/.test(body.error || ''))
  }
  const cfgAfterBad = await getJson('/api/notes/sync/config')
  check('rejected URL was not persisted', !cfgAfterBad.syncUrl && !cfgAfterBad.enabled)

  // 2. Scheme-less FULL hub-shaped URL still saves, normalized to https.
  const okSave = await putConfig({ enabled: false, syncUrl: 'host.example/api/notes/hub/abc', pollSeconds: 5 })
  const okSaved = okSave.status === 200 ? await okSave.json() : {}
  check(`scheme-less full URL saves normalized (${okSaved.syncUrl})`,
    okSave.status === 200 && okSaved.syncUrl === 'https://host.example/api/notes/hub/abc')

  // 3. Gated non-hub path → guided error in status, no URL leak, state "error".
  const gatedUrl = `${BASE}/api/notes/hub-info`
  await putConfig({ enabled: true, syncUrl: gatedUrl, pollSeconds: 5 })
  let st = null
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    st = await getJson('/api/notes/sync/status')
    if (st.lastError) break
  }
  check(`gated path: state is "error", not offline/raw (${st?.state})`, st?.state === 'error')
  check('gated path: lastError carries hub-path guidance',
    /api\/notes\/hub\/<token>/.test(st?.lastError || ''))
  check('gated path: lastError does not leak the URL', !(st?.lastError || '').includes(gatedUrl))
  check('gated path: no raw HttpClient message',
    !/does not indicate success/.test(st?.lastError || ''))

  // 4. The instance's own real hub URL syncs to "synced".
  const hub = await (await fetch(`${BASE}/api/notes/hub-info`, {
    method: 'POST', headers: AUTH, body: JSON.stringify({ enabled: true }),
  })).json()
  check('hub enabled with a token', hub.enabled === true && !!hub.token)
  await putConfig({ enabled: true, syncUrl: `${BASE}/api/notes/hub/${hub.token}`, pollSeconds: 5 })
  let synced = null
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    synced = await getJson('/api/notes/sync/status')
    if (synced.state === 'synced') break
  }
  check(`real hub URL reaches synced (${synced?.state}, err=${synced?.lastError ?? 'none'})`,
    synced?.state === 'synced' && !synced?.lastError)
} catch (e) {
  failures++
  log('FATAL:', e.message)
} finally {
  if (child) { try { process.kill(child.pid) } catch { /* gone */ } }
  await sleep(1500)
  for (let i = 0; i < 5; i++) {
    try { await rm(DATADIR, { recursive: true, force: true }); break } catch { await sleep(2000) }
  }
}
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
