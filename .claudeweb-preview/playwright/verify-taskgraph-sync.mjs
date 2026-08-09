// E2E for openspec sync-task-graph, FULLY ISOLATED (harness A :5243 acts as the
// hub, harness B :5244 joins it; each has its own CLAUDEWEB_DATADIR). API-only —
// the behavior under test is backend sync choreography, no UI claims made here.
//
// Scenarios (tasks.md 3.2):
//   1. Join seeding: B's pre-existing graph (nodes, edge, machine, scratch) is
//      uploaded to the hub on first contact, alongside its ideas; A's pre-join
//      graph tombstone survives the seed push
//   2. Live replication both ways: node added on A appears on B; a status edit
//      on B appears on A
//   3. No resurrection: a node deleted on A while B held a copy offline stays
//      deleted everywhere after B rejoins and seed-pushes its stale board
//   4. Conflicting/duplicate concurrent edges converge to the same single valid
//      edge on both sides (canonical rebuild)
//   5. Machine delete detaches members across the fleet
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'

const ROOT = 'C:/Users/Administrator/Desktop/playground/birocode'
const EXEDIR = `${ROOT}/ClaudeWeb.App/bin/Debug/net8.0-windows`
const EXE = `${EXEDIR}/ClaudeWeb.exe`
const PORT_A = 5243
const PORT_B = 5244
const BASE_A = `http://localhost:${PORT_A}`
const BASE_B = `http://localhost:${PORT_B}`
const DATADIR_A = `${ROOT}/.claudeweb-preview/iso-datadir-tgsync-a`
const DATADIR_B = `${ROOT}/.claudeweb-preview/iso-datadir-tgsync-b`
const PW = 'changeme'
const H = { 'Content-Type': 'application/json', 'X-Auth-Password': PW }

const log = (...a) => console.log('[tgsync]', ...a)
let failures = 0
const check = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'}: ${name}`); if (!cond) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const api = (base, method, p, body) => fetch(`${base}/api${p}`, {
  method, headers: H, body: body === undefined ? undefined : JSON.stringify(body),
})
const graphOf = async (base) => await (await api(base, 'GET', '/taskgraph')).json()
const addNode = async (base, title) => await (await api(base, 'POST', '/taskgraph/nodes', { title, x: 10, y: 10 })).json()
const addEdge = async (base, source, target) => await (await api(base, 'POST', '/taskgraph/edges', { source, target })).json()
const addMachine = async (base, name) => await (await api(base, 'POST', '/taskgraph/machines', { name, x: 0, y: 0 })).json()
const addNote = async (base, text) => await (await api(base, 'POST', '/notes', { text })).json()
async function enableHub(base) {
  const info = await (await api(base, 'POST', '/notes/hub-info', { enabled: true })).json()
  return `${base}/api/notes/hub/${info.token}`
}
const hubGet = async (hubUrl) => await (await fetch(`${hubUrl}?fn=get`)).json()
const hubGraph = (env) => env?.store?.graph ?? env?.store?.Graph ?? null
async function waitFor(name, pred, timeoutMs = 25000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try { if (await pred()) return true } catch { /* retry */ }
    await sleep(500)
  }
  return false
}

const children = {}
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

try {
  for (const d of [DATADIR_A, DATADIR_B]) {
    await rm(d, { recursive: true, force: true })
    await mkdir(d, { recursive: true })
  }

  log('starting harness A (hub) + B (joining node)…')
  await startHarness('A', PORT_A, DATADIR_A)
  await startHarness('B', PORT_B, DATADIR_B)

  // ---- setup: the OLD world -------------------------------------------------
  const a1 = await addNode(BASE_A, 'tgsync: hub-native step')
  const aDead = await addNode(BASE_A, 'tgsync: deleted on hub before join')
  await api(BASE_A, 'DELETE', `/taskgraph/nodes/${aDead.id}`)
  const b1 = await addNode(BASE_B, 'tgsync: B step 1')
  const b2 = await addNode(BASE_B, 'tgsync: B step 2')
  const e12 = await addEdge(BASE_B, b1.id, b2.id)
  const m1 = await addMachine(BASE_B, 'tgsync: B box')
  await api(BASE_B, 'PATCH', `/taskgraph/nodes/${b2.id}`, { machineId: m1.id })
  await api(BASE_B, 'PATCH', '/taskgraph/scratch', { text: 'tgsync: B scratch' })
  const idea = await addNote(BASE_B, 'tgsync: idea regression check')
  check('setup: A 1 live + 1 tombstoned node; B 2 nodes + edge + machine + scratch + idea',
    !!a1.id && !!aDead.id && !!b1.id && !!b2.id && !!e12.id && !!m1.id && !!idea.id)

  // ---- 1: join seeds the graph ----------------------------------------------
  const HUB_A = await enableHub(BASE_A)
  await api(BASE_B, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: HUB_A, pollSeconds: 5 })

  const seeded = await waitFor('graph seed', async () => {
    const g = hubGraph(await hubGet(HUB_A))
    if (!g) return false
    const nodeIds = new Set((g.nodes ?? []).map((n) => n.id))
    const edgeIds = new Set((g.edges ?? []).map((e) => e.id))
    const machineIds = new Set((g.machines ?? []).map((x) => x.id))
    return nodeIds.has(b1.id) && nodeIds.has(b2.id) && edgeIds.has(e12.id)
      && machineIds.has(m1.id) && g.scratch === 'tgsync: B scratch'
  }, 15000)
  check('B\'s pre-existing graph (nodes+edge+machine+scratch) seeds the hub store', seeded)

  const gHub = hubGraph(await hubGet(HUB_A))
  check('A\'s pre-join node tombstone survived the seed push',
    (gHub?.tombstones ?? []).some((t) => t.id === aDead.id))
  check('A\'s pre-join deleted node did not resurrect on the hub',
    !(gHub?.nodes ?? []).some((n) => n.id === aDead.id))

  check('B received A\'s hub-native node', await waitFor('a1->B', async () =>
    ((await graphOf(BASE_B)).nodes ?? []).some((n) => n.id === a1.id)))
  check('A received B\'s nodes + machine (board = union)', await waitFor('b->A', async () => {
    const g = await graphOf(BASE_A)
    return (g.nodes ?? []).some((n) => n.id === b1.id) && (g.machines ?? []).some((x) => x.id === m1.id)
  }))
  check('B\'s scratch won on A (stamped vs legacy empty)', await waitFor('scratch->A', async () =>
    (await graphOf(BASE_A)).scratch === 'tgsync: B scratch'))
  check('b2 kept its machine link on A', await waitFor('b2 box on A', async () =>
    ((await graphOf(BASE_A)).nodes ?? []).find((n) => n.id === b2.id)?.machineId === m1.id))
  check('ideas still sync over the same store (regression)', await waitFor('idea->A', async () =>
    (await (await api(BASE_A, 'GET', '/notes')).json()).some((n) => n.id === idea.id)))

  // ---- 2: live replication both ways ----------------------------------------
  const a2 = await addNode(BASE_A, 'tgsync: born after join')
  check('node added on hub A reaches B within a poll', await waitFor('a2->B', async () =>
    ((await graphOf(BASE_B)).nodes ?? []).some((n) => n.id === a2.id)))
  await api(BASE_B, 'PATCH', `/taskgraph/nodes/${b1.id}`, { status: 'doing' })
  check('status edit on B reaches A', await waitFor('b1 doing on A', async () =>
    ((await graphOf(BASE_A)).nodes ?? []).find((n) => n.id === b1.id)?.status === 'doing'))

  // ---- 3: no resurrection from a stale rejoining board -----------------------
  await api(BASE_B, 'PUT', '/notes/sync/config', { enabled: false, syncUrl: HUB_A, pollSeconds: 5 })
  await sleep(1500) // let any in-flight exchange settle
  await api(BASE_A, 'DELETE', `/taskgraph/nodes/${a2.id}`)
  check('B still holds the doomed node while offline',
    ((await graphOf(BASE_B)).nodes ?? []).some((n) => n.id === a2.id))
  await api(BASE_B, 'PUT', '/notes/sync/config', { enabled: true, syncUrl: HUB_A, pollSeconds: 5 })
  check('rejoin seed push does not resurrect the deleted node on A', !(await waitFor('a2 resurrects', async () =>
    ((await graphOf(BASE_A)).nodes ?? []).some((n) => n.id === a2.id), 8000)))
  check('the deleted node dies on B after the rejoin merge', await waitFor('a2 gone on B', async () =>
    !((await graphOf(BASE_B)).nodes ?? []).some((n) => n.id === a2.id)))

  // ---- 4: conflicting concurrent edges converge -------------------------------
  const x = await addNode(BASE_A, 'tgsync: X')
  const y = await addNode(BASE_A, 'tgsync: Y')
  await waitFor('x,y on B', async () => {
    const ids = new Set(((await graphOf(BASE_B)).nodes ?? []).map((n) => n.id))
    return ids.has(x.id) && ids.has(y.id)
  })
  await addEdge(BASE_A, x.id, y.id)
  const rev = await addEdge(BASE_B, y.id, x.id) // may be refused as a cycle if A's edge already arrived — either way must converge
  log(`B's reverse edge: ${rev?.id ? 'accepted (true conflict staged)' : `refused (${rev?.error ?? 'no error'})`}`)
  const converged = await waitFor('edge convergence', async () => {
    const between = (g) => (g.edges ?? []).filter((e) =>
      (e.source === x.id && e.target === y.id) || (e.source === y.id && e.target === x.id))
    const ga = between(await graphOf(BASE_A))
    const gb = between(await graphOf(BASE_B))
    return ga.length === 1 && gb.length === 1 && ga[0].id === gb[0].id
  })
  check('both boards converge on the same single X/Y edge (no cycle, no dupe)', converged)

  // ---- 5: machine delete detaches members across the fleet --------------------
  await api(BASE_A, 'DELETE', `/taskgraph/machines/${m1.id}`)
  check('machine delete on A reaches B and detaches b2', await waitFor('box gone on B', async () => {
    const g = await graphOf(BASE_B)
    return !(g.machines ?? []).some((mm) => mm.id === m1.id)
      && (g.nodes ?? []).find((n) => n.id === b2.id)?.machineId == null
  }))
} catch (e) {
  failures++
  log('FATAL:', e.message)
} finally {
  await stopHarness('A')
  await stopHarness('B')
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
