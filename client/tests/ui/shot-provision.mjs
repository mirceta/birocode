// Evidence shots for fleet task 3bbd2242 (openspec provision-repo-agent): Management → Status
// → Agents, the per-machine "+ new repo agent…" control. The fleet is this hub's REAL snapshot
// (fixtures/fleet-status-live.json) plus one reachable peer PEERBOX that accepts provisioning;
// the provisioning reply the form shows is the REAL answer captured from the two-instance
// end-to-end (.claudeweb-preview/provision-e2e.ps1 → fixtures/provision-replies.json), i.e.
// exactly what the arch's provision_repo_agent tool returned for hub → PEERBOX.
//
//   node client/tests/ui/shot-provision.mjs
// Output: docs/screenshots/provision-dashboard.png (form open), provision-reply.png (the reply),
//         provision-exists.png (the idempotent second call)

import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const readJson = (f) => JSON.parse(readFileSync(path.join(clientRoot, 'tests', 'ui', 'fixtures', f), 'utf8').replace(/^﻿/, ''));
const fleet = readJson('fleet-status-live.json');
const replies = readJson('provision-replies.json');
const SRC = replies.provisioned?.data?.sourceId || 'peerbox';
// The peer of the end-to-end, as the hub's Fleet Status would list it after the opt-in.
fleet.machines.push({
  machine: 'PEERBOX', sourceId: SRC, self: false, address: 'http://127.0.0.1:5241', reachable: true, status: 'ok', detail: null,
  version: fleet.hubVersion, behind: false, acceptsSends: true, acceptsUpgrades: false, acceptsProvisioning: true, gateOpen: true, allowSends: true,
  managedCount: 0, staleTasks: [], overview: null, agents: [],
});
const now = Date.now();
let calls = 0;
function mock(pathname, method) {
  if (pathname === '/api/arch/fleet/provision' && method === 'POST') return calls++ === 0 ? replies.provisioned : replies.exists;
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: fleet.machines.find((m) => m.self)?.machine || 'hub' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
    case '/api/taskgraph/layout': return { layout: null };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.setItem('manageapp.fleetAgentsLayout', 'merged');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, route.request().method())) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const result = {};
try {
  await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`[data-provision-toggle="${SRC}"]`, { timeout: 15000 });
  // Every machine has the control; the dark MONSTER has it disabled with the reason.
  const states = await page.evaluate(() => [...document.querySelectorAll('[data-provision-toggle]')].map((b) => ({ src: b.dataset.provisionToggle, can: b.dataset.provisionCan, title: b.title, disabled: b.disabled })));
  result.controlOnEveryMachine = states.length === 3;
  result.darkMachineDisabledWithReason = states.some((s) => s.disabled && /not answering/.test(s.title));
  result.selfEnabled = states.some((s) => s.can === 'true' && !s.disabled);
  await page.click(`[data-provision-toggle="${SRC}"]`);
  await page.waitForSelector(`[data-provision-form="${SRC}"]`);
  await page.fill(`[data-provision-form="${SRC}"] [data-provision-url]`, replies.provisioned?.data?.provisioned?.remoteUrl || 'https://github.com/mirceta/portlistener.git');
  await page.fill(`[data-provision-form="${SRC}"] [data-provision-name]`, replies.provisioned?.data?.provisioned?.name || 'provision-test-20261007');
  const machineBox = page.locator(`[data-machine="PEERBOX"]`);
  await machineBox.screenshot({ path: path.join(OUT, 'provision-dashboard.png') });
  await page.click(`[data-provision-form="${SRC}"] [data-provision-submit]`);
  await page.waitForSelector('[data-provision-reply]');
  const reply = await page.evaluate(() => {
    const r = document.querySelector('[data-provision-reply]');
    return { status: r?.dataset.provisionReply, handle: r?.dataset.provisionHandle, steps: [...r.querySelectorAll('[data-step]')].map((li) => `${li.dataset.step}:${li.dataset.stepStatus}`), agent: r.querySelector('[data-provision-agent]')?.textContent || '' };
  });
  result.replyShowsProvisioned = reply.status === 'provisioned';
  result.replyNamesTheHandle = reply.handle === 'PEERBOX/provision-test-20261007';
  result.replyListsFourStepsDone = reply.steps.join(',') === 'clone:done,project:done,agent:done,scope:done';
  result.replyShowsTheAgentRow = /managedThere true/.test(reply.agent) && /sendable true/.test(reply.agent) && /master/.test(reply.agent);
  await machineBox.screenshot({ path: path.join(OUT, 'provision-reply.png') });
  await page.click(`[data-provision-form="${SRC}"] [data-provision-submit]`);
  await page.waitForFunction(() => document.querySelector('[data-provision-reply]')?.dataset.provisionReply === 'exists');
  const again = await page.evaluate(() => [...document.querySelectorAll('[data-provision-reply] [data-step]')].map((li) => li.dataset.stepStatus));
  result.secondCallShowsExistsAllReused = again.length === 4 && again.every((s) => s === 'reused');
  await machineBox.screenshot({ path: path.join(OUT, 'provision-exists.png') });
  result.noPageErrors = errs.length === 0;
} catch (e) {
  result.error = String(e?.message || e);
}
console.log(JSON.stringify({ result, errs }, null, 1));
await browser.close();
await server.close();
process.exit(Object.entries(result).every(([k, v]) => k === 'error' ? false : v === true) && !result.error ? 0 : 1);
