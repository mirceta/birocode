// openspec arch-goal-conversations, isolated instance: a goal conversation is started
// from the API (suggest mode: no CLI turn is launched), drives the named agent and the
// task's assignee, is reported busy, refuses a second goal on a driven repo, queues an
// Operator message, is named "driven by arch goal" on the fleet status and the dock
// projection; a repo agent's event never wakes it (its loop waits for the quiet floor);
// stopping releases everything. Then the Management App shows the busy tab, the banner
// with the queue composer, and the Goal conversations card.
import { chromium } from 'playwright'

const PORT = process.env.PORT || '5221'
const BASE = `http://127.0.0.1:${PORT}`, PW = process.env.PW || 'iso-goals-4472'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) })
const get = (p) => fetch(BASE + p, { headers: H }).then(j)
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(j)
const patch = (p, b) => fetch(BASE + p, { method: 'PATCH', headers: H, body: JSON.stringify(b) }).then(j)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = {}

const repos = (await get('/api/repos')).body
const self = repos.find((r) => r.isSelf)
const prg = repos.find((r) => r.name.toLowerCase() === 'prg')
const fluent = repos.find((r) => r.name.toLowerCase() === 'fluent') || repos.find((r) => !r.isSelf && r.id !== prg.id)
const other = repos.find((r) => !r.isSelf && r.id !== prg.id && r.id !== fluent.id)
await post('/api/arch/scope', { repoIds: [prg.id, fluent.id, other.id], fleet: [] })
await post('/api/autopilot/config', { enabled: true }) // the engine's kill switch: off by default on a fresh data dir
console.log('scope', prg.name, fluent.name, other.name, 'self', self?.id?.slice(0, 8))

// Board: one task assigned to fluent (driven through the goal), one to `other`.
const owned = (await post('/api/taskgraph/nodes', { title: 'Owned task for the goal', repoId: fluent.id, x: 10, y: 10 })).body
const unowned = (await post('/api/taskgraph/nodes', { title: 'Unowned task', repoId: other.id, x: 10, y: 120 })).body

// Before any goal: the default conversation is free, nothing is busy.
const before = (await get('/api/arch/conversations')).body.conversations
checks['before: only the default conversation, not busy'] = before.length === 1 && before[0].isDefault && before[0].busy === false && before[0].goal === null

// Start a goal (suggest mode so the isolated instance never launches a CLI turn).
const started = await post('/api/arch/goals', { goal: 'Ship prg: every open task lands as a PR', repos: [prg.handle || prg.id], tasks: [owned.id], maxIterations: 3, mode: 'suggest' })
console.log('start', started.status, started.body?.status, started.body?.detail?.slice(0, 140))
const goal = started.body?.goal
checks['goal started with an id and its own conversation'] = started.status === 200 && !!goal?.id && /^@arch:/.test(goal?.conversation?.id || '')
checks['conversation is named after the goal'] = /^goal: Ship prg/.test(goal?.conversation?.name || '')
const ownKeys = (goal?.owns || []).map((o) => o.key)
checks['goal drives the named repo and the task assignee'] = ownKeys.includes(prg.id) && ownKeys.includes(fluent.id) && !ownKeys.includes(other.id)
checks['goal lists its task with status'] = (goal?.tasks || []).some((t) => t.id === owned.id && t.status === 'todo')
checks['goal is busy: loop active, poll interval reported'] = goal?.busy === true && goal?.loopActive === true && goal?.state === 'running' && goal?.pollSeconds >= 30
const convId = goal?.conversation?.id

// The conversations list and the conversation state carry the goal + busy.
const convs = (await get('/api/arch/conversations')).body.conversations
const gconv = convs.find((c) => c.id === convId)
checks['conversations list: the goal conversation is busy with the goal, the default is not'] = gconv?.busy === true && gconv?.goal?.id === goal.id && convs.find((c) => c.isDefault)?.busy === false
const st = (await get(`/api/arch?conv=${encodeURIComponent(convId)}`)).body
checks['conversation state: busy, goal loop armed'] = st?.busy === true && st?.goal?.id === goal.id && st?.loop?.kind === 'goal' && st?.loop?.active === true
checks['default state lists every goal'] = (await get('/api/arch')).body?.goals?.some((g) => g.id === goal.id)

// Exclusive: one running goal per agent.
const dup = await post('/api/arch/goals', { goal: 'another', repos: [prg.id], mode: 'suggest' })
checks['a second goal on a driven repo is refused as owned'] = dup.status === 400 && dup.body?.status === 'owned'
console.log('dup', dup.status, dup.body?.error?.slice(0, 100))

// Queue an Operator message for the busy conversation.
const q = await post(`/api/arch/goals/${goal.id}/message`, { text: 'Operator: prioritise the fluent task' })
checks['operator message is queued for the busy goal'] = q.status === 200 && q.body?.goal?.queued === 1

// Fleet status + dock projection name the goal.
const fs = (await get('/api/arch/fleet/status')).body
const selfMachine = fs.machines.find((m) => m.self)
const prgAgent = selfMachine?.agents.find((a) => a.repoId === prg.id)
const otherAgent = selfMachine?.agents.find((a) => a.repoId === other.id)
checks['fleet status: prg is driven by the goal, other is not'] = prgAgent?.goal?.id === goal.id && !otherAgent?.goal
const lp = (await get('/api/autopilot/loops')).body
checks['dock projection: goalOwners names prg'] = lp?.goalOwners?.[prg.id]?.goalId === goal.id && !lp?.goalOwners?.[other.id]

// Nothing on the feed wakes a goal conversation: in suggest mode the first poll is pended
// once; board changes and further ticks change nothing (no early wake, no second pend).
await sleep(12000)
await patch(`/api/taskgraph/nodes/${unowned.id}`, { status: 'doing' })
await patch(`/api/taskgraph/nodes/${owned.id}`, { status: 'doing' })
await sleep(12000)
const gst = (await get('/api/arch/goals')).body.goals.find((g) => g.id === goal.id)
const st2 = (await get(`/api/arch?conv=${encodeURIComponent(convId)}`)).body
console.log('goal after events: busy', gst?.busy, 'loopStatus', gst?.loopStatus, 'iterations', gst?.iterations, 'queued', gst?.queued, 'engine', st2?.engine?.decision, '-', st2?.engine?.reason)
checks['goal still running, nothing sent (suggest pends the first poll only)'] = gst?.busy === true && gst?.iterations === 0
checks['the pended poll is the goal prompt naming what it drives'] = /\(arch goal /.test(st2?.loop?.pendingPrompt || '') && /Nobody calls you/.test(st2?.loop?.pendingPrompt || '')
checks['default conversation has no loop and no pending prompt'] = !(await get('/api/arch')).body?.loop

// ---- the Management App ----
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('manageapp.layout', 'tabs') })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const manage = `${BASE}/api/localview/${self.id}/app/events-feed/manage/index.html?tab=arch:${encodeURIComponent(convId)}`
await page.goto(manage, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.locator('.mg__tabs').waitFor({ timeout: 20000 })
await page.locator(`[data-tab="arch:${convId}"]`).waitFor({ timeout: 20000 })
const tabText = await page.locator(`[data-tab="arch:${convId}"]`).innerText()
const tabBusy = await page.locator(`[data-tab="arch:${convId}"]`).getAttribute('data-busy')
console.log('tab:', tabText, 'busy attr', tabBusy)
checks['tab strip marks the goal conversation busy'] = tabBusy === 'goal' && /⏳/.test(tabText) && /goal: Ship prg/.test(tabText)
await page.locator('[data-goal-busy-banner]').waitFor({ timeout: 20000 })
const banner = await page.locator('[data-goal-busy-banner]').innerText()
console.log('banner:', banner.slice(0, 200))
checks['busy banner names the goal, what it drives and the poll'] = banner.includes(`busy: goal ${goal.id}`) && banner.includes('drives') && /prg/.test(banner) && /polls every/.test(banner)
checks['composer queues instead of sending, offers a new goal conversation'] = (await page.locator('[data-queue-goal]').count()) === 1 && (await page.locator('[data-new-goal]').count()) === 1
checks['header pill shows the goal'] = /busy: goal/.test(await page.locator('[data-goal-pill]').innerText())
await page.screenshot({ path: 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-arch-goal-busy.png' })
// Loops lane: the goal card with Stop.
await page.locator('[data-lane="loops"]').click()
await page.locator('[data-arch-goal-form]').waitFor({ timeout: 10000 })
checks['loops lane: the goal card shows the running goal with a stop button'] = (await page.locator('[data-stop-goal]').count()) === 1 && /busy: goal/.test(await page.locator('[data-goal-state]').innerText())
// Status tab: the Goal conversations card.
await page.locator('[data-tab="status"]').click()
await page.locator('[data-arch-goals]').waitFor({ timeout: 20000 })
await page.locator(`[data-arch-goals] [data-goal="${goal.id}"]`).waitFor({ timeout: 20000 }) // the state poll has landed
const goalsCard = await page.locator('[data-arch-goals]').innerText()
checks['status tab: Goal conversations card lists the goal busy'] = goalsCard.includes(`busy: goal ${goal.id}`) && /polls every/.test(goalsCard)
checks['status tab: no routing knobs (no legacy toggle, no inbox)'] = (await page.locator('[data-legacy-broadcast]').count()) === 0 && (await page.locator('[data-inbox-line]').count()) === 0
checks['status tab: the fleet chip says driven by the goal'] = (await page.locator(`[data-agent="${prg.id}"][data-goal="${goal.id}"]`).count()) === 1
await page.screenshot({ path: 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-arch-goal-status.png' })

// Stop: released, not busy, summary pending for the default conversation.
const stopped = await post(`/api/arch/goals/${goal.id}/stop`, {})
console.log('stop', stopped.status, stopped.body?.status)
const after = (await get('/api/arch/goals')).body.goals.find((g) => g.id === goal.id)
checks['stopped: goal not busy, state stopped, loop inactive'] = stopped.status === 200 && after?.busy === false && after?.state === 'stopped' && after?.loopActive === false
const fs2 = (await get('/api/arch/fleet/status')).body
checks['stopped: prg no longer driven by the goal'] = !fs2.machines.find((m) => m.self)?.agents.find((a) => a.repoId === prg.id)?.goal
const dup2 = await post('/api/arch/goals', { goal: 'again', repos: [prg.id], mode: 'suggest' })
checks['stopped: the repo can be driven by a new goal'] = dup2.status === 200 && dup2.body?.goal?.busy === true
await post(`/api/arch/goals/${dup2.body.goal.id}/stop`, {})
checks['no page errors'] = errors.length === 0

for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'ok ' : 'BAD'} ${k}`)
if (errors.length) console.log(errors.join('\n').slice(0, 500))
const pass = Object.values(checks).every(Boolean)
console.log(pass ? 'PASS' : 'FAIL')
await browser.close()
process.exit(pass ? 0 : 1)
