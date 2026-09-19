// Evidence shot for fleet task f7224e55 (Goal app: investigation + rendered understanding):
// serve understanding-app/ over a throwaway static server (ES modules do not load over
// file://), render the three tabs, exercise the "show on the diagram" jump from a question,
// and fail on any page error / 4xx asset. Screenshots go to .claudeweb-preview/.
//
//   node client/tests/ui/shot-goal-app-understanding.mjs   (from the repo root or client/)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = path.resolve(clientRoot, '..', 'understanding-app');
const OUT = path.resolve(clientRoot, '..', '.claudeweb-preview');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const srv = http.createServer((req, res) => {
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(root, rel);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });

await page.goto(base, { waitUntil: 'networkidle' });
const canvases = await page.evaluate(() => document.querySelectorAll('#cy-today canvas').length);
await page.screenshot({ path: path.join(OUT, 'goal-app-understanding-0-today.png') });
await page.click('[data-level="goal"]');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'goal-app-understanding-1-goal.png') });
await page.click('[data-level="questions"]');
await page.waitForTimeout(200);
const questions = await page.$$eval('.q', (els) => els.length);
await page.screenshot({ path: path.join(OUT, 'goal-app-understanding-2-questions.png') });
await page.click('.q:nth-of-type(3) summary'); // Q3 starts collapsed; open it first
await page.click('.q:nth-of-type(3) .jump');
await page.waitForTimeout(500);
const jumpedTo = await page.evaluate(() => document.querySelector('#d-title').textContent);
const onGoalTab = await page.evaluate(() => document.querySelector('#cy-goal').classList.contains('is-on'));
await page.screenshot({ path: path.join(OUT, 'goal-app-understanding-3-jump.png') });
await browser.close();
srv.close();

console.log(JSON.stringify({ canvases, questions, jumpedTo, onGoalTab, errors: errs }, null, 1));
process.exit(errs.length === 0 && canvases > 0 && questions === 9 && onGoalTab ? 0 : 1);
