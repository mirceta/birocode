// Research (fleet task 9973393e): can the dashboard put ONE TAB PER AGENT inside the dedicated
// harness window? A page can only open tabs into the window that hosts it, so the candidate
// is: the harness window hosts a same-origin LAUNCHER page, the dashboard keeps its handle
// and asks IT to open the agent tabs. Measured in headed Chrome with the popup blocker ON
// (Playwright's --disable-popup-blocking removed) and CDP Browser.getWindowForTarget to
// learn which OS window every page landed in.
//   node check-harness-tabs.mjs
import http from 'node:http';
import { chromium } from 'playwright';

const pages = {
  '/dash.html': `<!doctype html><title>dash</title><button id="mk">make launcher (popup)</button><button id="mkTab">make launcher (tab)</button>
<button id="a">agent A</button><button id="b">agent B</button><script>
let L = null;
function launcher(features) { L = window.open('/launcher.html', 'birocode-harness-window', features); }
document.getElementById('mk').onclick = () => launcher('popup=1,left=100,top=100,width=900,height=700');
document.getElementById('mkTab').onclick = () => launcher(undefined);
function openAgent(name, url) { const h = window.open('', 'birocode-harness-window'); window.__lastHandleOk = !!h; return h && h.__openAgent ? h.__openAgent(name, url) : 'no-launcher'; }
document.getElementById('a').onclick = () => { window.__r = openAgent('birocode-agent-a', '/agent.html?a'); };
document.getElementById('b').onclick = () => { window.__r = openAgent('birocode-agent-b', '/agent.html?b'); };
</script>`,
  '/launcher.html': `<!doctype html><title>launcher</title><p>harness launcher</p><script>
window.__openAgent = (name, url) => { const w = window.open('', name); if (!w) return 'blocked'; let fresh = false; try { fresh = w.location.href === 'about:blank'; } catch {} if (fresh) w.location.href = url; try { w.focus(); } catch {} return fresh ? 'opened' : 'focused'; };
</script>`,
  '/agent.html': `<!doctype html><title>agent</title><p>agent page</p><script>window.__loads = (window.__loads||0)+1; window.__born = Date.now(); window.__state = 'kept';</script>`,
};
const server = http.createServer((req, res) => { const p = new URL(req.url, 'http://x').pathname; const body = pages[p]; if (!body) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', 'text/html'); res.end(body); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// POPUPS_ALLOWED=1 keeps Playwright's --disable-popup-blocking, standing in for the Operator's
// one-time "Pop-ups and redirects: Allow" for the dashboard's site.
const launchOpts = process.env.POPUPS_ALLOWED === '1' ? { headless: false } : { headless: false, ignoreDefaultArgs: ['--disable-popup-blocking'] };
const browser = await chromium.launch({ channel: 'chrome', ...launchOpts }).catch(() => chromium.launch(launchOpts));
const ctx = await browser.newContext();
const winOf = async (page) => { const s = await ctx.newCDPSession(page); const r = await s.send('Browser.getWindowForTarget'); await s.detach(); return r.windowId; };
const results = {};
const info = [];

async function scenario(label, makeSelector) {
  const dash = await ctx.newPage();
  await dash.goto(`${base}/dash.html`);
  const dashWin = await winOf(dash);
  const [launcher] = await Promise.all([ctx.waitForEvent('page'), dash.click(makeSelector)]);
  await launcher.waitForLoadState();
  const launcherWin = await winOf(launcher);
  const launcherToolbar = await launcher.evaluate(() => window.toolbar.visible);
  // First click on agent A: a new tab must appear; where?
  const [pageA] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), dash.click('#a')]);
  const rA = await dash.evaluate(() => window.__r);
  let winA = null, born = null;
  if (pageA) { await pageA.waitForLoadState(); winA = await winOf(pageA); born = await pageA.evaluate(() => window.__born); }
  // Second click on A: must NOT reload (same __born), must be focused.
  const pagesBefore = ctx.pages().length;
  await dash.click('#a');
  await dash.waitForTimeout(400);
  const rA2 = await dash.evaluate(() => window.__r);
  const bornAfter = pageA ? await pageA.evaluate(() => window.__born) : null;
  const noNewPage = ctx.pages().length === pagesBefore;
  // Agent B: a second tab, in the same window as A?
  const [pageB] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), dash.click('#b')]);
  let winB = null;
  if (pageB) { await pageB.waitForLoadState(); winB = await winOf(pageB); }
  const rB = await dash.evaluate(() => window.__r);
  // A third agent after a pause, and once more after the Operator clicked INSIDE the launcher (activation there).
  await dash.waitForTimeout(1500);
  await dash.evaluate(() => { document.getElementById('b').onclick = () => { window.__r = (function(){ const h = window.open('', 'birocode-harness-window'); return h && h.__openAgent ? h.__openAgent('birocode-agent-c', '/agent.html?c') : 'no-launcher'; })(); }; });
  const [pageC] = await Promise.all([ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null), dash.click('#b')]);
  const rC = await dash.evaluate(() => window.__r);
  await launcher.bringToFront(); await launcher.click('p').catch(() => {});
  await dash.bringToFront();
  await dash.evaluate(() => { document.getElementById('b').onclick = () => { window.__r = (function(){ const h = window.open('', 'birocode-harness-window'); return h && h.__openAgent ? h.__openAgent('birocode-agent-d', '/agent.html?d') : 'no-launcher'; })(); }; });
  const [pageD] = await Promise.all([ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null), dash.click('#b')]);
  const rD = await dash.evaluate(() => window.__r);
  const r = {
    launcherIsOwnWindow: launcherWin !== dashWin, launcherToolbarVisible: launcherToolbar,
    firstOpenResult: rA, agentTabAppeared: !!pageA, agentInLauncherWindow: winA !== null && winA === launcherWin, agentInDashWindow: winA !== null && winA === dashWin,
    reclickResult: rA2, reclickDidNotReload: pageA ? born === bornAfter : null, reclickOpenedNothingNew: noNewPage,
    agentBAppeared: !!pageB, agentBResult: rB, agentBSameWindowAsA: winA !== null && winB === winA, agentCAfterPause: { appeared: !!pageC, result: rC }, agentDAfterLauncherClick: { appeared: !!pageD, result: rD },
    windows: { dash: dashWin, launcher: launcherWin, a: winA, b: winB },
  };
  results[label] = r;
  info.push(`${label}: ${JSON.stringify(r)}`);
  for (const p of ctx.pages()) await p.close().catch(() => {});
}

await scenario('launcher as POPUP window (features)', '#mk');
await scenario('launcher as a plain TAB (no features)', '#mkTab');

// Baseline: per-agent names with features straight from the dashboard = one popup per agent.
const dash = await ctx.newPage();
await dash.goto(`${base}/dash.html`);
await dash.evaluate(() => { document.getElementById('a').onclick = () => { const w = window.open('', 'x-a', 'popup=1,left=50,top=50,width=600,height=400'); if (w.location.href === 'about:blank') w.location.href = '/agent.html?a'; }; document.getElementById('b').onclick = () => { const w = window.open('', 'x-b', 'popup=1,left=50,top=50,width=600,height=400'); if (w.location.href === 'about:blank') w.location.href = '/agent.html?b'; }; });
const [pa] = await Promise.all([ctx.waitForEvent('page'), dash.click('#a')]);
const [pb] = await Promise.all([ctx.waitForEvent('page'), dash.click('#b')]);
results.baselinePerAgentPopups = { separateWindows: (await winOf(pa)) !== (await winOf(pb)) };

await browser.close();
server.close();
console.log(JSON.stringify(results, null, 1));
