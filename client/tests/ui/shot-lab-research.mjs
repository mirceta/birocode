// Evidence for fleet task aae448bd (Agentic Engineering Lab → Research → "Fleet vs
// worktrees"): serve lab/ over a throwaway static server (it needs fetch for ./data),
// open #fleet-vs-worktrees, and assert the study renders as promised — nav entry, 5
// approach cards, a 14×5 ratings matrix where every cell is 1–5 stars with a reason, a
// weighted-total row, three weight presets that change the winner (this fleet → the
// fleet; solo dev → worktrees; equal → cloud), pros/cons per approach, the verdict,
// sources — with no page errors and no 4xx asset. Screenshots to .claudeweb-preview/.
//
//   node client/tests/ui/shot-lab-research.mjs      (from the repo root or client/)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = path.resolve(clientRoot, '..', 'lab');
const OUT = path.resolve(clientRoot, '..', '.claudeweb-preview');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown' };
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
const r = {};
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  const nav = page.locator('#nav [data-route="fleet-vs-worktrees"]');
  r.navPresent = (await nav.count()) === 1;
  await nav.click();
  await page.waitForSelector('[data-matrix]', { timeout: 10000 });
  r.hash = await page.evaluate(() => location.hash);
  r.cards = await page.locator('.rs-card').count();
  r.rows = await page.locator('.rs-row:not(.rs-row--total)').count();
  const cells = await page.$$eval('.rs-row:not(.rs-row--total) .rs-td', (els) => els.map((e) => ({ s: Number(e.dataset.stars), reason: e.title.length, stars: e.querySelector('.rs-stars').textContent })));
  r.cells = cells.length;
  r.allCellsValid = cells.every((c) => c.s >= 1 && c.s <= 5 && c.reason > 10 && c.stars.length === 5 && (c.stars.match(/★/g) || []).length === c.s);
  r.totalsRow = await page.locator('.rs-row--total [data-total-cell]').count();
  const readBest = () => page.evaluate(() => document.getElementById('main').dataset.best);
  const readTotals = () => page.$$eval('[data-total-cell]', (els) => Object.fromEntries(els.map((e) => [e.dataset.totalCell, e.textContent.trim()])));
  r.bestFleetPreset = await readBest(); r.totals = { fleet: await readTotals() };
  await page.locator('[data-preset="solo"]').click();
  r.bestSoloPreset = await readBest(); r.totals.solo = await readTotals();
  await page.locator('[data-preset="equal"]').click();
  r.bestEqualPreset = await readBest(); r.totals.equal = await readTotals();
  await page.locator('[data-preset="fleet"]').click();
  r.prosCons = await page.locator('.rs-pc').count();
  r.verdict = (await page.locator('[data-verdict]').count()) === 1;
  r.sources = await page.locator('.rs-src').count();
  await page.locator('.rs-card[data-approach="fleet"]').click();
  r.highlightedCells = await page.locator('.rs-td.is-pick').count();
  await page.locator('.rs-card[data-approach="fleet"]').click();
  await page.screenshot({ path: path.join(OUT, 'lab-research-top.png'), fullPage: false });
  await page.locator('[data-matrix]').screenshot({ path: path.join(OUT, 'lab-research-matrix.png') });
  await page.locator('[data-verdict]').screenshot({ path: path.join(OUT, 'lab-research-verdict.png') });
  // The other views still work (the study loader must not break the notebook).
  await page.locator('#nav [data-route="learned"]').click();
  await page.waitForSelector('.card', { timeout: 10000 }); // hashchange renders asynchronously
  r.notebookStillRenders = (await page.locator('.card').count()) > 0;
} catch (e) {
  r.error = String(e);
} finally {
  await browser.close();
  srv.close();
}
r.errors = errs;
const ok = !r.error && errs.length === 0 && r.navPresent && r.hash === '#fleet-vs-worktrees' && r.cards === 5 && r.rows === 14 && r.cells === 70 && r.allCellsValid && r.totalsRow === 5
  && r.bestFleetPreset === 'fleet' && r.bestSoloPreset === 'worktrees' && r.bestEqualPreset === 'cloud' && r.prosCons === 5 && r.verdict && r.sources >= 6 && r.highlightedCells === 15 && r.notebookStillRenders;
console.log(JSON.stringify(r, null, 1));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
