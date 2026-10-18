// Research (fleet task d3af3b9b), part 2: which kinds of dashboard "refresh" break the dashboard -> launcher
// NAME link (the PR #124/#125 design)? Real Chrome, popups allowed (the design's prerequisite).
//   node check-left-window-reload.mjs
import http from 'node:http';
import { chromium } from 'playwright';

const pages = {
  '/dash.html': `<!doctype html><title>dash</title><button id="mkL">make launcher</button><script>
document.getElementById('mkL').onclick = () => { window.open('/host.html', 'birocode-harness-window'); };
window.lookup = () => { const h = window.open('', 'birocode-harness-window'); let href = null; try { href = h && h.location.href; } catch { href = 'cross-origin'; } if (href === 'about:blank') h.close(); return href; };
</script>`,
  '/host.html': '<!doctype html><title>host</title><p>host</p>',
};
let up = true;
const server = http.createServer((req, res) => { if (!up) { req.socket.destroy(); return; } const body = pages[new URL(req.url, 'http://x').pathname]; if (!body) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', 'text/html'); res.end(body); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext();
const out = {};
const rec = (k, v) => { out[k] = v; console.log(k.padEnd(60), JSON.stringify(v)); };

async function trial(label, refresh) {
  const dash = await ctx.newPage();
  await dash.goto(`${base}/dash.html`);
  const [host] = await Promise.all([ctx.waitForEvent('page'), dash.click('#mkL')]);
  await host.waitForLoadState();
  await refresh(dash);
  await dash.waitForLoadState();
  await dash.click('body'); // the lookup runs from a click in the real dashboard
  const href = await dash.evaluate(() => window.lookup());
  rec(`${label}: launcher still found by name`, href !== 'about:blank' && href !== null);
  await host.close().catch(() => {});
  await dash.close();
}
await trial('F5 reload', (d) => d.reload());
await trial('omnibox: same URL typed again', (d) => d.goto(`${base}/dash.html`));
await trial('harness restart: reload hits an error page, then reload again', async (d) => {
  up = false; await d.reload().catch(() => {}); await d.waitForTimeout(500); up = true; await d.evaluate(() => location.reload()).catch(() => {}); await d.waitForTimeout(1500);
});
await trial('omnibox: typed after an error page', async (d) => {
  up = false; await d.goto(`${base}/dash.html`).catch(() => {}); await d.waitForTimeout(500); up = true; await d.goto(`${base}/dash.html`).catch(() => {}); await d.waitForTimeout(1500);
});
console.log('@@RESULT@@', JSON.stringify(out));
await browser.close();
server.close();
