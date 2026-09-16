// Understanding app — the Kanban policeman, one owner per graph (openspec policeman-observes-agents).
// Build-less, relative URLs only; cytoscape is vendored; the data module is a vendored copy of
// client/src/components/taskgraph/policemanMachines.js (validated by the client tests).
import { MACHINES, ORDER, GROUPS, elements } from './policemanMachines.js';

const $ = (s) => document.querySelector(s);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const STYLE = [
  { selector: 'node', style: { 'label': (n) => n.data('label') + (n.data('sub') ? '\n' + n.data('sub') : '') + (n.data('where') ? '\n↳ ' + n.data('where') : ''), 'text-wrap': 'wrap', 'text-max-width': 230, 'font-size': 13, 'font-weight': 600, 'line-height': 1.25, 'color': css('--text'), 'text-valign': 'center', 'text-halign': 'center', 'shape': 'round-rectangle', 'corner-radius': '12px', 'width': 270, 'height': 96, 'background-color': css('--surface'), 'border-width': 2, 'border-color': css('--border') } },
  { selector: 'node.shape-terminal', style: { 'corner-radius': '48px', 'width': 250 } },
  { selector: 'node.shape-io', style: { 'shape': 'rhomboid', 'width': 330, 'text-max-width': 220 } },
  { selector: 'node.shape-process', style: { 'shape': 'rectangle' } },
  { selector: 'node.shape-decision', style: { 'shape': 'diamond', 'width': 380, 'height': 190, 'text-max-width': 170, 'font-size': 12.5 } },
  { selector: 'node.shape-contract', style: { 'shape': 'round-rectangle', 'corner-radius': '12px', 'width': 300, 'height': 104, 'border-style': 'dashed', 'border-width': 4, 'border-color': '#9b59b6', 'background-color': 'rgba(155, 89, 182, .18)' } },
  { selector: 'node.shape-ref', style: { 'border-style': 'dashed', 'border-width': 3, 'border-color': css('--accent'), 'color': css('--accent'), 'background-color': css('--bg'), 'width': 320 } },
  { selector: 'node.tone-start', style: { 'background-color': css('--green'), 'border-color': css('--green'), 'color': '#0b1a10' } },
  { selector: 'node.tone-ok', style: { 'border-color': css('--green') } },
  { selector: 'node.tone-warn', style: { 'border-color': css('--amber'), 'background-color': 'rgba(210,153,34,.10)' } },
  { selector: 'node.tone-bad', style: { 'border-color': css('--red'), 'background-color': 'rgba(229,72,77,.10)' } },
  // A prompt machine is all the model's: purple-tinted boxes, dashed arrows.
  { selector: 'node.group-prompt', style: { 'background-color': 'rgba(155, 89, 182, .12)', 'border-color': '#9b59b6' } },
  { selector: 'node.group-prompt.tone-ok', style: { 'border-color': css('--green') } },
  { selector: 'node.group-prompt.tone-bad', style: { 'border-color': css('--red') } },
  { selector: 'node.group-prompt.tone-warn', style: { 'border-color': css('--amber') } },
  { selector: 'edge', style: { 'curve-style': 'bezier', 'control-point-step-size': 70, 'target-arrow-shape': 'triangle', 'arrow-scale': 1.4, 'width': 2, 'line-color': css('--muted'), 'target-arrow-color': css('--muted'), 'label': 'data(label)', 'font-size': 12.5, 'color': css('--text'), 'text-background-color': css('--bg'), 'text-background-opacity': 0.92, 'text-background-padding': 3, 'text-background-shape': 'round-rectangle', 'text-rotation': 'autorotate', 'text-wrap': 'wrap', 'text-max-width': 240, 'loop-direction': '-45deg', 'loop-sweep': '50deg' } },
  { selector: 'edge[curve="arc"]', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': 100, 'control-point-weights': 0.5 } },
  { selector: 'edge.kind-link', style: { 'line-style': 'dashed', 'line-color': css('--accent'), 'target-arrow-color': css('--accent'), 'width': 3 } },
  { selector: 'edge.who-model', style: { 'line-style': 'dashed', 'line-dash-pattern': [10, 6], 'line-color': '#9b59b6', 'target-arrow-color': '#9b59b6' } },
  { selector: 'edge.who-human', style: { 'line-style': 'dotted', 'line-color': css('--accent'), 'target-arrow-color': css('--accent') } },
  { selector: 'edge.lit', style: { 'width': 4.5, 'line-color': css('--accent'), 'target-arrow-color': css('--accent'), 'color': css('--accent'), 'font-weight': 700, 'font-size': 13.5, 'z-index': 9 } },
  { selector: 'node.lit', style: { 'border-width': 5, 'border-color': css('--accent') } },
  { selector: 'node:selected, edge:selected', style: { 'overlay-opacity': 0 } },
];

const cys = {};
let current = ORDER[0];
for (const key of ORDER) {
  const cy = window.cytoscape({
    container: $('#cy-' + key),
    elements: elements(key),
    layout: { name: 'preset', fit: true, padding: 40 },
    wheelSensitivity: 0.2,
    autounselectify: true,
    style: STYLE,
  });
  cy.on('tap', 'node', (ev) => {
    const n = ev.target;
    if (n.data('to')) { show(n.data('to')); return; }
    const again = n.hasClass('lit');
    cy.elements().removeClass('lit');
    if (again) return; // a second click on the same box clears it
    n.connectedEdges().addClass('lit');
    n.addClass('lit');
  });
  cy.on('tap', (ev) => { if (ev.target === cy) cy.elements().removeClass('lit'); });
  // Hover: the full "where" of a box or an arrow, as the browser's native tooltip on the canvas.
  cy.on('mouseover', 'node, edge', (ev) => { const d = ev.target.data(); cy.container().title = (d.label ? d.label + ' — ' : '') + (d.where || ''); });
  cy.on('mouseout', 'node, edge', () => { cy.container().title = ''; });
  cys[key] = cy;
}
window.cys = cys;

function show(key) {
  current = key;
  const m = MACHINES[key];
  document.querySelectorAll('[data-tabs] .tab').forEach((t) => t.classList.toggle('is-on', t.dataset.machine === key));
  document.querySelectorAll('[data-cy]').forEach((d) => d.classList.toggle('is-on', d.dataset.cy === key));
  $('#m-title').textContent = `${GROUPS[m.group].title} · ${m.title}`;
  $('#m-blurb').textContent = `— ${m.blurb}`;
  $('#m-lives').innerHTML = m.lives.map((l) => `<code>${esc(l)}</code>`).join(' · ');
  document.body.dataset.group = m.group;
  window.cy = cys[key];
  setTimeout(() => { cys[key].resize(); cys[key].fit(undefined, 40); }, 0);
}
document.querySelectorAll('[data-tabs] .tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.machine)));
$('#cy-fit').addEventListener('click', () => cys[current].animate({ fit: { eles: cys[current].elements(), padding: 40 }, duration: 350 }));
window.addEventListener('resize', () => { cys[current].resize(); cys[current].fit(undefined, 40); });
window.showMachine = show;
show(ORDER[0]);
