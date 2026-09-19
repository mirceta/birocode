// Operator report 2026-09-19 (after PR #124): window mode + "One tab per agent" — the FIRST click
// on an agent opens its tab in the harness window; the SECOND click on the same agent brings the
// LAUNCHER tab ("harness window") to the front instead of the agent's tab. check-harness-tabs.mjs
// only measured 'focused' + no reload on the re-click, never WHICH tab is on top. This measures
// visibilityState of dashboard / launcher / agent A after the re-click, for the current code and
// for candidate fixes, in headed Chrome with pop-ups allowed (the Operator's setup).
//   node check-harness-reclick.mjs
import http from 'node:http';
import { chromium } from 'playwright';

const pages = {
  '/dash.html': `<!doctype html><title>dash</title><button id="mk">make launcher</button><button id="a">agent A</button><button id="b">agent B</button><script>
let L = null;
const V = new URLSearchParams(location.search).get('v') || 'current';
document.getElementById('mk').onclick = () => { L = window.open('/launcher.html', 'birocode-harness-window'); };
function launcherHandle() {
  if (V.includes('cached') && L && !L.closed) { window.__lookedUp = false; return L; }
  window.__lookedUp = true;
  L = window.open('', 'birocode-harness-window');
  return L;
}
function openAgent(name, url) {
  const h = launcherHandle();
  if (!h || !h.__openAgent) return 'no-launcher';
  const r = h.__openAgent(name, url);              // { result, w }
  if (V.includes('dashfocus') && r.w) { try { r.w.focus(); } catch (e) { window.__focusErr = String(e); } }
  // candidate: the dashboard (which holds the click's activation) RAISES the existing tab itself
  // with window.open('', name) — Chrome activates an existing named target on window.open.
  if (V.includes('dashopen') && r.result === 'focused') { const w2 = window.open('', name); window.__dashOpenSame = w2 === r.w; }
  return r.result;
}
document.getElementById('a').onclick = () => { window.__r = openAgent('birocode-agent-a', '/agent.html?a'); };
document.getElementById('b').onclick = () => { window.__r = openAgent('birocode-agent-b', '/agent.html?b'); };
</script>`,
  '/launcher.html': `<!doctype html><title>launcher</title><p>harness launcher</p><script>
window.__openAgent = (name, url) => { const w = window.open('', name); if (!w) return { result: 'blocked', w: null }; let fresh = false; try { fresh = w.location.href === 'about:blank'; } catch {} if (fresh) w.location.href = url; try { w.focus(); } catch {} return { result: fresh ? 'opened' : 'focused', w }; };
</script>`,
  '/agent.html': `<!doctype html><title>agent</title><p>agent page</p><script>window.__born = Date.now();</script>`,
};
const server = http.createServer((req, res) => { const p = new URL(req.url, 'http://x').pathname; const body = pages[p]; if (!body) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', 'text/html'); res.end(body); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', headless: false }).catch(() => chromium.launch({ headless: false }));
// Playwright emulates focus/visibility on every page (all report visible+focus) — switch that
// off per page so document.visibilityState is Chrome's REAL tab state (hidden = not the active tab).
const raw = new WeakSet();
const vis = async (p) => {
  if (!p) return 'none';
  try {
    if (!raw.has(p)) { const s = await p.context().newCDPSession(p); await s.send('Emulation.setFocusEmulationEnabled', { enabled: false }); raw.add(p); }
    return await p.evaluate(() => `${document.visibilityState}${document.hasFocus() ? '+focus' : ''}`);
  } catch { return 'gone'; }
};

async function scenario(variant) {
  const ctx = await browser.newContext();
  const dash = await ctx.newPage();
  await dash.goto(`${base}/dash.html?v=${variant}`);
  const [launcher] = await Promise.all([ctx.waitForEvent('page'), dash.click('#mk')]);
  await launcher.waitForLoadState();
  await dash.bringToFront();
  // first click on A
  const [pageA] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), dash.click('#a')]);
  if (pageA) await pageA.waitForLoadState();
  await dash.waitForTimeout(300);
  const afterFirst = { r: await dash.evaluate(() => window.__r), dash: await vis(dash), launcher: await vis(launcher), a: await vis(pageA) };
  // back to the dashboard (the Operator is on the other monitor), then re-click A
  await dash.bringToFront();
  await dash.waitForTimeout(200);
  const n0 = ctx.pages().length;
  await dash.click('#a');
  await dash.waitForTimeout(500);
  const afterReclick = { r: await dash.evaluate(() => window.__r), lookedUp: await dash.evaluate(() => window.__lookedUp), focusErr: await dash.evaluate(() => window.__focusErr || null), dashOpenSame: await dash.evaluate(() => window.__dashOpenSame ?? null), newPages: ctx.pages().length - n0, dash: await vis(dash), launcher: await vis(launcher), a: await vis(pageA) };
  // and B, then A again (the Operator's A / B / A test)
  await dash.bringToFront();
  const [pageB] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), dash.click('#b')]);
  if (pageB) await pageB.waitForLoadState();
  await dash.waitForTimeout(300);
  await dash.bringToFront();
  await dash.waitForTimeout(200);
  await dash.click('#a');
  await dash.waitForTimeout(500);
  const afterABA = { r: await dash.evaluate(() => window.__r), dashOpenSame: await dash.evaluate(() => window.__dashOpenSame ?? null), newPages: ctx.pages().length - n0 - (pageB ? 1 : 0), dash: await vis(dash), launcher: await vis(launcher), a: await vis(pageA), b: await vis(pageB) };
  await ctx.close();
  return { afterFirst, afterReclick, afterABA };
}

const out = {};
for (const v of (process.env.VARIANTS || 'current,cached,dashfocus,cached+dashfocus').split(',')) out[v] = await scenario(v);
await browser.close();
server.close();
console.log(JSON.stringify(out, null, 1));
