// Research (fleet task d3af3b9b): does window.open('', name) from the dashboard's click raise an EXISTING tab in
// another window — synchronously in the click, and after an await of N ms? Ground truth = chrome.tabs active
// tabs (drag-ext). Playwright Chromium, popups allowed.   OUT=<leftwin dir> node check-raise-timing.mjs
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';

const pages = {
  '/dash.html': `<!doctype html><title>dash</title><button id="mk">make tabs</button><button id="sync">raise A sync</button><button id="d100">raise A after 100ms</button><button id="d600">raise A after 600ms</button><button id="d1500">raise A after 1500ms</button><button id="mkHost">make host</button><button id="viaHost">host opens B</button><button id="raiseB">raise B (opened by host)</button><button id="raiseBhost">ask host to raise B</button><button id="prod">product sequence on B</button><button id="prodNoHostFocus">product sequence, host does not touch B</button><button id="bcwait">raise A after a BroadcastChannel round trip</button><script>
document.getElementById('mk').onclick = () => { window.open('/agent.html?a', 'agent-a'); };
let H = null;
document.getElementById('mkHost').onclick = () => { H = window.open('/host.html', 'host'); };
document.getElementById('viaHost').onclick = () => { H.__openB(); };
document.getElementById('raiseB').onclick = () => { const w = window.open('', 'agent-b'); window.__r = w ? w.location.href : null; try { w.focus(); } catch {} };
document.getElementById('raiseBhost').onclick = () => { window.__r = H.__raiseB(); };
const bc = new BroadcastChannel('host');
const roundTrip = (msg) => new Promise((r) => { bc.onmessage = (e) => r(e.data); bc.postMessage(msg); setTimeout(() => r(null), 1500); });
document.getElementById('prod').onclick = async () => { await new Promise((r) => setTimeout(r, 350)); const ans = await roundTrip({ op: 'touch' }); const w = window.open('', 'agent-b'); window.__r = (ans && ans.r) + ' / ' + (w ? w.location.href : null); try { w.focus(); } catch {} };
document.getElementById('prodNoHostFocus').onclick = async () => { await new Promise((r) => setTimeout(r, 350)); const ans = await roundTrip({ op: 'none' }); const w = window.open('', 'agent-b'); window.__r = (ans && ans.r) + ' / ' + (w ? w.location.href : null); try { w.focus(); } catch {} };
const raise = () => { const w = window.open('', 'agent-a'); window.__r = w ? w.location.href : null; };
document.getElementById('sync').onclick = raise;
for (const ms of [100, 600, 1500]) document.getElementById('d' + ms).onclick = () => setTimeout(raise, ms);
document.getElementById('bcwait').onclick = async () => { const ch = new BroadcastChannel('x'); await new Promise((r) => setTimeout(r, 400)); ch.close(); raise(); };
</script>`,
  '/agent.html': '<!doctype html><title>agent</title>agent',
  '/host.html': `<!doctype html><title>host</title>host<script>window.__openB = () => window.open('/agent.html?b', 'agent-b'); window.__raiseB = () => { const w = window.open('', 'agent-b'); try { w.focus(); } catch {} return w ? w.location.href : null; }; const bc = new BroadcastChannel('host'); bc.onmessage = (e) => { let r = 'none'; if (e.data.op === 'touch') { const w = window.open('', 'agent-b'); try { w.postMessage({ hi: 1 }, '*'); w.focus(); } catch {} r = w ? 'touched' : 'blocked'; } bc.postMessage({ r }); };</script>`,
  '/other.html': '<!doctype html><title>other</title>other',
};
const server = http.createServer((req, res) => { const body = pages[new URL(req.url, 'http://x').pathname]; if (!body) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', 'text/html'); res.end(body); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const ext = path.join(process.env.OUT, 'drag-ext');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-raise-'));
const ctx = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const dash = ctx.pages()[0];
await dash.goto(`${base}/dash.html`);
const [agent] = await Promise.all([ctx.waitForEvent('page'), dash.click('#mk')]);
await agent.waitForLoadState();
// move the agent into its own window, then cover it with another tab there
const s = await ctx.newCDPSession(dash);
const [other] = await Promise.all([ctx.waitForEvent('page'), s.send('Target.createTarget', { url: `${base}/other.html`, newWindow: true })]);
await other.waitForLoadState();
console.log('moved:', JSON.stringify(await sw.evaluate(() => self.dragTab('agent.html', 'other.html'))));
const cover = async () => { await sw.evaluate(async () => { const t = (await chrome.tabs.query({})).find((x) => (x.url || '').includes('other.html')); await chrome.tabs.update(t.id, { active: true }); }); await dash.bringToFront(); await new Promise((r) => setTimeout(r, 300)); };
const agentActive = async () => (await sw.evaluate(() => self.activeTabs())).some((t) => (t.url || '').includes('agent.html'));
for (const id of ['sync', 'd100', 'd600', 'd1500', 'bcwait']) {
  await cover();
  const before = await agentActive();
  await dash.click('#' + id);
  await new Promise((r) => setTimeout(r, 2000));
  console.log(id.padEnd(8), 'found:', await dash.evaluate(() => window.__r), ' agent active before/after:', before, '/', await agentActive());
}
// host variant: dash opens host, host opens agent-b, host + agent-b dragged to the other window
const [host] = await Promise.all([ctx.waitForEvent('page'), dash.click('#mkHost')]); await host.waitForLoadState();
const [bTab] = await Promise.all([ctx.waitForEvent('page'), dash.click('#viaHost')]); await bTab.waitForLoadState();
console.log('move host:', JSON.stringify(await sw.evaluate(() => self.dragTab('host.html', 'other.html'))));
console.log('move B:', JSON.stringify(await sw.evaluate(() => self.dragTab('agent.html?b', 'other.html'))));
const bActive = async () => (await sw.evaluate(() => self.activeTabs())).some((t) => (t.url || '').includes('agent.html?b'));
for (const id of ['raiseB', 'raiseBhost', 'prod', 'prodNoHostFocus', 'prod']) {
  await cover();
  const before = await bActive();
  await dash.click('#' + id);
  await new Promise((r) => setTimeout(r, 1500));
  console.log(id.padEnd(10), 'found:', await dash.evaluate(() => window.__r), ' B active before/after:', before, '/', await bActive());
}
await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });
