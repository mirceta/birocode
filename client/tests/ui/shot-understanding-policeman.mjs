// Evidence for openspec policeman-observes-agents: serve understanding-app/ statically (relative
// URLs, module script — the same way the harness proxies it), assert the cytoscape state diagram
// (three nested levels, click-to-highlight) and screenshot the three views. Run from client/: node tests/ui/shot-understanding-policeman.mjs
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
await page.waitForFunction(() => window.cy && window.cy.nodes().length > 0, null, { timeout: 10000 });
const machine = await page.evaluate(() => ({
  states: window.cy.nodes('[kind="state"]').length, steps: window.cy.nodes('[kind="step"]').length, cards: window.cy.nodes('[kind="card"]').length,
  groups: window.cy.nodes('[kind="group"]').map((n) => n.id()), edges: window.cy.edges().length,
  passInsideAgent: window.cy.$('#pass').parent().id(), cardsInsidePass: window.cy.$('#cards').parent().id(),
  selfLoop: window.cy.edges('[source="armed"][target="armed"]').length,
  shapes: { off: window.cy.$('#off').style('shape'), s1: window.cy.$('#s1').style('shape'), s4: window.cy.$('#s4').style('shape'), s6: window.cy.$('#s6').style('shape'), armed: window.cy.$('#armed').style('shape'), skip: window.cy.$('#c-skip').style('shape') },
}));
await page.setViewportSize({ width: 1400, height: 1500 });
await page.evaluate(() => { window.cy.resize(); window.cy.fit(undefined, 30); });
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-state-diagram.png'), fullPage: false });
await page.evaluate(() => window.cy.animate({ fit: { eles: window.cy.$('#cards'), padding: 30 }, duration: 0 }));
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-state-diagram-cards.png'), fullPage: false });
await page.evaluate(() => window.cy.animate({ fit: { eles: window.cy.$('node[kind="state"], node#pass'), padding: 30 }, duration: 0 }));
// Click Armed: only its edges light, no node shrinks, nothing dims; a second click clears.
const click = await page.evaluate(() => { const cy = window.cy; const n = cy.$('#armed'); const before = n.width(); n.emit('tap'); const lit = cy.edges('.lit').length; const dimmed = cy.elements('.dim').length; const after = n.width(); n.emit('tap'); return { lit, dimmed, sameWidth: before === after, cleared: cy.elements('.lit').length === 0, startLabel: cy.$('#off').data('label'), startTone: cy.$('#off').data('tone') }; });
await page.evaluate(() => window.cy.$('#armed').emit('tap'));
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-state-diagram-agent.png'), fullPage: false });
await page.evaluate(() => window.cy.$('#armed').emit('tap'));
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-state-diagram-agent.png'), fullPage: false });
await browser.close();
server.close();
const clickOk = click.lit === 12 && click.dimmed === 0 && click.sameWidth && click.cleared && /^START/.test(click.startLabel) && click.startTone === 'start';
const shapesOk = machine.shapes.off === 'round-rectangle' && machine.shapes.s1 === 'rhomboid' && machine.shapes.s4 === 'diamond' && machine.shapes.s6 === 'rectangle' && machine.shapes.armed === 'round-rectangle' && machine.shapes.skip === 'round-rectangle';
const machineOk = clickOk && shapesOk && machine.states === 7 && machine.steps === 8 && machine.cards === 9 && machine.groups.length === 3 && machine.passInsideAgent === 'agent' && machine.cardsInsidePass === 'pass' && machine.selfLoop === 1 && machine.edges === 40;
console.log(JSON.stringify({ machine, click, machineOk, errs }));
process.exit(errs.length === 0 && machineOk ? 0 : 1);
