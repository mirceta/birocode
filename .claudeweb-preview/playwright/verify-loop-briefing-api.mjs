// E2E for openspec loop-agent-briefing, FULLY ISOLATED (:5228, own
// CLAUDEWEB_DATADIR). The stub claude.exe is the same CLI simulator as the
// stale-reply e2e (stream-json, echoes the resumed session id, never persists
// a transcript) plus one addition: it APPENDS every prompt it receives to
// STUBCLAUDE_LOG — so these checks assert on the text that actually reached
// the CLI, not on projections.
//
//   A. Briefing API: seeded draft-v1 rules at rev 1; PUT (add enabled rule +
//      parked idea) bumps the rev and round-trips.
//   B. Queue drive: item sends carry frame + enabled rules + queue contract +
//      separator + raw item; the parked rule is absent; verification sends
//      carry the honesty note and NO act-pressure rules; sent-history records
//      raw text stamped with the rules rev; detail discloses the briefing.
//   C. An unaccomplished step still escalates step-unverified under the
//      briefing (the act posture must not weaken verification).
//   D. Recipe send with a custom sentinel cites that sentinel in its contract
//      line and still resolves done on it.
//   E. Suggest mode pends the RAW stored text — no briefing attached.
import { spawn, execSync } from 'node:child_process'
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'

const PORT = 5228
const BASE = `http://localhost:${PORT}`
const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXE = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows/ClaudeWeb.exe`
const DATADIR = `${ROOT}/.claudeweb-preview/iso-datadir-briefing`
const SCRATCH = `${ROOT}/.claudeweb-preview/briefing-scratch`
const STUB = `${ROOT}/.claudeweb-preview/briefing-stub`
const CFG = join(STUB, 'stub-config.txt')
const PLOG = join(STUB, 'prompts.log')
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }

const S1 = '88888888-8888-8888-8888-888888888881'
const TAB = 'brief-tab-1'
const HEADER = '[Autopilot loop briefing]'
const SEPARATOR = '--- The prompt follows. ---'

const log = (...a) => console.log('[brief]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = (p, body) => fetch(`${BASE}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
const put = (p, body) => fetch(`${BASE}${p}`, { method: 'PUT', headers: H, body: JSON.stringify(body) })
const get = (p) => fetch(`${BASE}${p}`, { headers: H })

const setStub = (mode, stepText, verifyText) =>
  writeFile(CFG, [mode, '-----', stepText, '-----', verifyText].join('\n'))
const promptsSoFar = async () => {
  try { return (await readFile(PLOG, 'utf8')).split('-----PROMPT-----\n').map((s) => s.trim()).filter(Boolean) }
  catch { return [] }
}

let child = null
async function startHarness() {
  const env = {
    ...process.env, CLAUDEWEB_PORT: String(PORT), CLAUDEWEB_DATADIR: DATADIR,
    STUBCLAUDE_CONFIG: CFG.replaceAll('/', '\\'), STUBCLAUDE_LOG: PLOG.replaceAll('/', '\\'),
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
let repoPath = null
async function seedTranscript(text, atMs) {
  seededDir = join(os.homedir(), '.claude', 'projects', encodeCwd(repoPath))
  await mkdir(seededDir, { recursive: true })
  await writeFile(join(seededDir, `${S1}.jsonl`), JSON.stringify({
    type: 'assistant', timestamp: new Date(atMs).toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  }) + '\n')
}

async function loopOf(repoId) {
  const state = await (await get('/api/autopilot/loops')).json()
  return (state.loops ?? []).find((l) => l.repoId === repoId)
}
async function waitLoop(repoId, pred, timeoutMs = 180000) {
  const until = Date.now() + timeoutMs
  let last = null
  while (Date.now() < until) {
    last = await loopOf(repoId)
    if (last && pred(last)) return last
    await sleep(1000)
  }
  return last
}
const addItem = async (text) => (await (await post(`/api/dock/${TAB}/stash`, { text })).json())

try {
  await rm(DATADIR, { recursive: true, force: true })
  await rm(SCRATCH, { recursive: true, force: true })
  await rm(STUB, { recursive: true, force: true })
  await mkdir(DATADIR, { recursive: true })
  await mkdir(STUB, { recursive: true })

  const stubCs = join(STUB, 'stub.cs')
  const stubExe = join(STUB, 'claude.exe').replaceAll('/', '\\')
  await writeFile(stubCs, [
    'public class P {',
    '    static string Esc(string s) {',
    '        return s.Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\"").Replace("\\r", "\\\\r").Replace("\\n", "\\\\n");',
    '    }',
    '    public static int Main(string[] args) {',
    '        string sid = null, prompt = null;',
    '        for (int i = 0; i < args.Length - 1; i++) {',
    '            if (args[i] == "--resume") sid = args[i + 1];',
    '            if (args[i] == "-p") prompt = args[i + 1];',
    '        }',
    '        string logPath = System.Environment.GetEnvironmentVariable("STUBCLAUDE_LOG");',
    '        if (logPath != null && prompt != null) System.IO.File.AppendAllText(logPath, "-----PROMPT-----\\n" + prompt + "\\n");',
    '        string cfgPath = System.Environment.GetEnvironmentVariable("STUBCLAUDE_CONFIG");',
    '        string cfg = (cfgPath != null && System.IO.File.Exists(cfgPath)) ? System.IO.File.ReadAllText(cfgPath) : "silent";',
    '        string[] parts = cfg.Replace("\\r\\n", "\\n").Split(new string[] { "\\n-----\\n" }, System.StringSplitOptions.None);',
    '        string mode = parts[0].Trim();',
    '        string stepText = parts.Length > 1 ? parts[1] : "";',
    '        string verifyText = parts.Length > 2 ? parts[2] : "";',
    '        if (mode == "silent") return 1;',
    '        bool isVerify = prompt != null && prompt.Contains("Review your previous turn");',
    '        string text = isVerify ? verifyText : stepText;',
    '        string tail = sid == null ? "" : ",\\"session_id\\":\\"" + sid + "\\"";',
    '        System.Console.WriteLine("{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"model\\":\\"stub-claude\\"" + tail + "}");',
    '        int mid = text.Length / 2;',
    '        string[] chunks = new string[] { text.Substring(0, mid), text.Substring(mid) };',
    '        foreach (string c in chunks) {',
    '            if (c.Length == 0) continue;',
    '            System.Console.WriteLine("{\\"type\\":\\"stream_event\\",\\"event\\":{\\"type\\":\\"content_block_delta\\",\\"delta\\":{\\"type\\":\\"text_delta\\",\\"text\\":\\"" + Esc(c) + "\\"}}}");',
    '        }',
    '        System.Console.WriteLine("{\\"type\\":\\"result\\",\\"subtype\\":\\"success\\",\\"is_error\\":false,\\"total_cost_usd\\":0.0,\\"num_turns\\":1" + tail + "}");',
    '        return 0;',
    '    }',
    '}',
  ].join('\n'))
  execSync(`powershell -NoProfile -Command "Add-Type -Path '${stubCs.replaceAll('/', '\\\\')}' -OutputType ConsoleApplication -OutputAssembly '${stubExe}'"`, { stdio: 'inherit' })
  await stat(join(STUB, 'claude.exe'))
  await setStub('nopersist', 'Did the step, all good.', 'Checked the work against the request.\nSTEP_VERIFIED')

  await writeFile(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: true }))
  await writeFile(join(DATADIR, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: false, Threshold: 0.75, ArmedRepoIds: [], DenyList: ['dangerword'],
  }, null, 2))

  repoPath = join(SCRATCH, 'briefR')
  await mkdir(repoPath, { recursive: true })
  await seedTranscript('Seeded history, long before the arm.', Date.now() - 120000)

  log('starting isolated harness (simulator claude.exe on PATH)…')
  await startHarness()

  // ---- A: briefing rules API ------------------------------------------------
  let b = await (await get('/api/autopilot/briefing')).json()
  check(`briefing seeded with 2 draft-v1 rules (got ${b.rules?.length})`, b.rules?.length === 2)
  check(`seeded rules enabled at rev ${b.rev}`, b.rev >= 1 && b.rules.every((r) => r.enabled))
  check('frame disclosed (header + verify note + separator)',
    b.frame?.header === HEADER && (b.frame?.verifyNote ?? '').includes('Judge honestly')
    && b.frame?.separator === SEPARATOR)
  check('workPreview composes frame + rules', (b.workPreview ?? '').startsWith(HEADER)
    && b.workPreview.includes('Do the work in this turn') && b.workPreview.includes('NEEDS_HUMAN'))
  const seededRev = b.rev
  const putRes = await put('/api/autopilot/briefing', {
    rules: [
      ...b.rules.map((r) => ({ id: r.id, text: r.text, enabled: r.enabled })),
      { text: 'Custom rule alpha: commit finished work before moving on.', enabled: true },
      { text: 'Parked idea beta: never send this line.', enabled: false },
    ],
  })
  b = await putRes.json()
  check(`PUT accepted (${putRes.status})`, putRes.status === 200)
  check(`PUT bumped rev ${seededRev} -> ${b.rev}`, b.rev === seededRev + 1)
  check(`4 rules stored (got ${b.rules?.length})`, b.rules?.length === 4)
  check('parked idea kept but disabled', b.rules.some((r) => r.text.includes('Parked idea beta') && !r.enabled))
  check('workPreview picks up the new enabled rule and not the parked one',
    b.workPreview.includes('Custom rule alpha') && !b.workPreview.includes('Parked idea beta'))
  const rev = b.rev

  // ---- B: queue drive — briefed items, honest verify, stamped history -------
  const repo = await (await post('/api/repos', { Folder: repoPath, Name: 'briefR' })).json()
  check('scratch repo registered', !!repo.id)
  const tabRes = await post('/api/dock', { Id: TAB, RepoId: repo.id, RepoName: 'briefR', SessionId: S1 })
  check(`dock tab created (${tabRes.status})`, tabRes.ok)
  const armQueue = (extra = {}) => post('/api/autopilot/loop', {
    repoId: repo.id, action: 'start', kind: 'queue', tabId: TAB,
    mode: 'drive', sessionId: S1, maxIterations: 20, ...extra,
  })

  const ITEM1 = 'Wire up the retry cap on the drain worker.'
  const ITEM2 = 'Add a health endpoint to the exporter.'
  await addItem(ITEM1)
  await addItem(ITEM2)
  let r = await armQueue()
  check(`queue loop armed in drive mode (${r.status})`, r.status === 200)
  let l = await waitLoop(repo.id, (x) => !x.active)
  check(`queue drains (status ${l?.status}/${l?.stopReason})`, l?.status === 'done' && l?.stopReason === 'drained')

  let prompts = await promptsSoFar()
  const itemPrompts = prompts.filter((p) => p.includes('Below is one item from a stored queue'))
  const verifyPrompts = prompts.filter((p) => p.includes('Review your previous turn'))
  check(`2 briefed item sends reached the CLI (got ${itemPrompts.length})`, itemPrompts.length === 2)
  check('item sends start with the briefing header', itemPrompts.every((p) => p.startsWith(HEADER)))
  check('item sends carry the enabled rules', itemPrompts.every((p) =>
    p.includes('Do the work in this turn') && p.includes('Custom rule alpha')))
  check('item sends do NOT carry the parked rule', itemPrompts.every((p) => !p.includes('Parked idea beta')))
  check('item sends carry escalation + separator then the RAW item', itemPrompts.every((p) =>
    p.includes('NEEDS_HUMAN') && p.includes(SEPARATOR)
    && (p.endsWith(ITEM1) || p.endsWith(ITEM2))))
  check(`2 verification sends reached the CLI (got ${verifyPrompts.length})`, verifyPrompts.length === 2)
  check('verify sends carry the honesty note, not the work rules', verifyPrompts.every((p) =>
    p.startsWith(HEADER) && p.includes('Judge honestly')
    && !p.includes('Do the work in this turn') && !p.includes('Custom rule alpha')))

  const detail = await (await get('/api/autopilot/loops/detail')).json()
  const mine = (detail.loops ?? []).find((x) => x.repoId === repo.id)
  check('sent-history keeps RAW item texts', JSON.stringify(mine?.queueSentTexts) === JSON.stringify([ITEM1, ITEM2]))
  check(`sent-history stamps the rules rev (${JSON.stringify(mine?.queueSentRevs)})`,
    JSON.stringify(mine?.queueSentRevs) === JSON.stringify([rev, rev]))
  check('detail discloses the briefing composition',
    detail.briefing?.rev === rev && (detail.briefing?.workPreview ?? '').includes('Custom rule alpha'))

  // ---- C: unaccomplished step still escalates under the briefing ------------
  await setStub('nopersist', 'Attempted the doomed step.',
    'I hit a blocker: the build fails. What should I do?')
  await addItem('Step three: the doomed one.')
  r = await armQueue()
  check(`re-armed for the escalate branch (${r.status})`, r.status === 200)
  l = await waitLoop(repo.id, (x) => !x.active)
  check(`unaccomplished step still escalates (status ${l?.status}/${l?.stopReason})`,
    l?.status === 'escalate' && l?.stopReason === 'step-unverified')

  // ---- D: recipe send cites its CUSTOM sentinel -----------------------------
  await setStub('nopersist', 'All finished.\nDONE_MAGIC', 'unused')
  r = await post('/api/autopilot/loop', {
    repoId: repo.id, action: 'start', prompt: 'Run the special ritual end to end.',
    sentinel: 'DONE_MAGIC', mode: 'drive', sessionId: S1, maxIterations: 5,
  })
  check(`recipe loop armed with custom sentinel (${r.status})`, r.status === 200)
  l = await waitLoop(repo.id, (x) => !x.active)
  check(`recipe resolves done on its custom sentinel (${l?.status}/${l?.stopReason})`,
    l?.status === 'done' && l?.stopReason === 'sentinel')
  prompts = await promptsSoFar()
  const recipePrompts = prompts.filter((p) => p.includes('Run the special ritual'))
  check(`recipe send(s) reached the CLI (got ${recipePrompts.length})`, recipePrompts.length >= 1)
  check('recipe briefing cites the custom sentinel in its contract line',
    recipePrompts.every((p) => p.startsWith(HEADER) && p.includes('exact final line: DONE_MAGIC')))

  // ---- E: suggest mode pends RAW text, no briefing --------------------------
  const RAWITEM = 'Suggest-mode raw item, must stay unbriefed.'
  await addItem(RAWITEM)
  r = await armQueue({ mode: 'suggest' })
  check(`queue re-armed in suggest mode (${r.status})`, r.status === 200)
  l = await waitLoop(repo.id, (x) => !!x.pendingPrompt, 60000)
  check('suggest mode pends the raw stored text', l?.pendingPrompt === RAWITEM)
  check('pending text carries no briefing', !(l?.pendingPrompt ?? '').includes(HEADER))
  await post('/api/autopilot/loop', { repoId: repo.id, action: 'disarm' })
} catch (e) {
  failures++
  log('FATAL:', e.stack || e.message)
} finally {
  await stopHarness()
  try {
    execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'claude.exe\'\\" | Where-Object { $_.CommandLine -match \'briefing\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"', { stdio: 'ignore' })
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
}
log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
