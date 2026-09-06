// Board task 9aaf5da2 (openspec codex-real-run), isolated instance: drive ONE builder
// turn on a throwaway git repo whose engine is `codex`, against the REAL codex-cli
// binary on this box. Without a Codex credential the turn must fail cleanly and
// legibly: a real thread id arrives as the session event, the transient
// "Reconnecting..." notices never surface as errors, exactly ONE error event carries
// the CLI's terminal message, turn.start/turn.ended carry provider=codex, and the
// harness log shows the argv the runner used. GET /api/codex-account must report the
// CLI as installed but not authenticated, naming the home the credential goes to.
const PORT = process.env.PORT || '5224'
const BASE = `http://127.0.0.1:${PORT}`, PW = process.env.PW || 'iso-codex-4474'
const LOG = process.env.LOG || ''
const REPO_ID = process.env.REPO_ID || ''
import fs from 'node:fs'

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const cookie = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
if (!cookie) { console.log('FATAL login', login.status); process.exit(1) }
const H = { Cookie: `claudeweb_session=${cookie}`, 'Content-Type': 'application/json' }
const checks = {}

// 1. Detection: the probe the dashboard chip polls.
const acct = await fetch(`${BASE}/api/codex-account`, { headers: H }).then((r) => r.json())
console.log('codex-account:', JSON.stringify(acct))
checks['codex-account: CLI detected (codexInstalled)'] = acct.codexInstalled === true
checks['codex-account: version reported'] = /^codex-cli \d+\.\d+\.\d+/.test(acct.version || '')
checks['codex-account: not authenticated (no credential on this box)'] = acct.authenticated === false
checks['codex-account: names the home the credential goes to'] = /\.codex$/i.test(acct.home || '') || !!process.env.CODEX_HOME

// 2. The throwaway repo is registered with engine codex.
const repos = await fetch(`${BASE}/api/repos`, { headers: H }).then((r) => r.json())
const list = Array.isArray(repos) ? repos : repos.repos || []
const target = list.find((r) => r.id === REPO_ID) || list.find((r) => r.provider === 'codex')
if (!target) { console.log('FATAL: no codex repo registered', list.map((r) => `${r.id}:${r.provider}`)); process.exit(1) }
checks['repo: engine is codex'] = target.provider === 'codex'
const RH = { ...H, 'X-Repo-Id': target.id }

const before = await fetch(`${BASE}/api/events?after=-1`, { headers: H }).then((r) => r.json())
const baseSeq = before.lastSeq

// 3. One builder-lane turn against the real binary. The POST is the SSE stream.
const logOffset = LOG && fs.existsSync(LOG) ? fs.statSync(LOG).size : 0
const t0 = Date.now()
const chat = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: RH, body: JSON.stringify({ message: 'Create a file hello.txt containing "hi" and commit it with message "codex hello".' }) })
const raw = await chat.text()
const secs = ((Date.now() - t0) / 1000).toFixed(1)
const events = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => { try { return JSON.parse(l.slice(5)) } catch { return null } }).filter(Boolean)
const types = events.map((e) => e.type)
console.log(`chat stream closed after ${secs}s; events:`, types.join(' '))
const session = events.find((e) => e.type === 'session')
const errors = events.filter((e) => e.type === 'error')
checks['turn: real thread id arrived as the session event (uuid)'] = !!session && /^[0-9a-f-]{36}$/i.test(session.sessionId || '')
checks['turn: exactly one error event (transient reconnect notices did not surface)'] = errors.length === 1
checks['turn: the error is the CLI terminal message (401 / not logged in)'] = errors.length === 1 && /401|unauthorized|login|api key/i.test(errors[0].message || '')
checks['turn: no done event without a credential'] = !types.includes('done')
console.log('error event:', JSON.stringify(errors[0] || null))

// 4. Lifecycle events carry the provider.
let started = null, ended = null
for (let i = 0; i < 20 && !ended; i++) {
  const feed = await fetch(`${BASE}/api/events?after=${baseSeq}`, { headers: H }).then((r) => r.json())
  started = (feed.events || []).find((e) => e.type === 'turn.start' && e.source?.repoId === target.id)
  ended = (feed.events || []).find((e) => e.type === 'turn.ended' && e.source?.repoId === target.id)
  if (!ended) await new Promise((r) => setTimeout(r, 500))
}
checks['feed: turn.start provider=codex'] = started?.data?.provider === 'codex'
checks['feed: turn.ended provider=codex, status=error'] = ended?.data?.provider === 'codex' && ended?.data?.status === 'error'
checks['feed: turn.ended carries the thread id'] = !!ended && !!session && ended.data?.sessionId === session.sessionId

// 5. Transcript evidence in the harness log: the runner started codex, the thread id
//    was captured, the notices were logged as notices, the failure as the verdict.
if (LOG && fs.existsSync(LOG)) {
  const log = fs.readFileSync(LOG).subarray(logOffset).toString('utf8') // only THIS turn's lines (byte offset — the log holds non-ASCII)
  const lines = log.split('\n').filter((l) => /\[CLI\]|\[CODEX/.test(l))
  console.log('--- harness log (codex lines) ---'); for (const l of lines.slice(-14)) console.log(l.trim())
  checks['log: runner started a codex session'] = /\[CLI\] Starting new session .* \(codex\)/.test(log)
  checks['log: thread id captured'] = /\[CODEX\] Thread id/.test(log)
  checks['log: reconnect notices logged as notices, not errors'] = /\[CODEX\] notice: Reconnecting/.test(log)
  checks['log: turn.failed logged as the error'] = /\[CODEX\] unexpected status 401|\[CODEX\] .*(401|login)/.test(log)
}

// 6. Nothing was written into the throwaway repo (the API refused before any tool ran).
if (process.env.REPO_PATH) {
  checks['repo: no hello.txt (the turn never reached a tool)'] = !fs.existsSync(`${process.env.REPO_PATH}/hello.txt`)
}

let pass = 0
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (v) pass++ }
console.log(`${pass}/${Object.keys(checks).length}`)
process.exit(pass === Object.keys(checks).length ? 0 : 1)
