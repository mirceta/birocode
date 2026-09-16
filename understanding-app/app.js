// Understanding app — the Kanban policeman as a state diagram in three levels (openspec
// policeman-observes-agents). Build-less, relative URLs only; cytoscape is vendored; the data
// module is a vendored copy of client/src/components/taskgraph/policemanStateMachine.js.
import { LEVELS, WHO, levelElements } from './policemanStateMachine.js';

const $ = (s) => document.querySelector(s);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const STYLE = [
    { selector: 'node', style: { 'label': 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 190, 'font-size': 15, 'font-weight': 700, 'color': css('--text'), 'text-valign': 'center', 'text-halign': 'center', 'shape': 'round-rectangle', 'width': 230, 'height': 64, 'background-color': css('--surface'), 'border-width': 2, 'border-color': css('--border'), 'text-margin-y': -8 } },
    { selector: 'node[sub]', style: { 'label': (n) => n.data('label') + '\n' + n.data('sub') } },
    // WHO decides, always visible: a glyph before the name.
    { selector: 'node[who][sub]', style: { 'label': (n) => (WHO[n.data('who')] ? WHO[n.data('who')].glyph + ' ' : '') + n.data('label') + '\n' + n.data('sub') } },
    { selector: 'node.step', style: { 'shape': 'rectangle', 'width': 270, 'height': 80, 'font-size': 13.5, 'text-max-width': 230 } },
    { selector: 'node.card', style: { 'width': 290, 'height': 66, 'border-style': 'dashed' } },
    // Tab 0: the parts the policeman is made of (thick boxes, inside its own box) and what sits outside it (plain boxes, no glyph).
    { selector: 'node.part', style: { 'shape': 'round-rectangle', 'corner-radius': '10px', 'width': 330, 'height': 96, 'border-width': 3, 'font-size': 15, 'text-max-width': 300 } },
    { selector: 'node.outside', style: { 'shape': 'round-rectangle', 'corner-radius': '10px', 'width': 300, 'height': 90, 'border-style': 'dotted', 'color': css('--muted'), 'text-max-width': 270, 'label': (n) => n.data('label') + '\n' + n.data('sub') } },
    { selector: 'node#today, node#one', style: { 'label': 'data(label)', 'padding': 44, 'border-style': 'dashed', 'border-width': 2, 'font-size': 16 } },
    { selector: 'node#one', style: { 'border-color': css('--green'), 'color': css('--green') } },
    { selector: 'edge.merge', style: { 'text-max-width': 240 } },
    { selector: 'node#policeman', style: { 'label': 'data(label)', 'padding': 50, 'border-style': 'solid', 'border-width': 2, 'border-color': css('--accent'), 'color': css('--accent'), 'font-size': 17 } },
    { selector: 'edge.part', style: { 'text-max-width': 260, 'width': 2.5 } },
    { selector: 'node.tone-ok', style: { 'border-color': css('--green') } },
    { selector: 'node.tone-warn', style: { 'border-color': css('--amber'), 'background-color': 'rgba(210,153,34,.10)' } },
    { selector: 'node.tone-bad', style: { 'border-color': css('--red'), 'background-color': 'rgba(229,72,77,.10)' } },
    { selector: 'node.group', style: { 'shape': 'round-rectangle', 'background-color': css('--bg'), 'background-opacity': 0.55, 'border-color': css('--muted'), 'border-width': 1.5, 'border-style': 'dashed', 'padding': 56, 'text-valign': 'top', 'text-halign': 'center', 'font-size': 16, 'color': css('--muted'), 'text-margin-y': -10, 'text-max-width': 900 } },
    { selector: 'node#pass', style: { 'border-color': css('--accent'), 'color': css('--accent') } },
    { selector: 'node#cards', style: { 'padding': 44 } },
    { selector: 'edge', style: { 'curve-style': 'bezier', 'control-point-step-size': 60, 'target-arrow-shape': 'triangle', 'arrow-scale': 1.4, 'width': 2, 'line-color': css('--muted'), 'target-arrow-color': css('--muted'), 'label': 'data(label)', 'font-size': 13, 'color': css('--text'), 'text-background-color': css('--bg'), 'text-background-opacity': 0.9, 'text-background-padding': 3, 'text-background-shape': 'round-rectangle', 'text-rotation': 'autorotate', 'text-wrap': 'wrap', 'text-max-width': 220, 'loop-direction': '-45deg', 'loop-sweep': '50deg' } },
    { selector: 'edge[curve="arc"]', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': 90, 'control-point-weights': 0.5 } },
    { selector: 'edge.flow', style: { 'line-color': css('--accent'), 'target-arrow-color': css('--accent') } },
    { selector: 'edge.link', style: { 'line-style': 'dashed', 'line-color': css('--accent'), 'target-arrow-color': css('--accent'), 'width': 3 } },
    { selector: 'edge.card', style: { 'line-color': css('--muted') } },
    // Flowchart shapes (SHAPES in the data module): pill · rounded state · parallelogram · rectangle · diamond.
    { selector: 'node.shape-terminal', style: { 'shape': 'round-rectangle', 'corner-radius': '32px', 'width': 240, 'height': 64 } },
    { selector: 'node.shape-state', style: { 'shape': 'round-rectangle', 'corner-radius': '12px' } },
    { selector: 'node.shape-io', style: { 'shape': 'rhomboid', 'width': 320, 'height': 80, 'text-max-width': 220 } },
    { selector: 'node.shape-process', style: { 'shape': 'rectangle', 'width': 280, 'height': 80 } },
    { selector: 'node.shape-decision', style: { 'shape': 'diamond', 'width': 340, 'height': 150, 'text-max-width': 150, 'font-size': 13.5 } },
    { selector: 'node.tone-start', style: { 'background-color': css('--green'), 'border-color': css('--green'), 'color': '#0b1a10' } },
    { selector: 'edge.lit', style: { 'line-color': css('--accent'), 'target-arrow-color': css('--accent'), 'width': 4, 'color': css('--accent'), 'font-weight': 700, 'font-size': 14, 'z-index': 9 } },
    { selector: 'node.lit', style: { 'border-width': 4, 'border-color': css('--accent') } },
    { selector: 'node:selected, edge:selected', style: { 'overlay-opacity': 0 } },

  // WHO decides, on the edges: solid = the harness fires it · dashed = the model decides · dotted = you / the arch.
  { selector: 'edge.who-model', style: { 'line-style': 'dashed', 'line-dash-pattern': [10, 6] } },
  { selector: 'edge.who-mixed', style: { 'line-style': 'dashed', 'line-dash-pattern': [10, 6, 2, 6] } },
  { selector: 'edge.who-human', style: { 'line-style': 'dotted' } },
  // "Colour by who decides" (the toggle): nodes take the who palette instead of the state tones.
  { selector: 'node.by-who.who-code', style: { 'background-color': css('--surface'), 'border-color': css('--muted'), 'border-style': 'solid', 'color': css('--text') } },
  { selector: 'node.by-who.who-model', style: { 'background-color': 'rgba(155, 89, 182, .22)', 'border-color': '#9b59b6', 'border-style': 'dashed', 'color': css('--text') } },
  { selector: 'node.by-who.who-mixed', style: { 'background-color': 'rgba(155, 89, 182, .10)', 'border-color': '#9b59b6', 'border-style': 'double', 'border-width': 4, 'color': css('--text') } },
  { selector: 'node.by-who.who-human', style: { 'background-color': 'rgba(94, 160, 239, .16)', 'border-color': css('--accent'), 'border-style': 'dotted', 'color': css('--text') } },
  // The stand-in for the nested level: a dashed accent box; clicking it opens that level's tab.
  { selector: 'node.shape-ref', style: { 'shape': 'round-rectangle', 'corner-radius': '14px', 'width': 320, 'height': 84, 'border-style': 'dashed', 'border-width': 3, 'border-color': css('--accent'), 'color': css('--accent'), 'background-color': css('--bg'), 'font-size': 16 } },
];

const cys = {};
let current = 'parts';
for (const level of Object.keys(LEVELS)) {
  const cy = window.cytoscape({
    container: $('#cy-' + level),
    elements: levelElements(level),
    layout: { name: 'preset', fit: true, padding: 40 },
    wheelSensitivity: 0.2,
    autounselectify: true,
    style: STYLE,
  });
  cy.on('tap', 'node', (ev) => {
    const n = ev.target;
    if (n.data('kind') === 'ref') { show(n.data('to')); return; }
    const again = n.hasClass('lit');
    cy.elements().removeClass('lit');
    if (again) return; // a second click on the same state clears it
    n.connectedEdges().addClass('lit');
    n.addClass('lit');
  });
  cy.on('tap', (ev) => { if (ev.target === cy) cy.elements().removeClass('lit'); });
  cys[level] = cy;
}
window.cys = cys;
window.cy = cys.parts;

function show(level) {
  current = level;
  document.querySelectorAll('[data-tabs] .tab').forEach((t) => t.classList.toggle('is-on', t.dataset.level === level));
  document.querySelectorAll('[data-cy]').forEach((d) => d.classList.toggle('is-on', d.dataset.cy === level));
  $('#blurb').innerHTML = `<b>${LEVELS[level].title}</b> — ${LEVELS[level].blurb}.`;
  window.cy = cys[level];
  setTimeout(() => { cys[level].resize(); cys[level].fit(undefined, 40); }, 0);
}
document.querySelectorAll('[data-tabs] .tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.level)));
$('#cy-fit').addEventListener('click', () => cys[current].animate({ fit: { eles: cys[current].elements(), padding: 40 }, duration: 350 }));
// Colour by: the state's tone (good / attention / a human is needed) or WHO decides (code / model / mixed / you).
let byWho = false;
function applyColourMode() {
  for (const cy of Object.values(cys)) cy.nodes().toggleClass('by-who', byWho);
  $('#cy-who').classList.toggle('is-on', byWho);
  $('#cy-who').textContent = byWho ? '🎨 colour: who decides' : '🎨 colour: state';
  document.body.classList.toggle('by-who', byWho);
}
$('#cy-who').addEventListener('click', () => { byWho = !byWho; applyColourMode(); });
window.setColourByWho = (v) => { byWho = !!v; applyColourMode(); };
applyColourMode();
window.addEventListener('resize', () => { cys[current].resize(); cys[current].fit(undefined, 40); });
window.showLevel = show;
show('parts');
