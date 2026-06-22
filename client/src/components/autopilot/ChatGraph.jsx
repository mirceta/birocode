import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { GRP_LABEL } from './chatArchitectureData';

// Interactive concept-graph (cytoscape, dark theme), ported from the old vendored
// mapcore.js so the "How chat works" dock tab owns its renderer as real code instead
// of iframing a snapshot. Modelled on the birokrat-architecture viz engine, retuned
// for Claude Web's dark palette.
//
// spec = { nodes:[{id,label,x,y,grp,kind, role?,desc?,src?, box?,p?}], edges:[{s,t,label?,rel?}] }
// Groups (grp): client · backend · store · cli · auto · actor
// Kinds (kind): service(default) · db · proc · slot · actor
// Edge rel:     flow(default) · spawn · stream · read · reject
//
// The detail panel is React state (lifted out of the old innerHTML renderer): hover
// to isolate a node's neighbourhood, click to pin it and read role/desc/src.

const C = {
  ink: '#e6edf3', dim: '#9aa7b4', line: '#2b3340',
  client: '#58a6ff', backend: '#bc8cff', store: '#3fb950',
  cli: '#d29922', auto: '#39c5cf', actor: '#7d8db0', reject: '#f85149',
  warn: '#e3b341', bindEdge: '#ffd166',
};

const STYLE = [
  { selector: 'node', style: {
      label: 'data(label)', color: C.ink, 'font-size': 11, 'font-weight': 600,
      'font-family': 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': 116,
      width: 'label', height: 'label', padding: '11px',
      shape: 'round-rectangle', 'background-color': '#0e141d',
      'border-width': 1.6, 'border-color': C.line,
      'transition-property': 'opacity,border-width', 'transition-duration': '120ms',
  }},
  { selector: 'node[grp="client"]',  style: { 'border-color': C.client,  'background-color': '#0e1726' } },
  { selector: 'node[grp="backend"]', style: { 'border-color': C.backend, 'background-color': '#181426' } },
  { selector: 'node[grp="store"]',   style: { 'border-color': C.store,   'background-color': '#0f1a12' } },
  { selector: 'node[grp="cli"]',     style: { 'border-color': C.cli,     'background-color': '#1d1709' } },
  { selector: 'node[grp="auto"]',    style: { 'border-color': C.auto,    'background-color': '#0a1c1e' } },
  { selector: 'node[grp="actor"]',   style: { 'border-color': C.actor, 'background-color': '#11151f', shape: 'ellipse', color: C.dim } },
  { selector: 'node[kind="db"]',   style: { shape: 'barrel' } },
  { selector: 'node[kind="proc"]', style: { shape: 'round-hexagon' } },
  { selector: 'node[kind="slot"]', style: { shape: 'round-rectangle', 'border-style': 'dashed', 'border-width': 2 } },
  { selector: 'edge', style: {
      width: 1.4, opacity: 0.5, 'curve-style': 'bezier', 'line-color': '#46538c',
      'target-arrow-shape': 'triangle', 'target-arrow-color': '#46538c', 'arrow-scale': 0.95,
      label: 'data(label)', 'font-size': 9.5, color: '#aeb9d6', 'text-opacity': 0.9,
      'font-family': 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'text-background-color': '#0d1117', 'text-background-opacity': 0.82, 'text-background-padding': 3,
      'text-rotation': 'autorotate',
  }},
  { selector: 'edge[rel="spawn"]',  style: { 'line-color': C.cli,   'target-arrow-color': C.cli,   'line-style': 'dashed' } },
  { selector: 'edge[rel="stream"]', style: { 'line-color': C.client, 'target-arrow-color': C.client, 'target-arrow-shape': 'vee', 'line-style': 'dashed' } },
  { selector: 'edge[rel="read"]',   style: { 'line-color': C.auto,  'target-arrow-color': C.auto,  'line-style': 'dotted', 'target-arrow-shape': 'vee' } },
  { selector: 'edge[rel="reject"]', style: { 'line-color': C.reject, 'target-arrow-color': C.reject, 'line-style': 'dashed', width: 1.7 } },
  { selector: ':parent', style: {
      shape: 'round-rectangle', 'background-opacity': 0.05,
      'background-color': C.line, 'border-width': 1.3, 'border-color': C.line, 'border-style': 'solid',
      label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center',
      'font-size': 10.5, 'font-weight': 800, color: C.dim,
      'text-margin-y': 4, padding: '24px', 'corner-radius': '14px',
  }},
  { selector: 'node[box="sub"]', style: {
      'background-opacity': 0.07, 'border-style': 'dashed', padding: '16px',
      'font-size': 9.5, 'font-weight': 700, 'text-margin-y': 3,
  }},
  { selector: ':parent[grp="client"]',  style: { 'border-color': C.client,  'background-color': C.client } },
  { selector: ':parent[grp="backend"]', style: { 'border-color': C.backend, 'background-color': C.backend } },
  { selector: ':parent[grp="store"]',   style: { 'border-color': C.store,   'background-color': C.store } },
  { selector: ':parent[grp="cli"]',     style: { 'border-color': C.cli,     'background-color': C.cli } },
  { selector: ':parent[grp="auto"]',    style: { 'border-color': C.auto,    'background-color': C.auto } },
  { selector: '.faded', style: { opacity: 0.07, 'text-opacity': 0 } },
  { selector: 'node.hl', style: { opacity: 1, 'border-width': 3 } },
  { selector: 'edge.hl', style: { opacity: 1, width: 2.6, 'text-opacity': 1, 'z-index': 9 } },
  { selector: 'node:selected', style: { 'border-width': 3.2, 'border-color': '#ffd166' } },

  // ── overlay layer: the §2 binding path + §3 refresh fate, folded onto the map ──
  { selector: '.ov-dim', style: { opacity: 0.1, 'text-opacity': 0 } },
  // binding: three grains in their tier colours + lit path connectors
  { selector: 'node.ov-bind', style: { opacity: 1, 'border-width': 3, 'text-opacity': 1 } },
  { selector: 'node.ov-bind-convo',   style: { 'border-color': C.client,  'background-color': '#11233f' } },
  { selector: 'node.ov-bind-run',     style: { 'border-color': C.backend, 'background-color': '#221a3a' } },
  { selector: 'node.ov-bind-session', style: { 'border-color': C.store,   'background-color': '#10241a' } },
  { selector: 'edge.ov-edge', style: {
      opacity: 1, width: 2.6, 'line-color': C.bindEdge, 'target-arrow-color': C.bindEdge,
      'text-opacity': 1, 'z-index': 9 } },
  // refresh: wiped (red) vs survives (green), with the twist glowing amber
  { selector: 'node.ov-wiped',    style: { opacity: 1, 'border-width': 3, 'border-color': C.reject, 'background-color': '#2a1113', color: '#ffd7d5', 'text-opacity': 1 } },
  { selector: 'node.ov-survives', style: { opacity: 1, 'border-width': 3, 'border-color': C.store,  'background-color': '#0f2417', color: '#caf7d8', 'text-opacity': 1 } },
  { selector: 'node.ov-twist',    style: { 'border-color': C.warn, 'border-width': 4.5, 'background-color': '#2a2410', color: '#ffe9ad' } },
  { selector: 'edge.ov-wiped', style: {
      opacity: 1, width: 2.4, 'line-color': C.reject, 'target-arrow-color': C.reject,
      'line-style': 'dashed', 'text-opacity': 1, 'z-index': 9 } },
];

const OV_NODE_CLASSES = 'ov-dim ov-bind ov-bind-convo ov-bind-run ov-bind-session ov-wiped ov-survives ov-twist';
const OV_EDGE_CLASSES = 'ov-dim ov-edge ov-wiped';

function toElements(spec) {
  const nodes = (spec.nodes || []).map((n) => {
    const data = { id: n.id, label: n.label, grp: n.grp || 'backend', kind: n.kind || 'service', box: n.box || '', raw: n };
    if (n.p) data.parent = n.p;
    const el = { data };
    if (typeof n.x === 'number') el.position = { x: n.x, y: n.y };
    return el;
  });
  const edges = (spec.edges || []).map((e, i) => ({
    data: { id: 'e' + i, source: e.s, target: e.t, label: e.label || '', rel: e.rel || 'flow', raw: e },
  }));
  return nodes.concat(edges);
}

function DetailPanel({ node, intro }) {
  if (!node) {
    return (
      <div className="cm-detail__empty">
        {intro || 'Hover or click any box to isolate just its connections and read what it is. Drag to rearrange · scroll to zoom · click empty space to reset.'}
      </div>
    );
  }
  return (
    <>
      <div className="cm-detail__grp" data-grp={node.grp}>{GRP_LABEL[node.grp] || node.grp}</div>
      <h4>{node.label}</h4>
      {node.role && <div className="cm-detail__role">{node.role}</div>}
      {node.desc && <div className="cm-detail__desc">{node.desc}</div>}
      {node.src && <div className="cm-detail__src">📄 <code>{node.src}</code></div>}
    </>
  );
}

export default function ChatGraph({ spec, intro, className, overlay = 'none' }) {
  const hostRef = useRef(null);
  const cyRef = useRef(null);
  const overlayRef = useRef(overlay);
  const [picked, setPicked] = useState(null);
  const elements = useMemo(() => toElements(spec), [spec]);

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const cy = cytoscape({
      container: hostRef.current,
      elements,
      style: STYLE,
      layout: { name: 'preset' },
      wheelSensitivity: 0.22,
      boxSelectionEnabled: false,
      minZoom: 0.25,
      maxZoom: 3.5,
    });
    cyRef.current = cy;

    let pinned = null;
    const neighborhood = (node) => {
      if (node.isParent()) {
        const d = node.descendants();
        return d.union(node).union(d.edgesWith(d));
      }
      return node.closedNeighborhood();
    };
    const focusOn = (node) => cy.batch(() => {
      const nhood = neighborhood(node);
      cy.elements().addClass('faded');
      nhood.removeClass('faded');
      nhood.addClass('hl');
      node.ancestors().removeClass('faded');
      node.addClass('hl');
    });
    const clearFocus = () => cy.batch(() => cy.elements().removeClass('faded hl'));

    // While an overlay is active the hover/click focus is suppressed so it can't
    // stomp the overlay colouring — but click-to-read the detail panel still works.
    const ov = () => overlayRef.current !== 'none';
    cy.on('mouseover', 'node', (e) => { if (!pinned && !ov()) focusOn(e.target); });
    cy.on('mouseout', 'node', () => { if (!pinned && !ov()) clearFocus(); });
    cy.on('tap', 'node', (e) => {
      if (!ov()) { pinned = e.target; clearFocus(); focusOn(e.target); }
      setPicked(e.target.data('raw'));
    });
    cy.on('tap', (e) => {
      if (e.target !== cy) return;
      if (!ov()) { pinned = null; clearFocus(); }
      setPicked(null);
    });

    cy.ready(() => cy.fit(undefined, 34));

    // keep the canvas filling its box on container resize (tab show / window resize)
    const ro = new ResizeObserver(() => { cy.resize(); cy.fit(undefined, 34); });
    ro.observe(hostRef.current);

    return () => { ro.disconnect(); cy.destroy(); cyRef.current = null; };
  }, [elements]);

  // Apply the active overlay (binding path / refresh fate) as persistent classes,
  // data-driven from each node's bind/fate/twist and each edge's wipe flag.
  useEffect(() => {
    overlayRef.current = overlay;
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('faded hl');
      cy.nodes().removeClass(OV_NODE_CLASSES);
      cy.edges().removeClass(OV_EDGE_CLASSES);
      if (overlay === 'none') return;
      cy.nodes().forEach((n) => {
        if (n.isParent()) return; // leave the tier/compartment boxes as-is
        const r = n.data('raw') || {};
        if (overlay === 'bind') {
          if (r.bind) n.addClass('ov-bind ov-bind-' + r.bind);
          else if (r.bindPath) n.addClass('ov-bind');
          else n.addClass('ov-dim');
        } else if (overlay === 'refresh') {
          if (r.fate === 'wiped') n.addClass('ov-wiped');
          else if (r.fate === 'survives') n.addClass('ov-survives' + (r.twist ? ' ov-twist' : ''));
          else n.addClass('ov-dim');
        }
      });
      cy.edges().forEach((e) => {
        if (overlay === 'bind') {
          if (e.source().hasClass('ov-bind') && e.target().hasClass('ov-bind')) e.addClass('ov-edge');
          else e.addClass('ov-dim');
        } else if (overlay === 'refresh') {
          if ((e.data('raw') || {}).wipe) e.addClass('ov-wiped');
          else e.addClass('ov-dim');
        }
      });
    });
  }, [overlay, elements]);

  return (
    <div className={`cm-graphrow ${className || ''}`}>
      <div className="cm-cy" ref={hostRef} />
      <div className="cm-detail"><DetailPanel node={picked} intro={intro} /></div>
    </div>
  );
}
