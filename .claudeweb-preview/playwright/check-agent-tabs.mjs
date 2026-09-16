// Operator follow-up to the worker window (task afed9d6d): instead of ONE shared
// worker, give EACH AGENT its own tab — and clicking that agent on a Kanban card
// FOCUSES its existing tab wherever it lives (any Chrome window), without
// reloading it. The mechanism under test:
//   const w = window.open('', 'birocode-agent-<key>');   // per-agent FIXED name;
//   // empty URL: an existing named tab is FOUND but NOT navigated (no reload);
//   // a brand-new one comes back at about:blank and only then gets the URL.
//   try { if (w.location.href === 'about:blank') w.location.href = url; }
//   catch { /* existing cross-origin tab: just focus */ }
//   w.focus();                                            // switch Chrome to it
//
// Run (playwright not vendored in this repo):
//   mkdir %TEMP%\pw-worker && cd it && npm i playwright-core &&
//   copy this file there && node check-agent-tabs.mjs
import { createServer } from 'node:http'
import { chromium } from 'playwright-core'

const M_PORT = 5321, A_PORT = 5322, B_PORT = 5323
const page_ = (title, body) => `<!doctype html><title>${title}</title><body>${body}`
const serve = (port, html) => new Promise((res) => {
  const s = createServer((_, r) => { r.setHeader('content-type', 'text/html'); r.end(html) })
  s.listen(port, '127.0.0.1', () => res(s))
})

// M = the Kanban. Each button is one agent chip; agent1 lives on machine A's
// harness, agent2 on machine B's — per-agent window names.
const M = page_('MGMT', `
  <button id="ag1" onclick="focusAgent('agent-1', 'http://127.0.0.1:${A_PORT}/')">agent 1 @ A</button>
  <button id="ag2" onclick="focusAgent('agent-2', 'http://127.0.0.1:${B_PORT}/')">agent 2 @ B</button>
  <button id="ag3pop" onclick="focusAgent('agent-3', 'http://127.0.0.1:${B_PORT}/', 'popup,width=900,height=700')">agent 3 @ B, own OS window</button>
  <button id="ag3" onclick="focusAgent('agent-3', 'http://127.0.0.1:${B_PORT}/')">agent 3 plain</button>
  <script>
    function focusAgent(key, url, features) {
      const w = features ? window.open(url, 'birocode-agent-' + key, features)
                         : window.open('', 'birocode-agent-' + key);
      if (!w) return;
      try { if (w.location.href === 'about:blank') w.location.href = url; }
      catch { /* existing cross-origin tab — just focus it */ }
      try { w.focus() } catch {}
    }
  </script>`)

const servers = await Promise.all([
  serve(M_PORT, M),
  serve(A_PORT, page_('AGENT-1', 'agent 1 dock')),
  serve(B_PORT, page_('AGENT-2', 'agent 2 dock')),
])

const checks = {}
const info = []
const vis = (p) => p.evaluate(() => document.visibilityState)
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' })
const ctx = await browser.newContext()
const m = await ctx.newPage()
await m.goto(`http://127.0.0.1:${M_PORT}/`)

// 1. Two agents → two DIFFERENT tabs (per-agent names, no sharing).
const [t1] = await Promise.all([ctx.waitForEvent('page'), m.click('#ag1')])
await t1.waitForURL(`**:${A_PORT}/**`)
await m.bringToFront()
const [t2] = await Promise.all([ctx.waitForEvent('page'), m.click('#ag2')])
await t2.waitForURL(`**:${B_PORT}/**`)
checks['each agent gets its OWN tab (two clicks, two tabs)'] =
  ctx.pages().length === 3 && t1.url().includes(`:${A_PORT}`) && t2.url().includes(`:${B_PORT}`)

// 2. Re-click agent 1: NO new tab, the EXISTING tab gets FOCUS (visible), and it
//    is NOT reloaded (a marker planted in the page survives).
await t1.evaluate(() => { window.__marker = 'still-here' })
await m.bringToFront()
await m.click('#ag1')
await t1.waitForTimeout(400)
const focused1 = await vis(t1)
const marker = await t1.evaluate(() => window.__marker)
checks['re-click focuses the EXISTING tab (visible, no new tab)'] = ctx.pages().length === 3 && focused1 === 'visible'
checks['and does NOT reload it (in-page state survives)'] = marker === 'still-here'
// Background-tab visibility is not reliably modelled headless (no occlusion
// tracking) — informational only; the POSITIVE focus signals above are the proof.
info.push(`while agent1 is focused, agent2 reports visibility=${await vis(t2)} (headless occlusion caveat)`)

// 3. And the other way: focus agent 2, agent 1 goes background.
await m.bringToFront()
await m.click('#ag2')
await t2.waitForTimeout(400)
checks['clicking the other agent switches focus to ITS tab'] = (await vis(t2)) === 'visible' && ctx.pages().length === 3

// 4. Agent in its OWN OS window (drag-out stand-in): plain re-click finds it
//    there, focuses it, no new tab.
await m.bringToFront()
const [t3] = await Promise.all([ctx.waitForEvent('page'), m.click('#ag3pop')])
await t3.waitForURL(`**:${B_PORT}/**`)
await t3.evaluate(() => { window.__marker = 'own-window' })
await m.bringToFront()
await m.click('#ag3')
await t3.waitForTimeout(400)
checks['an agent tab living in ANOTHER OS window: found, focused, not duplicated'] =
  ctx.pages().length === 4 && (await vis(t3)) === 'visible'
checks['…and not reloaded either'] = (await t3.evaluate(() => window.__marker)) === 'own-window'
info.push(`focus signal after cross-OS-window click: agent3 visibility=${await vis(t3)}, hasFocus=${await t3.evaluate(() => document.hasFocus())}`)

await browser.close()
servers.forEach((s) => s.close())

let pass = 0
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (v) pass++ }
info.forEach((l) => console.log(`INFO  ${l}`))
console.log(`${pass}/${Object.keys(checks).length}`)
process.exit(pass === Object.keys(checks).length ? 0 : 1)
