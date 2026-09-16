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
await page.waitForFunction(() => window.cys && window.cys.agent && window.cys.agent.nodes().length > 0, null, { timeout: 10000 });
await page.setViewportSize({ width: 1400, height: 1000 });
const machine = await page.evaluate(() => {
  const c = window.cys;
  const n = (cy, sel) => cy.nodes(sel).length;
  return {
    agent: { states: n(c.agent, '[kind="state"]'), ref: c.agent.$('node[kind="ref"]').data('to'), edges: c.agent.edges().length, selfLoop: c.agent.edges('[source="armed"][target="armed"]').length },
    pass: { steps: n(c.pass, '[kind="step"]'), ref: c.pass.$('node[kind="ref"]').data('to'), edges: c.pass.edges().length },
    cards: { cards: n(c.cards, '[kind="card"]'), refs: n(c.cards, '[kind="ref"]'), edges: c.cards.edges().length },
    who: { s4: c.pass.$('#s4').data('who'), s1: c.pass.$('#s1').data('who'), offArmed: c.agent.$('edge[source="off"][target="armed"]').data('who'), offArmedStyle: c.agent.$('edge[source="off"][target="armed"]').style('line-style'), flowStyle: c.pass.$('edge[source="s1"][target="s2"]').style('line-style'), rolloverStyle: c.agent.$('edge[source="pass"][target="rollover"]').style('line-style'), glyph: c.pass.$('#s4').style('label').startsWith('🧠'), modelNodes: c.pass.nodes('.who-model').length, humanEdgesAgent: c.agent.edges('.who-human').length },
    shapes: { off: c.agent.$('#off').style('shape'), s1: c.pass.$('#s1').style('shape'), s4: c.pass.$('#s4').style('shape'), s6: c.pass.$('#s6').style('shape'), armed: c.agent.$('#armed').style('shape'), skip: c.cards.$('#c-skip').style('shape') },
  };
});
// Click Armed on the agent tab: only its edges light, no node shrinks, nothing dims; a second click clears.
const click = await page.evaluate(() => { const cy = window.cys.agent; const n = cy.$('#armed'); const before = n.width(); n.emit('tap'); const lit = cy.edges('.lit').length; const dimmed = cy.elements('.dim').length; const after = n.width(); const startLabel = cy.$('#off').data('label'); const startTone = cy.$('#off').data('tone'); const r = { lit, dimmed, sameWidth: before === after, startLabel, startTone }; n.emit('tap'); r.cleared = cy.elements('.lit').length === 0; n.emit('tap'); return r; });
await page.evaluate(() => { window.cys.agent.resize(); window.cys.agent.fit(undefined, 40); });
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-state-diagram-agent.png'), fullPage: false });
// The stand-in opens the next level.
await page.evaluate(() => window.cys.agent.$('node[kind="ref"]').emit('tap'));
await page.waitForSelector('#cy-pass.is-on', { timeout: 5000 });
const tabAfterRef = await page.$eval('[data-tabs] .tab.is-on', (e) => e.dataset.level);
await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-state-diagram.png'), fullPage: false });
await page.click('[data-level="cards"]');
await page.waitForSelector('#cy-cards.is-on', { timeout: 5000 });
await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-state-diagram-cards.png'), fullPage: false });
// Colour by who decides: the toggle recolours every node; the pass tab in that mode is the picture that answers "prompt or program?".
await page.click('#cy-who');
const whoMode = await page.evaluate(() => ({ on: document.body.classList.contains('by-who'), s4Border: window.cys.pass.$('#s4').style('border-color'), s1Border: window.cys.pass.$('#s1').style('border-color'), byWhoNodes: window.cys.pass.nodes('.by-who').length }));
await page.click('[data-level="pass"]');
await page.waitForSelector('#cy-pass.is-on', { timeout: 5000 });
await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
await page.screenshot({ path: path.join(OUT, 'understanding-policeman-state-diagram-who.png'), fullPage: false });
await browser.close();
server.close();
const clickOk = click.lit === 12 && click.dimmed === 0 && click.sameWidth && click.cleared && /^START/.test(click.startLabel) && click.startTone === 'start';
const shapesOk = machine.shapes.off === 'round-rectangle' && machine.shapes.s1 === 'rhomboid' && machine.shapes.s4 === 'diamond' && machine.shapes.s6 === 'rectangle' && machine.shapes.armed === 'round-rectangle' && machine.shapes.skip === 'round-rectangle';
const whoOk = machine.who.s4 === 'model' && machine.who.s1 === 'code' && machine.who.offArmed === 'human' && machine.who.offArmedStyle === 'dotted' && machine.who.flowStyle === 'dashed' && machine.who.rolloverStyle === 'solid' && machine.who.glyph && machine.who.modelNodes === 2 && machine.who.humanEdgesAgent === 8 && whoMode.on && whoMode.s4Border !== whoMode.s1Border && whoMode.byWhoNodes === 9;
const machineOk = clickOk && shapesOk && whoOk && tabAfterRef === 'pass' && machine.agent.states === 7 && machine.agent.ref === 'pass' && machine.agent.edges === 16 && machine.agent.selfLoop === 1 && machine.pass.steps === 8 && machine.pass.ref === 'cards' && machine.pass.edges === 10 && machine.cards.cards === 9 && machine.cards.refs === 0 && machine.cards.edges === 14;
console.log(JSON.stringify({ machine, click, tabAfterRef, whoMode, whoOk, machineOk, errs }));
process.exit(errs.length === 0 && machineOk ? 0 : 1);
