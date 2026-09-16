// Evidence for openspec policeman-observes-agents: serve understanding-app/ statically (relative
// URLs, module script — the same way the harness proxies it) and screenshot the two state
// machines and the try-a-pass simulation. Run from client/: node tests/ui/shot-understanding-policeman.mjs
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const root = path.join(repo, 'understanding-app');
const OUT = path.join(repo, 'docs', 'screenshots');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = await readFile(path.join(root, p));
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
page.on('response', (r) => { if (r.status() === 404 && !/favicon/.test(r.url())) errs.push('404 ' + r.url()); });
await page.goto(base + '/index.html', { waitUntil: 'load' });
await page.click('[data-view="machines"]');
await page.waitForSelector('#fig-board [data-state="honest"]', { timeout: 5000 });
const states = await page.$$eval('#fig-board [data-state]', (els) => els.map((e) => e.dataset.state));
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-machines.png'), fullPage: true });
await page.click('[data-view="try"]');
await page.click('#run');
const cards = await page.$$eval('#try .card', (els) => els.length);
const moved = await page.$eval('#try', (e) => e.textContent);
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-try.png'), fullPage: true });
await browser.close();
server.close();
console.log(JSON.stringify({ states, cards, movedShown: /was Doing/.test(moved) && /Asked a question/.test(moved), errs }));
process.exit(errs.length === 0 && states.length === 4 && cards === 3 ? 0 : 1);
