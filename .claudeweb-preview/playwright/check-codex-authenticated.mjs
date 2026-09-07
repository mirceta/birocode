// Board task 9aaf5da2 (openspec codex-real-run), the AUTHENTICATED leg — runs only once
// a Codex credential exists on the box. Against an isolated harness instance built from
// feature/codex-real-run and a throwaway git repo whose engine is codex:
//   1. GET /api/codex-account says logged in (else this check stops: BLOCKED);
//   2. one builder turn through the real codex.exe must open (session = thread id),
//      run tools, finish with `done`, and leave a real commit in the repo;
//   3. a second, resumed turn must continue the same thread (`codex exec resume`);
//   4. the ask lane must run read-only (no new commit);
//   5. MCP: the harness's stdio MCP translation is driven with a dependency-free probe
//      server (mcp-probe-server.mjs) through `codex exec --json -c mcp_servers.*`, the
//      exact overrides CodexCliAdapter emits — the tool must be called and its token
//      must appear in the agent's answer. (The harness offers repo agents no MCP tool
//      of its own except Birokrat, which needs a Birokrat key; see the report.)
// Evidence: the SSE event list, the harness log lines, `git log` of the repo, and the
// raw JSONL of the MCP probe run, all printed here.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const PORT = process.env.PORT || '5225'
const BASE = `http://127.0.0.1:${PORT}`, PW = process.env.PW || 'iso-codex-auth-4474'
const LOG = process.env.LOG || ''
const REPO_ID = process.env.REPO_ID || ''
const REPO_PATH = process.env.REPO_PATH || ''
const checks = {}
const sse = (raw) => raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => { try { return JSON.parse(l.slice(5)) } catch { return null } }).filter(Boolean)
const git = (...a) => spawnSync('git', ['-C', REPO_PATH, ...a], { encoding: 'utf8' }).stdout.trim()

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const cookie = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
if (!cookie) { console.log('FATAL login', login.status); process.exit(1) }
const H = { Cookie: `claudeweb_session=${cookie}`, 'Content-Type': 'application/json' }

// 1. credential present?
const acct = await fetch(`${BASE}/api/codex-account`, { headers: H }).then((r) => r.json())
console.log('codex-account:', JSON.stringify(acct))
if (!acct.authenticated) {
  console.log('BLOCKED: codex is not logged in on this box (' + (acct.error || '') + '). Nothing below can run.')
  process.exit(2)
}
checks['codex-account: logged in'] = true

const repos = await fetch(`${BASE}/api/repos`, { headers: H }).then((r) => r.json())
const list = Array.isArray(repos) ? repos : repos.repos || []
const target = list.find((r) => r.id === REPO_ID)
if (!target) { console.log('FATAL: throwaway repo not registered'); process.exit(1) }
checks['repo: engine is codex'] = target.provider === 'codex'
const RH = { ...H, 'X-Repo-Id': target.id }
const before = await fetch(`${BASE}/api/events?after=-1`, { headers: H }).then((r) => r.json())
const baseSeq = before.lastSeq
const headBefore = git('rev-parse', 'HEAD')
const logOffset = LOG && fs.existsSync(LOG) ? fs.statSync(LOG).size : 0

// 2. builder turn → commit
let t0 = Date.now()
let raw = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: RH, body: JSON.stringify({ message: 'In this git repository create a file hello.txt containing exactly the line "hi from codex", then run `git add hello.txt` and `git commit -m "codex hello"` (use -c user.name=codex -c user.email=codex@example.invalid). Reply with the new commit hash.' }) }).then((r) => r.text())
let ev = sse(raw); let types = ev.map((e) => e.type)
console.log(`turn 1 closed after ${((Date.now() - t0) / 1000).toFixed(1)}s; events:`, types.join(' '))
const session = ev.find((e) => e.type === 'session')
checks['turn 1: thread id arrived as session'] = !!session && /^[0-9a-f-]{36}$/i.test(session.sessionId || '')
checks['turn 1: tool events streamed (command_execution → shell)'] = ev.some((e) => e.type === 'tool' && e.name === 'shell')
checks['turn 1: done, no error'] = types.includes('done') && !types.includes('error')
const headAfter = git('rev-parse', 'HEAD')
checks['turn 1: a NEW commit exists in the repo'] = headAfter !== headBefore && headAfter.length === 40
checks['turn 1: the commit is "codex hello" with hello.txt'] = /codex hello/.test(git('log', '-1', '--format=%s')) && git('show', '--stat', '--format=', 'HEAD').includes('hello.txt')
console.log('git log:', git('log', '--oneline', '-3').replace(/\n/g, ' || '))
const answer = ev.filter((e) => e.type === 'token').map((e) => e.text).join('')
console.log('agent answer:', answer.slice(0, 300).replace(/\n/g, ' '))

// 3. resume the same thread
t0 = Date.now()
raw = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: RH, body: JSON.stringify({ message: 'What was the commit message you just made? Answer with the message only.', sessionId: session?.sessionId }) }).then((r) => r.text())
ev = sse(raw); types = ev.map((e) => e.type)
console.log(`turn 2 (resume) closed after ${((Date.now() - t0) / 1000).toFixed(1)}s; events:`, types.join(' '))
const answer2 = ev.filter((e) => e.type === 'token').map((e) => e.text).join('')
checks['turn 2: resumed thread remembers the commit'] = types.includes('done') && /codex hello/i.test(answer2)
console.log('resume answer:', answer2.slice(0, 200).replace(/\n/g, ' '))

// 4. ask lane is read-only
t0 = Date.now()
const headBeforeAsk = git('rev-parse', 'HEAD')
raw = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: RH, body: JSON.stringify({ message: 'Try to create a file readonly-probe.txt and commit it. If the sandbox forbids writing, say "WRITE BLOCKED".', lane: 'ask' }) }).then((r) => r.text())
ev = sse(raw); types = ev.map((e) => e.type)
console.log(`turn 3 (ask) closed after ${((Date.now() - t0) / 1000).toFixed(1)}s; events:`, types.join(' '))
checks['turn 3 (ask): no new commit, no readonly-probe.txt'] = git('rev-parse', 'HEAD') === headBeforeAsk && !fs.existsSync(path.join(REPO_PATH, 'readonly-probe.txt'))

// lifecycle events + log
let ended = []
for (let i = 0; i < 10 && ended.length < 3; i++) {
  const feed = await fetch(`${BASE}/api/events?after=${baseSeq}`, { headers: H }).then((r) => r.json())
  ended = (feed.events || []).filter((e) => e.type === 'turn.ended' && e.source?.repoId === target.id)
  if (ended.length < 3) await new Promise((r) => setTimeout(r, 500))
}
checks['feed: three turn.ended with provider=codex'] = ended.length === 3 && ended.every((e) => e.data?.provider === 'codex')
checks['feed: builder turn ended done'] = ended[0]?.data?.status === 'done'
if (LOG && fs.existsSync(LOG)) {
  const log = fs.readFileSync(LOG).subarray(logOffset).toString('utf8')
  const lines = log.split('\n').filter((l) => /\[CLI\]|\[CODEX|\[CHAT\] Engine/.test(l))
  console.log('--- harness log (codex lines) ---'); for (const l of lines.slice(0, 30)) console.log(l.trim())
  checks['log: three codex sessions started (new, resume, new)'] = (log.match(/\[CLI\] (Starting new|Resuming) session .*\(codex\)/g) || []).length === 3
  checks['log: [CODEX] Done for the builder turn'] = /\[CODEX\] Done: thread/.test(log)
}

// 5. MCP over the harness's exact overrides, driven directly on the real CLI
const probe = path.resolve('mcp-probe-server.mjs')
const token = 'PRB-' + Math.random().toString(36).slice(2, 10).toUpperCase()
const args = ['exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox',
  '-c', `mcp_servers.harness.command='node'`, '-c', `mcp_servers.harness.args=['${probe.replace(/\\/g, '/')}']`, '-c', `mcp_servers.harness.env={HARNESS_PROBE_TOKEN='${token}'}`,
  'Call the MCP tool harness_probe (server "harness") and reply with exactly the token it returns, nothing else.']
const cli = spawnSync(process.platform === 'win32' ? 'codex.cmd' : 'codex', args, { encoding: 'utf8', cwd: REPO_PATH, timeout: 180000, shell: process.platform === 'win32' })
const jsonl = (cli.stdout || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
console.log('--- MCP probe run (raw JSONL, first 12) ---'); for (const e of jsonl.slice(0, 12)) console.log(JSON.stringify(e).slice(0, 220))
const mcpItems = jsonl.filter((e) => e.item?.type === 'mcp_tool_call')
const finalMsg = jsonl.filter((e) => e.type === 'item.completed' && e.item?.type === 'agent_message').map((e) => e.item.text).join(' ')
checks['mcp: codex called harness.harness_probe (mcp_tool_call item)'] = mcpItems.some((e) => e.item.server === 'harness' && e.item.tool === 'harness_probe')
checks['mcp: the probe token came back through the tool'] = finalMsg.includes(token)
checks['mcp: turn.completed'] = jsonl.some((e) => e.type === 'turn.completed')
if (cli.stderr) console.log('probe stderr:', cli.stderr.split('\n').slice(0, 5).join(' | '))

let pass = 0
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (v) pass++ }
console.log(`${pass}/${Object.keys(checks).length}`)
process.exit(pass === Object.keys(checks).length ? 0 : 1)
