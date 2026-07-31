// E2E for the non-blocking FLAG: channel (docs/loop-driven-agent-convention.md,
// "Non-blocking flags"; no openspec — user opted out 2026-07-31), FULLY ISOLATED
// (:5237, own CLAUDEWEB_DATADIR). Same stream-json CLI simulator as the briefing
// e2e (nopersist: the engine judges the run's witnessed reply), with the prompt
// log so briefing-content checks read the text that actually reached the CLI.
//
//   A. Driven queue drain whose step replies carry FLAG: lines → GET /api/flags
//      holds them (marker stripped, case-insensitive, repo named), deduped
//      across the two replies that repeat the same gripe.
//   B. Item sends teach the FLAG line in the briefing; verification sends
//      (honesty note) do NOT.
//   C. API dismiss removes an entry; a later reply re-raising the dismissed
//      text records it fresh.
//   D. Browser (Advanced mode): the .flags-footer strip shows the open flags;
//      × dismisses one; dismissing the last one removes the footer entirely.
//   E. Controllability: dismissed flags land in the payload's dismissed history;
//      POST /flags/enabled false drops the teaching line from the briefing
//      preview AND from the actual driven send, and stops capture — a griping
//      reply records nothing while the channel is off.
//   F. Browser: the dock card's ⚑ badge lists this repo's open flags with
//      inline dismiss, and the Briefing popover's fixed FLAG row unchecks the
//      channel (server agrees).
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import os from 'node:os'

const PORT = 5237
const BASE = `http://localhost:${PORT}`
const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXEDIR = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows`
const EXE = `${EXEDIR}/ClaudeWeb.exe`
const DATADIR = `${ROOT}/.claudeweb-preview/iso-datadir-flags`
const SCRATCH = `${ROOT}/.claudeweb-preview/flags-scratch`
const STUB = `${ROOT}/.claudeweb-preview/flags-stub`
const CFG = join(STUB, 'stub-config.txt')
const PLOG = join(STUB, 'prompts.log')
const OUT = `${ROOT}/.claudeweb-preview/playwright/out-flags`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }
mkdirSync(OUT, { recursive: true })

const S1 = '66666666-6666-6666-6666-666666666661'
const TAB = 'flags-tab-1'
const FLAG1 = 'the port in appsettings is a guess'
const FLAG2 = 'the readme password looks stale'
const FLAG3 = 'new gripe three'
const HEADER = '[Autopilot loop briefing]'

const log = (...a) => console.log('[flags]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const api = (method, path, body) => fetch(`${BASE}/api${path}`, {
  method, headers: H, body: body ? JSON.stringify(body) : undefined,
})
const flagsPayload = async () => await (await api('GET', '/flags')).json()
const openFlags = async () => (await flagsPayload()).flags ?? []

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
  const state = await (await api('GET', '/autopilot/loops')).json()
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
const addItem = async (text) => (await (await api('POST', `/dock/${TAB}/stash`, { text })).json())

const browser = await chromium.launch()
try {
  await rm(DATADIR, { recursive: true, force: true })
  await rm(SCRATCH, { recursive: true, force: true })
  await rm(STUB, { recursive: true, force: true })
  await mkdir(DATADIR, { recursive: true })
  await mkdir(STUB, { recursive: true })

  // Fresh frontend into the exe dir (exe-local dist shadows the repo dist).
  execSync(`robocopy "${ROOT.replaceAll('/', '\\')}\\client\\dist" "${EXEDIR.replaceAll('/', '\\')}\\client\\dist" /MIR /NFL /NDL /NJH /NP & exit 0`, { shell: 'cmd.exe', stdio: 'ignore' })

  // The stream-json CLI simulator (nopersist + prompt log), byte-compatible
  // with the briefing e2e's stub.
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

  // Step replies gripe twice (one lowercase to prove case-insensitive line-start
  // matching end to end); verification replies confirm honestly, no flags.
  await setStub('nopersist',
    `Did the step.\nFLAG: ${FLAG1}\nflag: ${FLAG2}`,
    'Checked the work against the request.\nSTEP_VERIFIED')

  await writeFile(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: true }))
  await writeFile(join(DATADIR, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: false, Threshold: 0.75, ArmedRepoIds: [], DenyList: ['dangerword'],
  }, null, 2))

  repoPath = join(SCRATCH, 'flagsR')
  await mkdir(repoPath, { recursive: true })
  await seedTranscript('Seeded history, long before the arm.', Date.now() - 120000)

  log('starting isolated harness (simulator claude.exe on PATH)…')
  await startHarness()

  // ---- A: driven drain lifts FLAG lines into the ledger, deduped ------------
  const repo = await (await api('POST', '/repos', { Folder: repoPath, Name: 'flagsR' })).json()
  check('scratch repo registered', !!repo.id)
  const tabRes = await api('POST', '/dock', { Id: TAB, RepoId: repo.id, RepoName: 'flagsR', SessionId: S1 })
  check(`dock tab created (${tabRes.status})`, tabRes.ok)
  await addItem('Wire the retry cap on the drain worker.')
  await addItem('Add a health endpoint to the exporter.')
  const armQueue = () => api('POST', '/autopilot/loop', {
    repoId: repo.id, action: 'start', kind: 'queue', tabId: TAB,
    mode: 'drive', sessionId: S1, maxIterations: 20,
  })
  let r = await armQueue()
  check(`queue loop armed in drive mode (${r.status})`, r.status === 200)
  let l = await waitLoop(repo.id, (x) => !x.active)
  check(`queue drains (status ${l?.status}/${l?.stopReason})`, l?.status === 'done' && l?.stopReason === 'drained')

  let flags = await openFlags()
  check(`2 open flags after 2 same-griping replies — deduped (got ${flags.length})`, flags.length === 2)
  check('flag texts stored marker-stripped (case-insensitive match)',
    flags.some((f) => f.text === FLAG1) && flags.some((f) => f.text === FLAG2))
  check('flags carry the repo name + kind', flags.every((f) => f.repoName === 'flagsR' && f.kind === 'queue'))

  // ---- B: item sends teach FLAG, verification sends do not ------------------
  const prompts = await promptsSoFar()
  const itemPrompts = prompts.filter((p) => p.includes('Below is one item from a stored queue'))
  const verifyPrompts = prompts.filter((p) => p.includes('Review your previous turn'))
  check(`item + verify sends reached the CLI (${itemPrompts.length}/${verifyPrompts.length})`,
    itemPrompts.length === 2 && verifyPrompts.length === 2)
  check('item sends teach the FLAG line', itemPrompts.every((p) =>
    p.startsWith(HEADER) && p.includes('FLAG: <one short sentence>')))
  check('verification sends carry no FLAG teaching', verifyPrompts.every((p) => !p.includes('FLAG:')))

  // ---- C: dismiss, then a re-raised gripe records fresh ---------------------
  const victim = flags.find((f) => f.text === FLAG1)
  const dis = await api('POST', `/flags/${victim.id}/dismiss`)
  check(`dismiss accepted (${dis.status})`, dis.status === 200)
  flags = await openFlags()
  check(`1 open flag after dismiss (got ${flags.length})`, flags.length === 1 && flags[0].text === FLAG2)
  const dis404 = await api('POST', `/flags/${victim.id}/dismiss`)
  check(`double dismiss is 404 (${dis404.status})`, dis404.status === 404)

  await setStub('nopersist',
    `Done.\nFLAG: ${FLAG1}\nFLAG: ${FLAG3}`,
    'Checked the work against the request.\nSTEP_VERIFIED')
  await addItem('Step three: gripe again.')
  r = await armQueue()
  check(`re-armed (${r.status})`, r.status === 200)
  l = await waitLoop(repo.id, (x) => !x.active)
  check(`second drain (status ${l?.status}/${l?.stopReason})`, l?.status === 'done' && l?.stopReason === 'drained')
  flags = await openFlags()
  check(`dismissed gripe re-raised fresh + new one (got ${flags.length})`, flags.length === 3
    && flags.some((f) => f.text === FLAG1) && flags.some((f) => f.text === FLAG3))

  // ---- D: the footer strip in a real browser (Advanced mode) ----------------
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  })
  const session = loginRes.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
  check('logged in for a session cookie', !!session)
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'claudeweb_session', value: session, url: BASE }])
  await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'))
  const page = await ctx.newPage()
  // domcontentloaded, not networkidle: the shell's steady polls can keep the
  // network from ever going idle; the selector waits below gate readiness.
  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' })

  const footer = page.locator('.flags-footer')
  await footer.waitFor({ state: 'visible', timeout: 15000 })
  check('footer strip renders', await footer.isVisible())
  const items = footer.locator('.flags-footer__item')
  check(`footer lists the 3 open flags (got ${await items.count()})`, await items.count() === 3)
  check('footer shows a flag text + repo name',
    (await footer.textContent()).includes(FLAG3) && (await footer.textContent()).includes('flagsR'))
  await page.screenshot({ path: join(OUT, 'flags-footer.png'), fullPage: true })

  await footer.locator('.flags-footer__dismiss').first().click()
  await page.waitForFunction(() => document.querySelectorAll('.flags-footer__item').length === 2)
  check('footer dismiss removes one entry', await items.count() === 2)
  flags = await openFlags()
  check(`server agrees after UI dismiss (got ${flags.length})`, flags.length === 2)

  while (await items.count() > 0) {
    await footer.locator('.flags-footer__dismiss').first().click()
    await sleep(400)
  }
  await page.waitForFunction(() => !document.querySelector('.flags-footer'), null, { timeout: 10000 })
  check('empty ledger removes the footer entirely', !(await page.locator('.flags-footer').count()))
  await page.screenshot({ path: join(OUT, 'flags-footer-empty.png'), fullPage: true })
  await ctx.close()

  // ---- E: dismissed history + channel off stops teaching AND capture --------
  // 4 dismissed so far: FLAG1 via the API in section C + the 3 footer taps in D.
  let payload = await flagsPayload()
  check(`dismissals landed in the history, not the void (got ${payload.dismissed?.length})`,
    (payload.dismissed?.length ?? 0) === 4 && payload.dismissed.every((f) => f.dismissedAt))
  check('channel defaults enabled', payload.enabled === true)

  const off = await api('POST', '/flags/enabled', { enabled: false })
  check(`channel toggled off (${off.status})`, off.status === 200 && (await off.json()).enabled === false)
  let briefing = await (await api('GET', '/autopilot/briefing')).json()
  check('briefing payload reports flagsEnabled=false', briefing.flagsEnabled === false)
  check('composed work preview drops the FLAG teaching line', !briefing.workPreview.includes('FLAG:'))

  const promptCountBefore = (await promptsSoFar()).length
  await setStub('nopersist',
    'Done with the step.\nFLAG: this gripe must NOT be collected',
    'Checked the work against the request.\nSTEP_VERIFIED')
  await addItem('Step four: gripe into a disabled channel.')
  r = await armQueue()
  check(`re-armed with channel off (${r.status})`, r.status === 200)
  l = await waitLoop(repo.id, (x) => !x.active)
  check(`third drain (status ${l?.status}/${l?.stopReason})`, l?.status === 'done' && l?.stopReason === 'drained')
  const newPrompts = (await promptsSoFar()).slice(promptCountBefore)
  const offItemPrompts = newPrompts.filter((p) => p.includes('Below is one item from a stored queue'))
  check('channel-off item send carries NO FLAG teaching line',
    offItemPrompts.length === 1 && !offItemPrompts[0].includes('FLAG:'))
  flags = await openFlags()
  check(`griping reply recorded nothing while off (got ${flags.length})`, flags.length === 0)

  const on = await api('POST', '/flags/enabled', { enabled: true })
  check(`channel re-enabled (${on.status})`, on.status === 200 && (await on.json()).enabled === true)
  briefing = await (await api('GET', '/autopilot/briefing')).json()
  check('preview teaches FLAG again once re-enabled', briefing.workPreview.includes('FLAG:'))

  // ---- F: dock ⚑ badge + Briefing fixed row in a real browser ---------------
  await setStub('nopersist',
    'Done.\nFLAG: badge gripe for the dock card',
    'Checked the work against the request.\nSTEP_VERIFIED')
  await addItem('Step five: raise one flag for the badge.')
  r = await armQueue()
  check(`re-armed for the badge run (${r.status})`, r.status === 200)
  l = await waitLoop(repo.id, (x) => !x.active)
  check(`fourth drain (status ${l?.status}/${l?.stopReason})`, l?.status === 'done' && l?.stopReason === 'drained')
  flags = await openFlags()
  check(`1 open flag for the badge (got ${flags.length})`, flags.length === 1)

  const ctx2 = await browser.newContext({ viewport: { width: 1300, height: 1100 } })
  await ctx2.addCookies([{ name: 'claudeweb_session', value: session, url: BASE }])
  await ctx2.addInitScript((tab) => {
    localStorage.setItem('claudeweb_ui_mode', 'advanced')
    localStorage.setItem('claudeweb_dash_view', 'phones')
    localStorage.setItem('claudeweb_dock_active', tab)
  }, TAB)
  const page2 = await ctx2.newPage()
  page2.on('pageerror', (e) => log('PAGEERROR:', e.message))
  await page2.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page2.waitForTimeout(1500)
  if ((await page2.locator('.dash').count()) === 0) {
    await page2.keyboard.press('Control+Shift+D')
    await page2.waitForSelector('.dash', { timeout: 5000 })
  }
  const badge = page2.locator('.phone__flags-btn')
  await badge.waitFor({ state: 'visible', timeout: 15000 })
  check('dock card shows the ⚑ badge', (await badge.textContent()).includes('⚑ 1'))
  await badge.click()
  const items2 = page2.locator('.phone__flags-item')
  check(`badge popover lists the repo's open flag (got ${await items2.count()})`,
    await items2.count() === 1 && (await items2.first().textContent()).includes('badge gripe'))
  await page2.screenshot({ path: join(OUT, 'flags-dock-badge.png'), fullPage: true })
  await page2.locator('.phone__flags-dismiss').first().click()
  await page2.waitForFunction(() => !document.querySelector('.phone__flags-btn'), null, { timeout: 10000 })
  check('badge disappears once its last flag is dismissed', !(await page2.locator('.phone__flags-btn').count()))
  flags = await openFlags()
  check(`server agrees after badge dismiss (got ${flags.length})`, flags.length === 0)

  // The Briefing popover's fixed FLAG row switches the channel.
  await page2.locator('.phone__brief-btn').first().click()
  const fixedRow = page2.locator('.phone__brief-rule--fixed input')
  await fixedRow.waitFor({ state: 'visible', timeout: 10000 })
  check('fixed FLAG row is checked while the channel is on', await fixedRow.isChecked())
  await fixedRow.click()
  await page2.waitForFunction(() => {
    const el = document.querySelector('.phone__brief-rule--fixed input')
    return el && !el.checked && !el.disabled
  }, null, { timeout: 10000 })
  payload = await flagsPayload()
  check('unchecking the fixed row turned the channel off server-side', payload.enabled === false)
  await page2.screenshot({ path: join(OUT, 'flags-briefing-toggle.png'), fullPage: true })
  await ctx2.close()
} catch (e) {
  failures++
  log('FATAL:', e.stack || e.message)
} finally {
  await browser.close()
  await stopHarness()
  try {
    execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'claude.exe\'\\" | Where-Object { $_.CommandLine -match \'flags\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"', { stdio: 'ignore' })
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
