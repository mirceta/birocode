// Evidence for openspec one-policeman: serve understanding-app/ statically (relative URLs, module
// script — the same way the harness proxies it), assert the four cytoscape tabs (the parts · the
// loop · each card · before), click-to-highlight, the who-decides toggle, and screenshot them.
// Run from client/: node tests/ui/shot-understanding-policeman.mjs
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
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
page.on('response', (r) => { if (r.status() === 404 && !/favicon/.test(r.url())) errs.push('404 ' + r.url()); });
await page.goto(base + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.cys && window.cys.parts && window.cys.parts.nodes().length > 0, null, { timeout: 10000 });
const startTab = await page.$eval('[data-tabs] .tab.is-on', (e) => e.dataset.level);
const tabs = await page.$$eval('[data-tabs] .tab', (els) => els.map((e) => e.dataset.level));
const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
const shot = async (level, file) => {
  await page.click(`[data-level="${level}"]`);
  await page.waitForSelector(`#cy-${level}.is-on`, { timeout: 5000 });
  await page.evaluate((l) => { window.cys[l].resize(); window.cys[l].fit(undefined, 40); }, level);
  await settle();
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
};
const measure = await page.evaluate(() => {
  const c = window.cys;
  const n = (cy, sel) => cy.nodes(sel).length;
  return {
    parts: { parts: n(c.parts, '[kind="part"]'), outside: n(c.parts, '[kind="outside"]'), box: c.parts.$('#policeman').isParent(), inBox: c.parts.$('#policeman').children().length, edges: c.parts.edges().length, readerWho: c.parts.$('#p-reader').data('who') },
    loop: { steps: n(c.loop, '[kind="step"]'), brains: c.loop.nodes('.who-model').length, edges: c.loop.edges().length, timer: c.loop.$('#m-timer').style('shape'), ask: c.loop.$('#m-ask').style('shape'), decision: c.loop.$('#m-new').style('shape'), askGlyph: c.loop.$('#m-ask').style('label').startsWith('🧠'), answerStyle: c.loop.$('edge[source="m-ask"][target="m-write"]').style('line-style'), timerStyle: c.loop.$('edge[source="m-timer"][target="m-trace"]').style('line-style') },
    cards: { cards: n(c.cards, '[kind="card"]'), edges: c.cards.edges().length, humanEdges: c.cards.edges('.who-human').length },
    before: { groups: n(c.before, '[kind="group"]'), today: c.before.$('#today').children().length, one: c.before.$('#one').children().length, edges: c.before.edges().length },
  };
});
// Click a step on the loop tab: only its edges light, no node shrinks; a second click clears.
await page.click('[data-level="loop"]');
await page.waitForSelector('#cy-loop.is-on', { timeout: 5000 });
const click = await page.evaluate(() => { const cy = window.cys.loop; const nd = cy.$('#m-new'); const before = nd.width(); nd.emit('tap'); const r = { lit: cy.edges('.lit').length, sameWidth: nd.width() === before, startLabel: cy.$('#m-timer').data('label'), startTone: cy.$('#m-timer').data('tone') }; nd.emit('tap'); r.cleared = cy.elements('.lit').length === 0; return r; });
await shot('parts', 'understanding-policeman-parts.png');
await shot('loop', 'understanding-policeman-loop.png');
await page.click('#cy-who');
const whoMode = await page.evaluate(() => ({ on: document.body.classList.contains('by-who'), askBorder: window.cys.loop.$('#m-ask').style('border-color'), factsBorder: window.cys.loop.$('#m-facts').style('border-color'), byWhoNodes: window.cys.loop.nodes('.by-who').length }));
await settle();
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-loop-who.png'), fullPage: false });
await page.click('#cy-who');
await shot('cards', 'understanding-policeman-cards.png');
await shot('before', 'understanding-policeman-before.png');
await browser.close();
server.close();

const ok = startTab === 'parts' && tabs.join(',') === 'parts,loop,cards,before'
  && measure.parts.parts === 4 && measure.parts.outside === 4 && measure.parts.box && measure.parts.inBox === 4 && measure.parts.edges === 9 && measure.parts.readerWho === 'model'
  && measure.loop.steps === 10 && measure.loop.brains === 1 && measure.loop.edges === 12 && measure.loop.timer === 'round-rectangle' && measure.loop.ask === 'rectangle' && measure.loop.decision === 'diamond' && measure.loop.askGlyph && measure.loop.answerStyle === 'dashed' && measure.loop.timerStyle === 'solid'
  && measure.cards.cards === 9 && measure.cards.edges === 14 && measure.cards.humanEdges === 4
  && measure.before.groups === 2 && measure.before.today === 3 && measure.before.one === 1 && measure.before.edges === 4
  && click.lit === 3 && click.sameWidth && click.cleared && /^every 60 s/.test(click.startLabel) && click.startTone === 'start'
  && whoMode.on && whoMode.askBorder !== whoMode.factsBorder && whoMode.byWhoNodes === 10;
console.log(JSON.stringify({ startTab, tabs, measure, click, whoMode, errs, ok }));
process.exit(errs.length === 0 && ok ? 0 : 1);
