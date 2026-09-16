// Understanding app — the Kanban policeman as ONE state diagram (openspec policeman-observes-agents).
// Build-less, relative URLs only; cytoscape is vendored; the data module is a vendored copy of
// client/src/components/taskgraph/policemanStateMachine.js (validated by the client tests).
import { toElements } from './policemanStateMachine.js';

const $ = (s) => document.querySelector(s);

// The full state diagram (cytoscape, vendored): three nested compounds, preset positions.
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const cy = window.cytoscape({
  container: $('#cy'),
  elements: toElements(),
  layout: { name: 'preset', fit: true, padding: 30 },
  wheelSensitivity: 0.2,
  autounselectify: true,
  style: [
    { selector: 'node', style: { 'label': 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 190, 'font-size': 15, 'font-weight': 700, 'color': css('--text'), 'text-valign': 'center', 'text-halign': 'center', 'shape': 'round-rectangle', 'width': 230, 'height': 64, 'background-color': css('--surface'), 'border-width': 2, 'border-color': css('--border'), 'text-margin-y': -8 } },
    { selector: 'node[sub]', style: { 'label': (n) => n.data('label') + '\n' + n.data('sub') } },
    { selector: 'node.step', style: { 'shape': 'rectangle', 'width': 250, 'height': 66, 'font-size': 13.5 } },
    { selector: 'node.card', style: { 'width': 290, 'height': 66, 'border-style': 'dashed' } },
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
    { selector: 'node.shape-io', style: { 'shape': 'rhomboid', 'width': 300, 'height': 66, 'text-max-width': 200 } },
    { selector: 'node.shape-process', style: { 'shape': 'rectangle', 'width': 260, 'height': 66 } },
    { selector: 'node.shape-decision', style: { 'shape': 'diamond', 'width': 340, 'height': 150, 'text-max-width': 150, 'font-size': 13.5 } },
    { selector: 'node.tone-start', style: { 'background-color': css('--green'), 'border-color': css('--green'), 'color': '#0b1a10' } },
    { selector: 'edge.lit', style: { 'line-color': css('--accent'), 'target-arrow-color': css('--accent'), 'width': 4, 'color': css('--accent'), 'font-weight': 700, 'font-size': 14, 'z-index': 9 } },
    { selector: 'node.lit', style: { 'border-width': 4, 'border-color': css('--accent') } },
    { selector: 'node:selected, edge:selected', style: { 'overlay-opacity': 0 } },
  ],
});
window.cy = cy;
cy.on('tap', 'node', (ev) => {
  const n = ev.target;
  if (n.hasClass('group')) return;
  const again = n.hasClass('lit');
  cy.elements().removeClass('lit');
  if (again) return; // a second click on the same state clears it
  n.connectedEdges().addClass('lit');
  n.addClass('lit');
});
cy.on('tap', (ev) => { if (ev.target === cy) cy.elements().removeClass('lit'); });
const focus = (sel) => cy.animate({ fit: { eles: cy.$(sel), padding: 40 }, duration: 350 });
$('#cy-fit').addEventListener('click', () => cy.animate({ fit: { eles: cy.elements(), padding: 30 }, duration: 350 }));
$('#cy-agent').addEventListener('click', () => focus('node[kind="state"], node#pass'));
$('#cy-pass').addEventListener('click', () => focus('node#pass'));
$('#cy-cards').addEventListener('click', () => focus('node#cards'));
window.addEventListener('resize', () => { cy.resize(); cy.fit(undefined, 30); });
