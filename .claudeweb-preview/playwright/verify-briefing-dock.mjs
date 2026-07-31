// Playwright dock check for openspec loop-agent-briefing (tasks.md 4.x), FULLY
// ISOLATED (:5233, own CLAUDEWEB_DATADIR). No CLI stub needed — the Briefing
// editor never spawns the CLI; it only reads/writes /api/autopilot/briefing.
// Robocopies the fresh client/dist into the Debug exe dir first — the exe-local
// dist SHADOWS the repo dist (see memory: isolated e2e stale dist).
//
//   A. The dock card shows the Briefing button with the seeded 2/2 count.
//   B. Opening it lists the seeded rules under the one-global-list note.
//   C. Adding a rule updates the list + count and bumps the server rev.
//   D. Unchecking parks the rule (off styling, count drops, server enabled=false).
//   E. The composed preview carries header + enabled rules, not the parked one,
//      plus the fixed verify note.
//   F. Tapping a rule edits it in place; Enter commits and persists.
//   G. Deleting returns the list to the seeded pair.
// Then, with the operator gate ON and the stream-json CLI simulator on PATH:
//   H. The queue-loop ARM PREVIEW (gated detail) shows the same composition the
//      engine will send: header + rules + separator above the verify template.
//   I. After a one-item drive drain, the sent-history row keeps the raw text
//      and wears the 📝 briefed badge (rev-stamped).
//   J. The chat bubble for the driven send shows the raw text + the honest
//      "briefing attached" tag, not the repeated prefix.
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import os from 'node:os'

const PORT = 5233
const BASE = `http://localhost:${PORT}`
const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXEDIR = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows`
const EXE = `${EXEDIR}/ClaudeWeb.exe`
const DATADIR = `${ROOT}/.claudeweb-preview/iso-datadir-brief-ui`
const SCRATCH = `${ROOT}/.claudeweb-preview/brief-ui-scratch`
const STUB = `${ROOT}/.claudeweb-preview/brief-ui-stub`
const CFG = join(STUB, 'stub-config.txt')
const OUT = `${ROOT}/.claudeweb-preview/playwright/out-brief-ui`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }
mkdirSync(OUT, { recursive: true })

const S1 = '77777777-7777-7777-7777-777777777771'
const TAB = 'brief-ui-tab-1'
const NEWRULE = 'Dock rule: never push without green tests.'
const RAWITEM = 'Dust the shelves in the reading room.'
const HEADER = '[Autopilot loop briefing]'

const log = (...a) => console.log('[brief-ui]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const api = (method, path, body) => fetch(`${BASE}/api${path}`, {
  method, headers: H, body: body ? JSON.stringify(body) : undefined,
})
const briefing = async () => (await api('GET', '/autopilot/briefing')).json()

const setStub = (mode, stepText, verifyText) =>
  writeFile(CFG, [mode, '-----', stepText, '-----', verifyText].join('\n'))

let child = null
async function startHarness() {
  const env = {
    ...process.env, CLAUDEWEB_PORT: String(PORT), CLAUDEWEB_DATADIR: DATADIR,
    STUBCLAUDE_CONFIG: CFG.replaceAll('/', '\\'),
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

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  })
  return r.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
}

const encodeCwd = (p) => p.replace(/[^A-Za-z0-9]/g, '-')
let seededDir = null

const browser = await chromium.launch()
try {
  await rm(DATADIR, { recursive: true, force: true })
  await rm(SCRATCH, { recursive: true, force: true })
  await rm(STUB, { recursive: true, force: true })
  await mkdir(DATADIR, { recursive: true })
  await mkdir(STUB, { recursive: true })

  // Fresh frontend into the exe dir (exe-local dist shadows the repo dist).
  execSync(`robocopy "${ROOT.replaceAll('/', '\\')}\\client\\dist" "${EXEDIR.replaceAll('/', '\\')}\\client\\dist" /MIR /NFL /NDL /NJH /NP & exit 0`, { shell: 'cmd.exe', stdio: 'ignore' })

  // Same stream-json CLI simulator as the API e2e (no prompt log needed here).
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
    '        System.Console.Out.Flush();',
    '        if (mode.EndsWith("-slow")) System.Threading.Thread.Sleep(8000);',
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
  await setStub('silent', '', '') // nothing consumes until the drive scenario

  // Gate ON: the arm-preview + sent-history surfaces live in the gated detail.
  await writeFile(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: true }))
  await writeFile(join(DATADIR, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: false, Threshold: 0.75, ArmedRepoIds: [], DenyList: ['dangerword'],
  }, null, 2))

  const repoPath = join(SCRATCH, 'briefUi')
  await mkdir(repoPath, { recursive: true })
  seededDir = join(os.homedir(), '.claude', 'projects', encodeCwd(repoPath))
  await mkdir(seededDir, { recursive: true })
  await writeFile(join(seededDir, `${S1}.jsonl`), JSON.stringify({
    type: 'assistant', timestamp: new Date(Date.now() - 300000).toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text: 'Idle and ready.' }] },
  }) + '\n')

  await startHarness()
  const repo = await (await api('POST', '/repos', { Folder: repoPath, Name: 'briefUi' })).json()
  await api('POST', '/dock', { id: TAB, repoId: repo.id, repoName: 'briefUi', sessionId: S1 })
  await api('POST', `/dock/${TAB}/stash`, { text: RAWITEM })

  const token = await login()
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1100 } })
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
  await ctx.addInitScript(() => {
    localStorage.setItem('claudeweb_ui_mode', 'advanced')
    localStorage.setItem('claudeweb_dash_view', 'phones')
    localStorage.setItem('claudeweb_dock_active', 'brief-ui-tab-1')
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log('PAGEERROR:', e.message))
  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(1500)
  if ((await page.locator('.dash').count()) === 0) {
    await page.keyboard.press('Control+Shift+D')
    await page.waitForSelector('.dash', { timeout: 5000 })
  }
  const card = page.locator('.phone', { has: page.locator('.phone__name:text-is("briefUi")') })
  await page.waitForSelector('.phone__brief-btn', { timeout: 10000 })
  const briefBtn = card.locator('.phone__brief-btn')

  // ---- A: button shows the seeded 2/2 count ---------------------------------
  await page.waitForFunction(() => document.querySelector('.phone__brief-btn')?.textContent.includes('/'), null, { timeout: 10000 })
  check(`button shows seeded 2/2 (got "${await briefBtn.textContent()}")`,
    (await briefBtn.textContent()).includes('2/2'))
  const seeded = await briefing()
  check(`server seeded at rev 1 (got rev ${seeded.rev})`, seeded.rev === 1)

  // ---- B: opening lists the seeded rules under the global note --------------
  await briefBtn.click()
  await page.waitForSelector('.phone__brief-pop', { timeout: 5000 })
  check('one-global-list note shown',
    (await card.locator('.phone__brief-pop .phone__loop-sect-desc').textContent()).includes('One global list'))
  check(`2 seeded rules listed (got ${await card.locator('.phone__brief-rule').count()})`,
    (await card.locator('.phone__brief-rule').count()) === 2)
  await page.screenshot({ path: join(OUT, '01-editor-open-seeded.png') })

  // ---- C: add a rule — list + count + server rev all move -------------------
  await card.locator('.phone__brief-add').fill(NEWRULE)
  await card.locator('.phone__brief-addrow .phone__loop-use').click()
  await page.waitForFunction(() => document.querySelectorAll('.phone__brief-rule').length === 3, null, { timeout: 10000 })
  check('added rule renders in the list',
    (await card.locator('.phone__brief-rule').allTextContents()).some((s) => s.includes('never push')))
  check(`button count moved to 3/3 (got "${await briefBtn.textContent()}")`,
    (await briefBtn.textContent()).includes('3/3'))
  const afterAdd = await briefing()
  check(`server rev bumped by the add (got ${afterAdd.rev})`, afterAdd.rev === 2)

  // ---- D: uncheck parks the rule -------------------------------------------
  await card.locator('.phone__brief-rule', { hasText: 'never push' }).locator('input[type=checkbox]').click()
  await page.waitForFunction(() => document.querySelectorAll('.phone__brief-rule--off').length === 1, null, { timeout: 10000 })
  check(`button count dropped to 2/3 (got "${await briefBtn.textContent()}")`,
    (await briefBtn.textContent()).includes('2/3'))
  const afterPark = await briefing()
  const parked = afterPark.rules.find((r) => r.text === NEWRULE)
  check('server stores the parked rule disabled', parked && parked.enabled === false)

  // ---- E: composed preview — header + enabled rules, parked absent ----------
  await card.locator('.phone__brief-pop .phone__loop-inspect-toggle').click()
  await page.waitForSelector('.phone__brief-pop .phone__loop-inspect-pre', { timeout: 5000 })
  const pres = await card.locator('.phone__brief-pop .phone__loop-inspect-pre').allTextContents()
  const work = pres[0] ?? ''
  check('preview opens with the briefing header', work.startsWith(HEADER))
  check('preview carries an enabled seeded rule', afterPark.rules.filter((r) => r.enabled).every((r) => work.includes(r.text)))
  check('preview omits the parked rule', !work.includes(NEWRULE))
  check('fixed verify note shown', (pres[1] ?? '').length > 0 && !(pres[1] ?? '').includes(NEWRULE))
  await page.screenshot({ path: join(OUT, '02-composed-preview.png') })

  // ---- F: tap-to-edit, Enter commits + persists -----------------------------
  const firstRule = card.locator('.phone__brief-rule').first()
  const originalText = (await firstRule.locator('.phone__brief-text').textContent()).trim()
  await firstRule.locator('.phone__brief-text').click()
  await page.waitForSelector('.phone__brief-edit', { timeout: 5000 })
  await firstRule.locator('.phone__brief-edit').fill(`${originalText} Edited live.`)
  await firstRule.locator('.phone__brief-edit').press('Enter')
  await page.waitForFunction(() => document.querySelector('.phone__brief-rule .phone__brief-text')?.textContent.includes('Edited live.'), null, { timeout: 10000 })
  const afterEdit = await briefing()
  check('edited text persisted server-side', afterEdit.rules.some((r) => r.text === `${originalText} Edited live.`))
  check(`edit bumped the rev again (got ${afterEdit.rev})`, afterEdit.rev === 4)

  // ---- G: delete returns to the seeded pair ---------------------------------
  await card.locator('.phone__brief-rule', { hasText: 'never push' }).locator('.phone__brief-del').click()
  await page.waitForFunction(() => document.querySelectorAll('.phone__brief-rule').length === 2, null, { timeout: 10000 })
  check(`button back to 2/2 (got "${await briefBtn.textContent()}")`,
    (await briefBtn.textContent()).includes('2/2'))
  const afterDel = await briefing()
  check('server dropped the deleted rule', !afterDel.rules.some((r) => r.text === NEWRULE))
  await page.screenshot({ path: join(OUT, '03-after-delete.png') })
  await briefBtn.click() // close the Briefing editor before the loop popover

  // ---- H: queue-loop ARM PREVIEW shows the live composition -----------------
  // BriefingRules' button/pop share the loop classes — scope with :not().
  const loopBtn = card.locator('.phone__loop-btn:not(.phone__brief-btn)')
  const loopPop = card.locator('.phone__loop-pop:not(.phone__brief-pop)')
  await loopBtn.click()
  await page.waitForSelector('.phone__loop-pop:not(.phone__brief-pop)', { timeout: 5000 })
  await loopPop.locator('.phone__loop-type', { hasText: 'Queue loop' }).click()
  await loopPop.locator('.phone__loop-inspect-toggle').click()
  await page.waitForSelector('.phone__loop-pop:not(.phone__brief-pop) .phone__loop-inspect-pre', { timeout: 10000 })
  const armPres = await loopPop.locator('.phone__loop-inspect-pre').allTextContents()
  const armWork = armPres[0] ?? ''
  check('arm preview leads with the briefing header', armWork.startsWith(HEADER))
  check('arm preview carries the enabled rules', afterDel.rules.filter((r) => r.enabled).every((r) => armWork.includes(r.text)))
  check('arm preview ends the frame with the separator', armWork.includes('--- The prompt follows. ---'))
  check('arm preview shows the fixed verify note too', armPres.some((s, i) => i > 0 && s.includes('automated loop')))
  await page.screenshot({ path: join(OUT, '04-arm-preview.png') })
  await loopBtn.click() // close before arming — arming re-renders the popover

  // ---- I: drive drain → sent-history row keeps raw text + briefed badge -----
  // -slow: the stub holds each CLI run open 8s so the dashboard's 5s
  // visible-page run poll can attach and stream the synthetic user event
  // (real runs last minutes; an instant stub falls between poll ticks).
  await setStub('nopersist-slow', 'Did the step, all good.', 'Checked it.\nSTEP_VERIFIED')
  const rArm = await api('POST', '/autopilot/loop', {
    repoId: repo.id, action: 'start', kind: 'queue', tabId: TAB,
    mode: 'drive', sessionId: S1, maxIterations: 10,
  })
  check(`queue loop armed in drive mode (${rArm.status})`, rArm.status === 200)
  let l = null
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    const loops = await (await api('GET', '/autopilot/loops')).json()
    l = (loops.loops ?? []).find((x) => x.repoId === repo.id)
    if (l && !l.active) break
    await sleep(1500)
  }
  check(`queue drained (${l?.status}/${l?.stopReason})`, l?.status === 'done' && l?.stopReason === 'drained')
  await loopBtn.click()
  await page.waitForSelector('.phone__loop-pop:not(.phone__brief-pop)', { timeout: 5000 })
  await loopPop.locator('.phone__loop-type', { hasText: 'Queue loop' }).click()
  await loopPop.locator('.phone__loop-inspect-toggle').click()
  await page.waitForSelector('.phone__loop-sent-list', { timeout: 10000 })
  const sentRow = loopPop.locator('.phone__loop-sent-row').first()
  check('sent row keeps the RAW stored text', ((await sentRow.textContent()) ?? '').includes(RAWITEM))
  check('sent row wears the briefed badge', (await sentRow.locator('.phone__loop-sent-briefed').count()) === 1)
  await page.screenshot({ path: join(OUT, '05-sent-briefed-badge.png') })

  // ---- J: chat bubble shows raw text + the honest briefed tag ---------------
  const bubble = card.locator('.msg--user', { hasText: 'Dust the shelves' }).first()
  await bubble.waitFor({ timeout: 30000 })
  check('driven send renders as a user bubble with the stored text', true)
  check('bubble wears the briefed tag, not the repeated prefix',
    (await bubble.locator('.msg__briefed').count()) === 1
    && !((await bubble.textContent()) ?? '').includes(HEADER))
  await page.screenshot({ path: join(OUT, '06-chat-bubble-briefed.png') })
  log('screenshots in out-brief-ui/: 01-editor-open-seeded, 02-composed-preview, 03-after-delete, 04-arm-preview, 05-sent-briefed-badge, 06-chat-bubble-briefed')
  await ctx.close()
} catch (e) {
  failures++
  log('FATAL:', e.stack || e.message)
} finally {
  await browser.close()
  await stopHarness()
  try {
    execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'claude.exe\'\\" | Where-Object { $_.CommandLine -match \'brief-ui\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"', { stdio: 'ignore' })
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
