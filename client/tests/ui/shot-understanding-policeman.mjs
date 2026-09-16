// Evidence for openspec policeman-observes-agents: serve understanding-app/ statically (relative
// URLs, module script — the same way the harness proxies it), assert the five one-owner-per-graph
// cytoscape machines (three deterministic, two prompt; the contract boundary; the click highlight)
// and screenshot each tab. Run from client/: node tests/ui/shot-understanding-policeman.mjs
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
page.on('response', (r) => { if (r.status() === 404 && !/favicon/.test(r.url())) errs.push('404 ' + r.url()); });
await page.goto(base + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.cys && window.cys.loop && window.cys.loop.nodes().length > 0, null, { timeout: 10000 });

const machines = await page.evaluate(() => {
  const out = {};
  for (const [k, cy] of Object.entries(window.cys)) {
    out[k] = {
      nodes: cy.nodes().length, edges: cy.edges().length,
      modelNodes: cy.nodes('.who-model').map((n) => n.id()), modelEdges: cy.edges('.who-model').map((e) => e.id()),
      contract: cy.nodes('.shape-contract').map((n) => n.id()), promptGroup: cy.nodes('.group-prompt').length,
      whereOnAll: cy.nodes().every((n) => n.data('where')) && cy.edges().every((e) => e.data('where')),
      labelHasWhere: cy.nodes().every((n) => n.style('label').includes('↳ ')),
    };
  }
  return out;
});
// Click Armed on the loop graph: only its arrows light, no box shrinks; a second click clears.
const click = await page.evaluate(() => { const cy = window.cys.loop; const n = cy.$('#armed'); const before = n.width(); n.emit('tap'); const lit = cy.edges('.lit').length; const after = n.width(); n.emit('tap'); return { lit, sameWidth: before === after, cleared: cy.elements('.lit').length === 0 }; });

const shots = { loop: 'understanding-policeman-1-loop.png', facts: 'understanding-policeman-2-facts.png', tools: 'understanding-policeman-3-tools.png', 'prompt-pass': 'understanding-policeman-4-prompt-pass.png', 'prompt-cards': 'understanding-policeman-5-prompt-cards.png' };
const titles = {};
for (const [key, file] of Object.entries(shots)) {
  await page.click(`[data-machine="${key}"]`);
  await page.waitForSelector(`#cy-${key}.is-on`, { timeout: 5000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
  titles[key] = await page.$eval('#m-title', (e) => e.textContent);
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
}
// The stand-in on the prompt-pass graph opens the prompt-cards graph.
await page.click('[data-machine="prompt-pass"]');
await page.waitForSelector('#cy-prompt-pass.is-on', { timeout: 5000 });
await page.evaluate(() => window.cys['prompt-pass'].$('#cards').emit('tap'));
await page.waitForSelector('#cy-prompt-cards.is-on', { timeout: 5000 });
const refOpens = await page.$eval('[data-tabs] .tab.is-on', (e) => e.dataset.machine);
await browser.close();
server.close();

const m = machines;
const ok = {
  fiveMachines: Object.keys(m).length === 5,
  whereEverywhere: Object.values(m).every((x) => x.whereOnAll && x.labelHasWhere),
  loopIsCodeButTheContract: m.loop.modelNodes.join() === 'pass' && m.loop.modelEdges.join() === 'pass->wait' && m.loop.contract.join() === 'pass' && m.loop.promptGroup === 0,
  factsIsAllCode: m.facts.modelNodes.length === 0 && m.facts.modelEdges.length === 0 && m.facts.nodes === 16,
  toolsContractIsTheCli: m.tools.modelNodes.join() === 'cli' && m.tools.contract.join() === 'cli' && m.tools.nodes === 15,
  promptGraphsAreAllModel: m['prompt-pass'].promptGroup === m['prompt-pass'].nodes && m['prompt-cards'].promptGroup === m['prompt-cards'].nodes,
  titlesSayTheOwner: /DETERMINISTIC/.test(titles.loop) && /DETERMINISTIC/.test(titles.tools) && /PROMPT/.test(titles['prompt-pass']) && /PROMPT/.test(titles['prompt-cards']),
  clickHighlight: click.lit === 12 && click.sameWidth && click.cleared,
  refOpensNextGraph: refOpens === 'prompt-cards',
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ machines: m, click, titles, refOpens, ok, errs }));
process.exit(Object.values(ok).every(Boolean) ? 0 : 1);
