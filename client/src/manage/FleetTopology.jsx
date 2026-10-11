import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { apiGet } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import { buildTopology, topologySignature } from './fleetTopologyModel';
import './fleetTopology.css';

// Fleet topology (openspec fleet-proxy): the fleet's networks as the arch sees them — which
// computer lives on which network, the arch's link to each, and any proxy computer's one-way
// door with the computers that go through it. Drawn from GET /api/arch/fleet/topology (the
// hub's own addresses + every peer's describe), refreshed every 15 s.

const POLL_MS = 15000;

const palette = () => {
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark
    ? { text: '#e8e8e6', muted: '#9aa3b2', node: '#1f232b', border: '#4a505c', net: '#ffffff', netAlpha: 0.035, labelBg: '#14161d' }
    : { text: '#1d1b17', muted: '#6b6760', node: '#ffffff', border: '#b9b2a6', net: '#000000', netAlpha: 0.03, labelBg: '#ffffff' };
};
const C = { ok: '#3fb950', bad: '#e5484d', proxy: '#5ea0ef', via: '#d29922', allowed: '#a371f7', arch: '#5ea0ef' };

export const EDGE_LEGEND = [
  ['fleet', C.ok, 'solid'], ['fleetdown', C.bad, 'dashed'], ['proxy', C.proxy, 'solid'], ['via', C.via, 'solid'], ['allowed', C.allowed, 'dashed'], ['nic', '#7d8590', 'dotted'],
];

function style(p) {
  return [
    { selector: 'node', style: {
      shape: 'round-rectangle', width: 210, height: 62, 'background-color': p.node, 'border-width': 2, 'border-color': p.border,
      label: 'data(label)', color: p.text, 'font-size': 12.5, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': 196,
      'text-valign': 'center', 'text-halign': 'center' } },
    { selector: 'node.network', style: {
      'background-color': p.net, 'background-opacity': p.netAlpha, 'border-style': 'dashed', 'border-width': 1.5, 'border-color': p.border,
      label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -8, color: p.muted, 'font-size': 14, padding: 36 } },
    { selector: 'node.self', style: { 'border-color': C.arch, 'border-width': 3 } },
    { selector: 'node.multi', style: { width: 240, height: 70, 'font-size': 14 } },
    { selector: 'node.iface', style: { width: 180, height: 50, 'font-size': 11.5, 'font-weight': 500, shape: 'round-tag' } },
    { selector: 'node.proxy', style: { 'border-color': C.proxy, 'border-width': 3, 'border-style': 'double' } },
    { selector: 'node.client', style: { 'border-color': C.via, 'border-width': 3 } },
    { selector: 'node.down', style: { 'border-color': C.bad, 'border-style': 'dashed', color: p.muted } },
    { selector: 'node.old', style: { 'background-opacity': 0.6 } },
    { selector: 'node.ghost', style: { 'border-style': 'dotted', color: p.muted, 'background-opacity': 0.4 } },
    { selector: 'node.empty', style: { 'border-width': 0, 'background-opacity': 0, color: p.muted, 'font-weight': 400, 'font-style': 'italic' } },
    { selector: 'edge', style: {
      width: 2.5, 'curve-style': 'bezier', 'line-color': 'data(color)', 'line-style': 'data(line)', 'target-arrow-shape': 'triangle', 'target-arrow-color': 'data(color)',
      label: 'data(label)', 'font-size': 11.5, color: p.text, 'text-background-color': p.labelBg, 'text-background-opacity': 1, 'text-background-padding': 3,
      'text-background-shape': 'roundrectangle' } },
    { selector: 'edge.nic', style: { 'target-arrow-shape': 'none', width: 2 } },
    { selector: 'edge.proxy', style: { width: 5 } },
    { selector: 'edge.via', style: { width: 4 } },
    { selector: ':selected', style: { 'overlay-color': C.arch, 'overlay-opacity': 0.15 } },
  ];
}

export default function FleetTopology() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const box = useRef(null);
  const cyRef = useRef(null);
  const sigRef = useRef('');

  useEffect(() => {
    let alive = true;
    const load = () => apiGet('/arch/fleet/topology').then((d) => { if (alive) { setData(d); setError(''); } }).catch((e) => alive && setError(String(e?.message || e)));
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const model = useMemo(() => (data ? buildTopology(data) : null), [data]);
  const byId = useMemo(() => {
    const m = new Map();
    if (model) { model.nodes.forEach((n) => m.set(n.id, n)); model.edges.forEach((e) => m.set(e.id, e)); }
    return m;
  }, [model]);

  useEffect(() => {
    if (!model || !box.current) return;
    const sig = topologySignature(model);
    const kinds = Object.fromEntries(EDGE_LEGEND.map(([k, color, line]) => [k, { color, line }]));
    const elements = [
      ...model.nodes.map((n) => ({ data: { id: n.id, label: n.label, ...(n.parent ? { parent: n.parent } : {}) }, classes: n.classes, ...(model.positions[n.id] ? { position: model.positions[n.id] } : {}) })),
      ...model.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label || '', color: kinds[e.kind]?.color || '#888', line: kinds[e.kind]?.line || 'solid' }, classes: e.kind })),
    ];
    if (!cyRef.current) {
      cyRef.current = cytoscape({ container: box.current, elements, style: style(palette()), layout: { name: 'preset', padding: 40 }, minZoom: 0.2, maxZoom: 2.5 });
      cyRef.current.on('tap', 'node, edge', (ev) => setSelected(ev.target.id()));
      cyRef.current.on('tap', (ev) => { if (ev.target === cyRef.current) setSelected(null); });
      cyRef.current.fit(undefined, 40);
      sigRef.current = sig;
      return;
    }
    if (sig === sigRef.current) return;
    sigRef.current = sig;
    const cy = cyRef.current;
    cy.batch(() => { cy.elements().remove(); cy.add(elements); });
    cy.layout({ name: 'preset', padding: 40 }).run();
    cy.fit(undefined, 40);
  }, [model]);

  useEffect(() => () => { cyRef.current?.destroy(); cyRef.current = null; }, []);

  const sel = selected ? byId.get(selected) : null;
  const machines = data?.machines || [];
  const roleLabel = (m) => {
    const r = m.proxy?.role || (m.proxy ? 'none' : 'unknown');
    return r === 'proxy' ? t('topology.roleProxy') : r === 'client' ? t('topology.roleClient', { via: m.proxy.via }) : r === 'unknown' ? t('topology.roleUnknown') : t('topology.roleNone');
  };

  return (
    <div className="ftp" data-topology-pane>
      <div className="ftp__head">
        <h3 className="mg__status-h">🕸 {t('topology.title')}</h3>
        <span className="ftp__dim">{t('topology.lead')}</span>
        <button type="button" className="ftp__btn" onClick={() => cyRef.current?.fit(undefined, 40)} data-topology-fit>{t('topology.fit')}</button>
      </div>
      <div className="ftp__legend" data-topology-legend>
        {EDGE_LEGEND.map(([k, color, line]) => (
          <span key={k}><i style={{ borderTopColor: color, borderTopStyle: line }} />{t(`topology.edge.${k}`)}</span>
        ))}
      </div>
      {error && <div className="ftp__err" role="alert">{error}</div>}
      {model?.warnings?.length > 0 && (
        <ul className="ftp__warn" data-topology-warnings>
          {model.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
        </ul>
      )}
      <div className="ftp__main">
        <div className="ftp__graph" ref={box} data-topology-graph />
        <aside className="ftp__side" data-topology-details>
          <h4>{sel ? (sel.label || sel.id).split('\n')[0] : t('topology.clickHint')}</h4>
          {sel?.info ? (
            <table className="ftp__kv"><tbody>{sel.info.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          ) : <p className="ftp__dim">{t('topology.clickLead')}</p>}
        </aside>
      </div>
      <table className="ftp__table" data-topology-table>
        <thead><tr><th>{t('topology.colComputer')}</th><th>{t('topology.colAddress')}</th><th>{t('topology.colAnswers')}</th><th>{t('topology.colRole')}</th></tr></thead>
        <tbody>
          {machines.map((m) => (
            <tr key={m.sourceId || m.machine} className={!m.self && !m.reachable ? 'ftp__row--down' : ''}>
              <td><b>{m.machine}</b>{m.self ? ' · 🏛 arch' : ''}</td>
              <td>{m.self ? (m.proxy?.addresses || []).join(', ') : m.address}</td>
              <td>{m.self || m.reachable ? '✓' : `✗ ${m.status || ''}`}</td>
              <td>{roleLabel(m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
