// Interactive-graph renderer for the Understanding app (Cytoscape, dark theme).
// Modelled on the birokrat-architecture viz engine, retuned for Claude Web's
// dark palette and this repo's chat/autopilot domain.
//
// Depends on the vendored global `cytoscape` (lib/cytoscape.min.js).
// Data shape (see data.js):
//   spec = { nodes:[{id,label,x,y,grp,kind, role?,desc?,src?}], edges:[{s,t,label?,rel?,conf?}] }
// Groups (grp)  : client · backend · store · cli · auto · actor
// Kinds  (kind) : service(default) · db · proc · slot · actor
// Edge rel      : flow(default) · spawn · stream · read · reject
//
// Exposes: window.renderGraph(containerId, spec, opts) · window.fitGraph(id)
//          window.resizeGraphs()
(function () {
  'use strict';

  // --- palette (kept in sync with index.html :root) ---
  var C = {
    ink: '#e6edf3', dim: '#9aa7b4', line: '#2b3340', panel: '#161b22',
    client: '#58a6ff', backend: '#bc8cff', store: '#3fb950',
    cli: '#d29922', auto: '#39c5cf', actor: '#7d8db0',
    reject: '#f85149',
  };

  var STYLE = [
    { selector: 'node', style: {
        'label': 'data(label)', 'color': C.ink, 'font-size': 11, 'font-weight': 600,
        'font-family': 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': 116,
        'width': 'label', 'height': 'label', 'padding': '11px',
        'shape': 'round-rectangle', 'background-color': '#0e141d',
        'border-width': 1.6, 'border-color': C.line, 'transition-property': 'opacity,border-width', 'transition-duration': '120ms',
    }},
    { selector: 'node[grp="client"]',  style: { 'border-color': C.client,  'background-color': '#0e1726' } },
    { selector: 'node[grp="backend"]', style: { 'border-color': C.backend, 'background-color': '#181426' } },
    { selector: 'node[grp="store"]',   style: { 'border-color': C.store,   'background-color': '#0f1a12' } },
    { selector: 'node[grp="cli"]',     style: { 'border-color': C.cli,     'background-color': '#1d1709' } },
    { selector: 'node[grp="auto"]',    style: { 'border-color': C.auto,    'background-color': '#0a1c1e' } },
    { selector: 'node[grp="actor"]',   style: { 'border-color': C.actor, 'background-color': '#11151f', 'shape': 'ellipse', 'color': C.dim } },
    // kinds
    { selector: 'node[kind="db"]',   style: { 'shape': 'barrel' } },
    { selector: 'node[kind="proc"]', style: { 'shape': 'round-hexagon' } },
    { selector: 'node[kind="slot"]', style: { 'shape': 'round-rectangle', 'border-style': 'dashed', 'border-width': 2 } },
    // edges
    { selector: 'edge', style: {
        'width': 1.4, 'opacity': 0.5, 'curve-style': 'bezier', 'line-color': '#46538c',
        'target-arrow-shape': 'triangle', 'target-arrow-color': '#46538c', 'arrow-scale': 0.95,
        'label': 'data(label)', 'font-size': 9.5, 'color': '#aeb9d6', 'text-opacity': 0.9,
        'font-family': 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'text-background-color': '#0d1117', 'text-background-opacity': 0.82, 'text-background-padding': 3,
        'text-rotation': 'autorotate',
    }},
    { selector: 'edge[rel="spawn"]',  style: { 'line-color': C.cli,   'target-arrow-color': C.cli,   'line-style': 'dashed' } },
    { selector: 'edge[rel="stream"]', style: { 'line-color': C.client, 'target-arrow-color': C.client, 'target-arrow-shape': 'vee', 'line-style': 'dashed' } },
    { selector: 'edge[rel="read"]',   style: { 'line-color': C.auto,  'target-arrow-color': C.auto,  'line-style': 'dotted', 'target-arrow-shape': 'vee' } },
    { selector: 'edge[rel="reject"]', style: { 'line-color': C.reject, 'target-arrow-color': C.reject, 'line-style': 'dashed', 'width': 1.7 } },
    { selector: 'edge[conf="inferred"]', style: { 'line-style': 'dashed', 'opacity': 0.4 } },
    // compound containers ("where it runs"): translucent tinted boxes with a top label.
    // Declared after the grp rules so they override the dark child fill for parents.
    { selector: ':parent', style: {
        'shape': 'round-rectangle', 'background-opacity': 0.05,
        'background-color': C.line, 'border-width': 1.3, 'border-color': C.line, 'border-style': 'solid',
        'label': 'data(label)', 'text-valign': 'top', 'text-halign': 'center',
        'font-size': 10.5, 'font-weight': 800, 'color': C.dim,
        'text-margin-y': 4, 'padding': '24px', 'corner-radius': '14px',
    }},
    { selector: 'node[box="sub"]', style: {
        'background-opacity': 0.07, 'border-style': 'dashed', 'padding': '16px',
        'font-size': 9.5, 'font-weight': 700, 'text-margin-y': 3,
    }},
    // tint each container by its tier/component color
    { selector: ':parent[grp="client"]',  style: { 'border-color': C.client,  'background-color': C.client } },
    { selector: ':parent[grp="backend"]', style: { 'border-color': C.backend, 'background-color': C.backend } },
    { selector: ':parent[grp="store"]',   style: { 'border-color': C.store,   'background-color': C.store } },
    { selector: ':parent[grp="cli"]',     style: { 'border-color': C.cli,     'background-color': C.cli } },
    { selector: ':parent[grp="auto"]',    style: { 'border-color': C.auto,    'background-color': C.auto } },
    // focus interaction
    { selector: '.faded', style: { 'opacity': 0.07, 'text-opacity': 0 } },
    { selector: 'node.hl', style: { 'opacity': 1, 'border-width': 3 } },
    { selector: 'edge.hl', style: { 'opacity': 1, 'width': 2.6, 'text-opacity': 1, 'z-index': 9 } },
    { selector: 'node:selected', style: { 'border-width': 3.2, 'border-color': '#ffd166' } },
  ];

  var GRP_LABEL = {
    client: 'client · your device', backend: 'backend · :5099', store: 'persistent (disk)',
    cli: 'CLI process', auto: 'autopilot', actor: 'actor',
  };

  function renderDetail(box, n, intro) {
    if (!box) return;
    if (!n) { box.innerHTML = '<div class="md-empty">' + (intro || 'Hover or click any box to isolate just its connections and read what it is. Drag to rearrange · scroll to zoom · click empty space to reset.') + '</div>'; return; }
    var bits = '';
    bits += '<div class="md-grp" data-grp="' + n.grp + '">' + (GRP_LABEL[n.grp] || n.grp) + '</div>';
    bits += '<h4>' + n.label + '</h4>';
    if (n.role) bits += '<div class="md-role">' + n.role + '</div>';
    if (n.desc) bits += '<div class="md-desc">' + n.desc + '</div>';
    if (n.src)  bits += '<div class="md-src">📄 <code>' + n.src + '</code></div>';
    box.innerHTML = bits;
  }

  function attachFocus(cy, box, intro) {
    var pinned = null;
    // For a container box, "neighborhood" means everything inside it (and the edges
    // wholly within it); for a normal node it is the usual closed neighborhood.
    function neighborhood(node) {
      if (node.isParent()) {
        var d = node.descendants();
        return d.union(node).union(d.edgesWith(d));
      }
      return node.closedNeighborhood();
    }
    function focusOn(node) {
      cy.batch(function () {
        var nhood = neighborhood(node);
        cy.elements().addClass('faded');
        nhood.removeClass('faded');
        nhood.addClass('hl');
        node.ancestors().removeClass('faded');  // keep the box a node sits in visible
        node.addClass('hl');
      });
    }
    function clearFocus() { cy.batch(function () { cy.elements().removeClass('faded hl'); }); }
    cy.on('mouseover', 'node', function (e) { if (!pinned) focusOn(e.target); });
    cy.on('mouseout', 'node', function () { if (!pinned) clearFocus(); });
    cy.on('tap', 'node', function (e) {
      pinned = e.target; clearFocus(); focusOn(e.target);
      if (box) renderDetail(box, e.target.data('raw'), intro);
    });
    cy.on('tap', function (e) { if (e.target === cy) { pinned = null; clearFocus(); if (box) renderDetail(box, null, intro); } });
  }

  var instances = {};   // containerId -> cy

  function renderGraph(containerId, spec, opts) {
    opts = opts || {};
    var el = document.getElementById(containerId);
    if (!el || typeof cytoscape === 'undefined' || !spec) return null;
    var box = opts.detailId ? document.getElementById(opts.detailId) : null;
    if (instances[containerId]) { try { instances[containerId].destroy(); } catch (e) {} instances[containerId] = null; }

    var nodes = (spec.nodes || []).map(function (n) {
      var data = { id: n.id, label: n.label, grp: n.grp || 'backend', kind: n.kind || 'service', box: n.box || '', raw: n };
      if (n.p) data.parent = n.p;                 // place this node inside a container box
      var el = { data: data };
      if (typeof n.x === 'number') el.position = { x: n.x, y: n.y };  // containers auto-size
      return el;
    });
    var edges = (spec.edges || []).map(function (e, i) {
      return { data: { id: containerId + '_e' + i, source: e.s, target: e.t, label: e.label || '', rel: e.rel || 'flow', conf: e.conf || 'confirmed' } };
    });

    var cy = cytoscape({
      container: el, elements: nodes.concat(edges), style: STYLE,
      layout: { name: 'preset' }, wheelSensitivity: 0.22, boxSelectionEnabled: false,
      minZoom: 0.25, maxZoom: 3.5,
    });
    attachFocus(cy, box, opts.intro);
    cy.ready(function () { cy.fit(undefined, opts.pad == null ? 34 : opts.pad); });
    renderDetail(box, null, opts.intro);
    instances[containerId] = cy;
    el._cy = cy;
    return cy;
  }

  function fitGraph(containerId) { var cy = instances[containerId]; if (cy) { cy.resize(); cy.fit(undefined, 46); } }
  function resizeGraphs() { Object.keys(instances).forEach(function (k) { var cy = instances[k]; if (cy) { cy.resize(); cy.fit(undefined, 46); } }); }

  window.renderGraph = renderGraph;
  window.fitGraph = fitGraph;
  window.resizeGraphs = resizeGraphs;
})();
