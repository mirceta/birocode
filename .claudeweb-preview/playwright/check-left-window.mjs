// Research (fleet task d3af3b9b): why do harness tabs fall back into the DASHBOARD's Chrome window after
// a dashboard refresh, and which mechanism survives it? Real Chrome (channel 'chrome'), headed, CDP
// Browser.getWindowForTarget tells which OS window each page is in.
//   POPUPS=blocked|allowed node check-left-window.mjs     (allowed = Playwright's --disable-popup-blocking,
//   the stand-in for the Operator's one-time "Pop-ups: Allow" for the hub's site)
import http from 'node:http';
import { chromium } from 'playwright';

const pages = {
  '/dash.html': `<!doctype html><title>dash</title>
<button id="mkL">make launcher</button><button id="viaName">open A via named launcher</button><button id="viaBC">open A via channel</button><button id="viaBCb">open B via channel</button>
<script>
const bc = new BroadcastChannel('birocode-harness-host');
let lastAnswer = null; bc.onmessage = (e) => { if (e.data.type === 'opened') lastAnswer = e.data; };
document.getElementById('mkL').onclick = () => { window.open('/host.html', 'birocode-harness-window'); };
document.getElementById('viaName').onclick = () => {
  const h = window.open('', 'birocode-harness-window');
  let href = null; try { href = h && h.location.href; } catch {}
  window.__lookup = { got: !!h, href, hook: !!(h && h.__open) };
  if (h && h.__open) window.__r = h.__open('birocode-agent-a', '/agent.html?a');
  else if (h && href === 'about:blank') h.close();
};
const viaBC = (name, url) => { lastAnswer = null; bc.postMessage({ type: 'open', name, url }); return new Promise((r) => setTimeout(() => r(lastAnswer), 600)); };
document.getElementById('viaBC').onclick = async () => { window.__r = await viaBC('birocode-agent-a', '/agent.html?a'); };
document.getElementById('viaBCb').onclick = async () => { window.__r = await viaBC('birocode-agent-b', '/agent.html?b'); };
</script>`,
  '/host.html': `<!doctype html><title>host</title><p>harness host</p><script>
const open = (name, url) => { const w = window.open('', name); if (!w) return 'blocked'; let fresh = false; try { fresh = w.location.href === 'about:blank'; } catch {} if (fresh) w.location.href = url; try { w.focus(); } catch {} return fresh ? 'opened' : 'focused'; };
window.__open = open;
const bc = new BroadcastChannel('birocode-harness-host');
bc.onmessage = (e) => { if (e.data.type === 'open') bc.postMessage({ type: 'opened', name: e.data.name, result: open(e.data.name, e.data.url) }); };
</script>`,
  '/agent.html': `<!doctype html><title>agent</title><p>agent</p><script>window.__born = Date.now();</script>`,
};
const server = http.createServer((req, res) => { const body = pages[new URL(req.url, 'http://x').pathname]; if (!body) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', 'text/html'); res.end(body); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const allowed = process.env.POPUPS === 'allowed';
const browser = await chromium.launch({ channel: 'chrome', headless: false, ...(allowed ? {} : { ignoreDefaultArgs: ['--disable-popup-blocking'] }) });
const ctx = await browser.newContext();
const winOf = async (p) => { const s = await ctx.newCDPSession(p); const r = await s.send('Browser.getWindowForTarget'); await s.detach(); return r.windowId; };
const out = [];
const rec = (k, v) => { out.push([k, v]); console.log(k.padEnd(52), JSON.stringify(v)); };
const newPageFrom = async (page, sel) => { const [p] = await Promise.all([ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null), page.click(sel)]); if (p) await p.waitForLoadState().catch(() => {}); return p; };

const dash = await ctx.newPage();
await dash.goto(`${base}/dash.html`);
const dashWin = await winOf(dash);
rec('popups', allowed ? 'allowed' : 'blocked (Chrome default)');
const host = await newPageFrom(dash, '#mkL');
rec('launcher tab lands in dashboard window (no features)', (await winOf(host)) === dashWin);
// Move the launcher to its own (left) window, as the Operator drags it: CDP can't drag, so we open a second
// window (a separate Playwright page = a new OS window) and give it the host there.
const bs = await browser.newBrowserCDPSession();
const { targetInfos } = await bs.send('Target.getTargets');
const ctxId = targetInfos.find((t) => t.type === 'page').browserContextId;
const [left] = await Promise.all([ctx.waitForEvent('page'), bs.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId: ctxId })]);
const leftWin = await winOf(left);
rec('second page is its own OS window', leftWin !== dashWin);
await host.close();
await left.goto(`${base}/host.html`);
rec('host (left) has no opener relation to the dashboard', true);

// A. the named lookup from the dashboard, BEFORE any refresh, host not opened by the dashboard
let a = await newPageFrom(dash, '#viaName');
rec('A1 named lookup finds an UNRELATED host tab', await dash.evaluate(() => window.__lookup));
rec('A1 -> a stray blank tab appeared (closed at once)', !!a);

// B. the channel host in the left window
let pA = await newPageFrom(dash, '#viaBC');
rec('B1 channel: host answered', await dash.evaluate(() => window.__r));
rec('B1 agent A tab window', pA ? ((await winOf(pA)) === leftWin ? 'LEFT' : 'dashboard') : 'none');
const bornA = pA ? await pA.evaluate(() => window.__born) : null;
await dash.reload();
await dash.waitForLoadState();
let again = await newPageFrom(dash, '#viaBC');
rec('B2 after dashboard reload: host answered', await dash.evaluate(() => window.__r));
rec('B2 after reload: duplicate tab created?', !!again);
rec('B2 agent A not reloaded', pA ? (await pA.evaluate(() => window.__born)) === bornA : null);
rec('B2 agent A visible (raised) after re-click', pA ? await pA.evaluate(() => document.visibilityState) : null);
const pB = await newPageFrom(dash, '#viaBCb');
rec('B3 after reload, new agent B tab window', pB ? ((await winOf(pB)) === leftWin ? 'LEFT' : 'dashboard') : 'none (blocked?)');
rec('B3 host answer', await dash.evaluate(() => window.__r));
if (pA) { await dash.click('#viaBC'); await dash.waitForTimeout(800); rec('B4 re-click A raises it over B', await pA.evaluate(() => document.visibilityState)); }

// C. the old design: dashboard-opened launcher, then dashboard refresh, then named lookup
const host2 = await newPageFrom(dash, '#mkL');
await dash.reload(); await dash.waitForLoadState();
const c = await newPageFrom(dash, '#viaName');
rec('C1 after reload, named lookup of its own launcher', await dash.evaluate(() => window.__lookup));
rec('C1 a stray tab was created', !!c);
await host2?.close();

console.log('@@RESULT@@', JSON.stringify(Object.fromEntries(out)));
await browser.close();
server.close();
