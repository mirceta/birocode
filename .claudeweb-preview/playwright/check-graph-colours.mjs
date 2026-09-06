// openspec taskgraph-colours, isolated instance: tasks on two machines (self + a
// fleet source) and two repositories → nodes carry machine (border) and repo
// (background) hues; unassigned nodes stay neutral; the "Machines" and
// "Repositories" legends are present, sit above the canvas and do not move when
// the graph is panned; a legend click focuses (dims the others); no machine boxes
// are rendered; colours persist per device across a reload.
import { chromium } from 'playwright'

const PORT = process.env.PORT || '5220'
const BASE = `http://127.0.0.1:${PORT}`, PW = process.env.PW || 'iso-graph-4471'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) })
const get = (p) => fetch(BASE + p, { headers: H }).then(j)
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(j)
const checks = {}

// Two local repos (the registry copy has two named "prg") and a fake remote source.
const repos = (await get('/api/repos')).body
const prg = repos.filter((r) => r.name.toLowerCase() === 'prg')
const fluent = repos.find((r) => r.name.toLowerCase() === 'fluent') || repos.find((r) => !r.isSelf && r.name.toLowerCase() !== 'prg')
const src = await post('/api/collector/sources', { address: 'http://10.255.255.2:5099', label: 'FAKEBOX', credential: 'x' })
const sourceId = src.body?.id || src.body?.source?.id
console.log('repos', repos.length, 'prg', prg.length, 'source', sourceId)
// A legacy machine box with a task inside it (box-relative coords) — must render at
// its absolute place with no box drawn.
const box = (await post('/api/taskgraph/machines', { name: 'old box', x: 300, y: 200, w: 300, h: 200 })).body
const inBox = (await post('/api/taskgraph/nodes', { title: 'Legacy boxed task', machineId: box.id, x: 20, y: 30, repoId: prg[0].id })).body
const a = (await post('/api/taskgraph/nodes', { title: 'Task on self / prg', repoId: prg[0].id, x: 40, y: 40 })).body
const b = (await post('/api/taskgraph/nodes', { title: 'Task on self / prg#2', repoId: prg[1].id, x: 40, y: 160 })).body
const c = (await post('/api/taskgraph/nodes', { title: 'Task on FAKEBOX / fluent', repoId: fluent.id, sourceId, x: 320, y: 40 })).body
const d = (await post('/api/taskgraph/nodes', { title: 'Unassigned task', x: 320, y: 160 })).body
await post('/api/taskgraph/edges', { source: c.id, target: a.id }) // cross-machine dependency
await post('/api/arch/scope', { repoIds: prg.map((r) => r.id).concat(fluent.id), fleet: [] })

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } })
await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }])
await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('claudeweb_ideas_tab', 'graph') })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/studio/ideas`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.locator('.tg-panel').waitFor({ timeout: 20000 })
await page.locator('.react-flow__node').first().waitFor({ timeout: 20000 })
// The fleet status (repo remotes / machine names) arrives after the nodes on a cold
// instance; wait until the prg tasks carry their remote-keyed repo before reading colours.
await page.waitForFunction(() => document.querySelectorAll('.tg-node[data-repo^="github.com"]').length >= 3, null, { timeout: 30000 })
await page.waitForTimeout(500)

const nodeInfo = async (id) => page.locator(`.react-flow__node[data-id="${id}"] .tg-node`).evaluate((el) => ({
  cls: el.className, machine: el.dataset.machine, repo: el.dataset.repo,
  border: getComputedStyle(el).borderTopColor, bg: getComputedStyle(el).backgroundColor,
}))
const ia = await nodeInfo(a.id), ib = await nodeInfo(b.id), ic = await nodeInfo(c.id), id_ = await nodeInfo(d.id), il = await nodeInfo(inBox.id)
console.log('a', ia.machine, ia.repo, ia.border, ia.bg)
console.log('c', ic.machine, ic.repo, ic.border, ic.bg)
console.log('d', id_.machine || '(none)', id_.repo || '(none)', id_.border, id_.bg)
checks['no machine boxes rendered'] = (await page.locator('.react-flow__node-machine, .tg-machine').count()) === 0
checks['assigned nodes carry machine + repo classes'] = /has-machine/.test(ia.cls) && /has-repo/.test(ia.cls) && /has-machine/.test(ic.cls) && /has-repo/.test(ic.cls)
checks['unassigned node is neutral'] = !/has-machine|has-repo/.test(id_.cls)
checks['same machine → same border colour'] = ia.border === ib.border
checks['other machine → different border colour'] = ia.border !== ic.border
// The two prg repos share one remote URL → one repository colour (the point of keying by remote).
checks['same remote (two prg repos) → same background'] = ia.bg === ib.bg
checks['different repo → different background'] = ia.bg !== ic.bg
checks['neutral border differs from both machine borders'] = id_.border !== ia.border && id_.border !== ic.border
checks['border colours differ from backgrounds'] = ia.border !== ia.bg && ic.border !== ic.bg
checks['legacy boxed task coloured like its siblings'] = il.border === ia.border && il.bg === ia.bg
// Legacy task shows at its absolute place (box origin + offset), not at the offset.
const lbox = await page.locator(`.react-flow__node[data-id="${inBox.id}"]`).evaluate((el) => el.style.transform)
console.log('legacy transform', lbox)
checks['legacy boxed task placed at absolute coords'] = /translate\(320px, 230px\)/.test(lbox)

// Legends: present, above the canvas, labelled, pinned while panning.
const legends = page.locator('[data-legends]')
checks['both legends present'] = (await page.locator('[data-legend="machine"]').count()) === 1 && (await page.locator('[data-legend="repo"]').count()) === 1
const mText = await page.locator('[data-legend="machine"]').innerText()
const rText = await page.locator('[data-legend="repo"]').innerText()
console.log('machines legend:', mText.replace(/\n/g, ' | '))
console.log('repos legend:', rText.replace(/\n/g, ' | '))
checks['machines legend names both machines + unassigned'] = /FAKEBOX/.test(mText) && /unassigned/.test(mText) && (await page.locator('[data-legend="machine"] .tg-legend__item').count()) === 3
const rItems = await page.locator('[data-legend="repo"] .tg-legend__item').allInnerTexts()
checks['repos legend lists two repos (prg merged by remote) + unassigned'] = rItems.length === 3 && rItems.some((t) => /^prg\s*3$/.test(t.replace(/\n/g, ' ').trim()))
const lb = await legends.boundingBox(); const cb = await page.locator('.tg-canvas').boundingBox()
checks['legends sit above the canvas'] = lb.y + lb.height <= cb.y + 1
// Pan the canvas by dragging empty space; the nodes move, the legends do not.
const before = await page.locator(`.react-flow__node[data-id="${d.id}"]`).boundingBox()
await page.mouse.move(cb.x + cb.width - 40, cb.y + cb.height - 40); await page.mouse.down()
await page.mouse.move(cb.x + cb.width - 240, cb.y + cb.height - 140, { steps: 8 }); await page.mouse.up()
await page.waitForTimeout(300)
const after = await page.locator(`.react-flow__node[data-id="${d.id}"]`).boundingBox()
const lb2 = await legends.boundingBox()
console.log(`pan: node moved ${Math.round(before.x - after.x)}px; legend moved ${Math.round(lb.x - lb2.x)},${Math.round(lb.y - lb2.y)}`)
checks['panning moves nodes but not the legends'] = Math.abs(before.x - after.x) > 100 && lb2.x === lb.x && lb2.y === lb.y

// Legend focus dims the non-matching nodes.
await page.locator(`[data-legend="machine"] .tg-legend__item[data-key="${sourceId}"]`).click()
await page.waitForTimeout(200)
const dimA = await page.locator(`.react-flow__node[data-id="${a.id}"] .tg-node`).evaluate((el) => el.classList.contains('is-dim'))
const dimC = await page.locator(`.react-flow__node[data-id="${c.id}"] .tg-node`).evaluate((el) => el.classList.contains('is-dim'))
checks['legend focus dims the other machine, not the focused one'] = dimA && !dimC
await page.locator(`[data-legend="machine"] .tg-legend__item[data-key="${sourceId}"]`).click()

// Persisted palette: reload keeps every colour.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.locator('.react-flow__node').first().waitFor({ timeout: 20000 })
await page.waitForFunction(() => document.querySelectorAll('.tg-node[data-repo^="github.com"]').length >= 3, null, { timeout: 30000 })
await page.waitForTimeout(500)
const ia2 = await nodeInfo(a.id), ic2 = await nodeInfo(c.id)
checks['colours persist across reload'] = ia2.border === ia.border && ia2.bg === ia.bg && ic2.border === ic.border && ic2.bg === ic.bg
await page.screenshot({ path: 'C:/Users/Administrator/Desktop/playground/birocode/.claudeweb-preview/out-graph-colours.png' })
checks['no page errors'] = errors.length === 0
for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'ok ' : 'BAD'} ${k}`)
if (errors.length) console.log(errors.join('\n').slice(0, 500))
const pass = Object.values(checks).every(Boolean)
console.log(pass ? 'PASS' : 'FAIL')
await browser.close()
process.exit(pass ? 0 : 1)
