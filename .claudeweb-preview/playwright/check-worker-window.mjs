// Board task afed9d6d — RESEARCH: can pure Chrome give ONE reused "worker" window
// that a management page retargets to different machines' harnesses on each click?
//
// The question decides browser-vs-WinForms. The hypothesis: window.open(url, NAME)
// with a FIXED window name REUSES the auxiliary browsing context it opened earlier
// (same name, same opener context) and NAVIGATES it to the new URL — including a
// CROSS-ORIGIN url (three different localhost ports below are three origins). The
// Operator's instinct ("a tab can't retarget another tab") is true only for
// UNRELATED tabs; a named window the page itself opened is fair game.
//
// Run (playwright not vendored in this repo — see docs in the PR):
//   mkdir %TEMP%\pw-worker && cd it && npm i playwright-core &&
//   copy this file there && node check-worker-window.mjs
// Uses the installed Edge (channel msedge) — no browser download.
import { createServer } from 'node:http'
import { chromium } from 'playwright-core'

const M_PORT = 5311, A_PORT = 5312, B_PORT = 5313
const page_ = (title, body) => `<!doctype html><title>${title}</title><body>${body}`
const serve = (port, html) => new Promise((res) => {
  const s = createServer((_, r) => { r.setHeader('content-type', 'text/html'); r.end(html) })
  s.listen(port, '127.0.0.1', () => res(s))
})

// M = the "management dashboard" page. The whole mechanism under test is go().
// goPopup() exists only for the cross-OS-window case below: it puts the worker
// in its OWN OS window (popup features), standing in for the Operator dragging
// the worker tab out to a second screen.
const M = page_('MGMT', `
  <button id="a" onclick="go('http://127.0.0.1:${A_PORT}/')">open A</button>
  <button id="b" onclick="go('http://127.0.0.1:${B_PORT}/')">open B</button>
  <button id="popa" onclick="goPopup('http://127.0.0.1:${A_PORT}/')">open A as own OS window</button>
  <script>
    function go(url) {
      const w = window.open(url, 'birocode-worker'); // FIXED name = the one worker window
      try { if (w) w.focus() } catch {}
    }
    function goPopup(url) {
      const w = window.open(url, 'birocode-worker', 'popup,width=980,height=760');
      try { if (w) w.focus() } catch {}
    }
  </script>`)

const servers = await Promise.all([
  serve(M_PORT, M),
  serve(A_PORT, page_('WORKER-A', 'machine A harness')),
  serve(B_PORT, page_('WORKER-B', 'machine B harness')),
])

const checks = {}
const info = []
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' })
const ctx = await browser.newContext()
const m = await ctx.newPage()
await m.goto(`http://127.0.0.1:${M_PORT}/`)

// 1. First click opens the worker window.
const [worker] = await Promise.all([ctx.waitForEvent('page'), m.click('#a')])
await worker.waitForLoadState('domcontentloaded')
checks['first click opens ONE worker window at machine A'] =
  ctx.pages().length === 2 && worker.url().includes(`:${A_PORT}`)

// 2. Second click REUSES the same window and navigates it CROSS-ORIGIN to B.
await m.click('#b')
await worker.waitForURL(`**127.0.0.1:${B_PORT}/**`, { timeout: 5000 })
checks['second click REUSES that window, navigated cross-origin to machine B'] =
  ctx.pages().length === 2 && worker.url().includes(`:${B_PORT}`)

// 3. And back again — still exactly two pages, ever.
await m.click('#a')
await worker.waitForURL(`**127.0.0.1:${A_PORT}/**`, { timeout: 5000 })
checks['third click: still the same single worker window (back at A)'] =
  ctx.pages().length === 2 && worker.url().includes(`:${A_PORT}`)

// 4. Does the association survive a reload of M? (Informational — decides whether a
//    reloaded dashboard grows a second worker or re-adopts the old one.)
await m.reload()
await m.click('#b')
let survived
try {
  await worker.waitForURL(`**127.0.0.1:${B_PORT}/**`, { timeout: 4000 })
  survived = ctx.pages().length === 2
} catch { survived = false }
info.push(`after reloading M: named-target association ${survived ? 'SURVIVES (same worker reused)' : `LOST (pages now ${ctx.pages().length})`}`)
checks['after M reloads, a click still yields at most one extra window'] = ctx.pages().length <= 3

// 5. THE TWO-SCREEN QUESTION (Operator, 2026-09-16): the worker opens as a tab;
//    if it is moved into its OWN OS window (drag-out — same browsing context,
//    re-parented), do later clicks still find and navigate it? A tab drag can't
//    be automated, but the property it depends on can: put the worker in a
//    separate OS window from birth (popup features) and then hit it with the
//    PLAIN window.open(url, name) the Kanban button uses. If the name lookup
//    were scoped to one OS window's tab strip this would open a second window;
//    finding + navigating it proves the lookup crosses OS windows.
const ctx2 = await browser.newContext()
const m2 = await ctx2.newPage()
await m2.goto(`http://127.0.0.1:${M_PORT}/`)
const [w2] = await Promise.all([ctx2.waitForEvent('page'), m2.click('#popa')])
await w2.waitForLoadState('domcontentloaded')
// window.toolbar.visible: false in a popup (own OS window, no tab strip), true in a tab.
const popupIsOwnWindow = await w2.evaluate(() => window.toolbar.visible === false)
checks['worker opened as its OWN OS window (popup: no tab strip)'] = popupIsOwnWindow && ctx2.pages().length === 2

await m2.click('#b') // the PLAIN named open — exactly what the Kanban button does
await w2.waitForURL(`**127.0.0.1:${B_PORT}/**`, { timeout: 5000 })
checks['a plain named open FINDS + NAVIGATES the worker in that other OS window'] =
  ctx2.pages().length === 2 && w2.url().includes(`:${B_PORT}`)
await m2.click('#a')
await w2.waitForURL(`**127.0.0.1:${A_PORT}/**`, { timeout: 5000 })
const again = { pages: ctx2.pages().length, toolbarHidden: await w2.evaluate(() => window.toolbar.visible === false) }
info.push(`third hop diagnostics: pages=${again.pages}, popup chrome still hidden=${again.toolbarHidden}`)
checks['and again — still ONE worker in that other OS window'] = again.pages === 2 && w2.url().includes(`:${A_PORT}`)
info.push('drag-out equivalence: a dragged tab keeps its browsing context (name + opener travel with it); the lookup above is proven to cross OS windows, so a dragged-out worker keeps being reused')

await browser.close()
servers.forEach((s) => s.close())

let pass = 0
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (v) pass++ }
info.forEach((l) => console.log(`INFO  ${l}`))
console.log(`${pass}/${Object.keys(checks).length}`)
process.exit(pass === Object.keys(checks).length ? 0 : 1)
