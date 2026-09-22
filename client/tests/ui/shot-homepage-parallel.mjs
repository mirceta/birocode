// Evidence for fleet task aae448bd (homepage tab "Fleet vs worktrees"): serve homepage/
// with its own serve.mjs on a spare port, open the tab, and assert the findings render as
// promised — 5 approach cards, a 14×5 ratings matrix where every cell is 1–5 stars with a
// reason, a weighted-total row, three weight presets that change the winner (this fleet →
// the fleet; solo dev → worktrees), pros/cons per approach, the verdict, sources — with no
// page errors and no 4xx asset (relative URLs). Screenshots to .claudeweb-preview/.
//
//   node client/tests/ui/shot-homepage-parallel.mjs      (from the repo root or client/)

import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(clientRoot, '..');
const OUT = path.resolve(repoRoot, '.claudeweb-preview');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5399;

const srv = spawn(process.execPath, [path.join(repoRoot, 'homepage', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
const r = {};
try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 30000 });
  const tab = page.locator('.topics__tab[data-id="parallel"]');
  r.tabPresent = (await tab.count()) === 1;
  await tab.click();
  await page.waitForSelector('[data-matrix]', { timeout: 10000 });
  r.cards = await page.locator('.pa-card').count();
  r.rows = await page.locator('.pa-row:not(.pa-row--total)').count();
  const cells = await page.$$eval('.pa-row:not(.pa-row--total) .pa-td', (els) => els.map((e) => ({ s: Number(e.dataset.stars), reason: e.title.length, stars: e.querySelector('.pa-stars').textContent })));
  r.cells = cells.length;
  r.allCellsValid = cells.every((c) => c.s >= 1 && c.s <= 5 && c.reason > 10 && c.stars.length === 5 && (c.stars.match(/★/g) || []).length === c.s);
  r.totalsRow = await page.locator('.pa-row--total [data-total-cell]').count();
  const readBest = () => page.evaluate(() => document.querySelector('.topic--parallel').dataset.best);
  const readTotals = () => page.$$eval('[data-total-cell]', (els) => Object.fromEntries(els.map((e) => [e.dataset.totalCell, e.textContent.trim()])));
  r.bestFleetPreset = await readBest();
  r.totals = { fleet: await readTotals() };
  await page.locator('[data-preset="solo"]').click();
  r.bestSoloPreset = await readBest();
  r.totals.solo = await readTotals();
  await page.locator('[data-preset="equal"]').click();
  r.bestEqualPreset = await readBest();
  r.totals.equal = await readTotals();
  await page.locator('[data-preset="fleet"]').click();
  r.prosCons = await page.locator('.pa-pc__box').count();
  r.verdict = (await page.locator('[data-verdict]').count()) === 1;
  r.sources = await page.locator('.ls-source').count();
  await page.locator('.pa-card[data-approach="fleet"]').click();
  r.highlightedCells = await page.locator('.pa-td.is-sel').count();
  await page.locator('.pa-card[data-approach="fleet"]').click();
  await page.screenshot({ path: path.join(OUT, 'homepage-parallel-top.png'), fullPage: false });
  await page.locator('[data-matrix]').screenshot({ path: path.join(OUT, 'homepage-parallel-matrix.png') });
  await page.locator('[data-verdict]').screenshot({ path: path.join(OUT, 'homepage-parallel-verdict.png') });
} catch (e) {
  r.error = String(e);
} finally {
  await browser.close();
  srv.kill();
}
r.errors = errs;
const ok = !r.error && errs.length === 0 && r.tabPresent && r.cards === 5 && r.rows === 14 && r.cells === 70 && r.allCellsValid && r.totalsRow === 5
  && r.bestFleetPreset === 'fleet' && r.bestSoloPreset === 'worktrees' && r.bestEqualPreset === 'cloud' && r.prosCons === 5 && r.verdict && r.sources >= 6 && r.highlightedCells === 15;
console.log(JSON.stringify(r, null, 1));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
