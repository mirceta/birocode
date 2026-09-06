// openspec board-claims-advisory, isolated instance on a COPY of the live board (real gh):
// the nine merged cards stuck at doing land at pr-merged / done with no warning after one
// re-verify pass; a claim moves a card exactly where it says (no clamp) and the badge
// follows the verified state; the Kanban shows "⚠ unverified" and the Re-verify button.
import { chromium } from 'playwright'

const PORT = process.env.PORT || '5222'
const BASE = `http://127.0.0.1:${PORT}`, PW = process.env.PW || 'iso-board-4473'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) })
const get = (p) => fetch(BASE + p, { headers: H }).then(j)
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(j)
const patch = (p, b) => fetch(BASE + p, { method: 'PATCH', headers: H, body: JSON.stringify(b) }).then(j)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = {}
const NINE = ['bed0f74a', 'ce4eba2c', '3c79fbec', '20ba36e5', '379f58b3', '76ee2c86', 'f9756383', 'f12f11af', '50e8275e']
const short = (id) => id.slice(0, 8)
const table = (nodes) => nodes.filter((n) => NINE.includes(short(n.id))).sort((a, b) => NINE.indexOf(short(a.id)) - NINE.indexOf(short(b.id)))
  .map((n) => `| ${short(n.id)} | ${n.prNumber ? '#' + n.prNumber : '-'} | ${n.status} | ${n.verifiedStatus || '-'} | ${n.mergeCommit ? n.mergeCommit.slice(0, 7) : '-'} | ${n.warning || '-'} |`).join('\n')

const repos = (await get('/api/repos')).body
const self = repos.find((r) => r.isSelf)
const before = (await get('/api/taskgraph')).body.nodes
const stuck = table(before)
console.log('BEFORE\n| card | PR | status | verified | merge | warning |\n|---|---|---|---|---|---|\n' + stuck)
// Informational only: the startup pass (openspec board-verify-remote) may already have run by the time this reads.
console.log('nine cards present:', before.filter((n) => NINE.includes(short(n.id))).length, '· still at doing:', before.filter((n) => NINE.includes(short(n.id)) && n.status === 'doing').length)

// One re-verify pass (real gh against GitHub; liveness judged in this hub's own clone).
const t0 = Date.now()
const v = await post('/api/taskgraph/verify', {})
console.log(`verify: ${v.status} checked=${v.body?.checked} probed=${v.body?.probed} moved=${(v.body?.changes || []).length} in ${Date.now() - t0} ms; notes: ${(v.body?.notes || []).slice(0, 3).join(' | ')}`)
const after = (await get('/api/taskgraph')).body.nodes
const nine = after.filter((n) => NINE.includes(short(n.id)))
console.log('AFTER\n| card | PR | status | verified | merge | warning |\n|---|---|---|---|---|---|\n' + table(after))
checks['re-verify moved the nine cards to pr-merged or done'] = nine.length === 9 && nine.every((n) => n.status === 'pr-merged' || n.status === 'done')
checks['the nine cards carry no warning'] = nine.every((n) => !n.warning)
checks['the nine cards carry their PR number and merge commit'] = nine.every((n) => n.prNumber && n.mergeCommit)
checks['verified status covers the status on all nine'] = nine.every((n) => n.verifiedStatus === n.status)

// A second pass moves nothing (idempotent).
const v2 = await post('/api/taskgraph/verify', {})
checks['a second pass moves nothing'] = (v2.body?.changes || []).length === 0

// The claim path (same UpdateNode the arch's update_task takes): a fresh card claimed
// pr-merged with nothing verified stays pr-merged, badged; back to doing clears it.
const fresh = (await post('/api/taskgraph/nodes', { title: 'Advisory claim check', repoId: self.id, x: 5, y: 5 })).body
const claimed = (await patch(`/api/taskgraph/nodes/${fresh.id}`, { status: 'pr-merged' })).body
console.log('claim →', claimed?.status, '|', claimed?.warning)
checks['a claim moves the card exactly where it says (pr-merged, not clamped)'] = claimed?.status === 'pr-merged'
checks['the card is badged with claim vs verified'] = /^claimed pr-merged, verified: nothing/.test(claimed?.warning || '')
const back = (await patch(`/api/taskgraph/nodes/${fresh.id}`, { status: 'doing' })).body
checks['backward is free and clears the badge'] = back?.status === 'doing' && !back?.warning
await patch(`/api/taskgraph/nodes/${fresh.id}`, { status: 'done' })
const v3 = await post('/api/taskgraph/verify', {})
const stillDone = (await get('/api/taskgraph')).body.nodes.find((n) => n.id === fresh.id)
checks['a claimed done with no PR is checked, kept done and stays badged'] = stillDone?.status === 'done' && /^claimed done, verified: nothing/.test(stillDone?.warning || '') && (v3.body?.checked || 0) >= 1

// ---- the Management App Kanban ----
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('manageapp.layout', 'tabs') })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/api/localview/${self.id}/app/events-feed/manage/index.html?tab=kanban`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.locator('[data-kanban]').waitFor({ timeout: 20000 })
await page.locator(`[data-task="${fresh.id}"]`).waitFor({ timeout: 20000 })
const chip = page.locator(`[data-task="${fresh.id}"] [data-unverified]`)
checks['kanban: the claimed card shows the unverified badge'] = (await chip.count()) === 1 && /unverified/.test(await chip.innerText()) && /claimed done/.test(await chip.getAttribute('title') || '')
checks['kanban: the Re-verify board button is there'] = (await page.locator('[data-reverify]').count()) === 1
checks['kanban: none of the nine cards is badged'] = (await page.locator(NINE.map((id) => `[data-task^="${id}"] [data-unverified]`).join(', ')).count()) === 0
await page.screenshot({ path: 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-board-advisory.png' })
checks['no page errors'] = errors.length === 0

for (const [k, val] of Object.entries(checks)) console.log(`${val ? 'ok ' : 'BAD'} ${k}`)
if (errors.length) console.log(errors.join('\n').slice(0, 500))
const pass = Object.values(checks).every(Boolean)
console.log(pass ? 'PASS' : 'FAIL')
await browser.close()
process.exit(pass ? 0 : 1)
