import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import { useDock } from '../../context/DockContext';
import GraphLegend from './GraphLegend';
import { assignSlots, machineKey, repoKey, nodeStyle, readSlots, writeSlots } from './graphColors';
import './taskgraph.css';

// Task dependency graph (plans/task-dependency-graph.md): a single global board of
// step nodes + "depends-on" edges, rendered with React Flow. An edge Source→Target
// means "Source waits on Target" (Target is the prerequisite). The board derives:
//   • ACTIONABLE NOW — a step that isn't done and whose every prerequisite IS done
//     (or has none): the things you can actually do next.
//   • WHY (the trace) — selecting a step highlights the chain of steps that depend
//     on it, up to the primary task it serves.
//
// COLOUR CODING (openspec taskgraph-colours): tasks lie freely on the canvas — the
// old machine boxes are gone. A task's BORDER colour is the machine its assigned
// agent runs on (the assignment's harness: this box or a fleet peer), its
// BACKGROUND colour the repository (by remote URL, so one repo on two machines
// shares a colour). Two legends pinned above the canvas name the colours and can
// focus one machine or repo. Colours are assigned first-seen from a fixed palette
// and persisted per device. A dependency between tasks on different machines is
// drawn dashed in orange (a cross-machine hand-off).
//
// Legacy boxes: a task that still sits in a box from the old layout has box-relative
// coordinates; it is shown at its absolute place and, once, re-saved as absolute
// with the box link cleared, so nothing moves when the boxes are finally deleted.
// Backend-synced via /api/taskgraph; positions persist on drag-stop.

// The delivery lifecycle (openspec kanban-lifecycle-columns); a click on the
// status chip cycles through it. From committed up the harness also advances
// nodes itself from observed git/PR state.
const STATUSES = ['todo', 'doing', 'committed', 'pr-opened', 'pr-merged', 'done'];
const NEXT_STATUS = { todo: 'doing', doing: 'committed', committed: 'pr-opened', 'pr-opened': 'pr-merged', 'pr-merged': 'done', done: 'todo' };
const DELIVERED = (s) => s === 'pr-merged' || s === 'done';

const CROSS_COLOR = '#e8590c'; // cross-machine edge accent (also in taskgraph.css)
const FLEET_POLL_MS = 30_000;

// Per-device saved size of the dock (mirrors the Autopilot dock): drag the
// bottom-right grip to resize, double-click it to clear back to the default.
const SIZE_KEY = 'claudeweb_dash_taskgraph_size';
const MIN_W = 360;
const MIN_H = 260;

function readSize() {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && (v.w || v.h)) return v;
  } catch {
    /* private mode / malformed */
  }
  return null;
}

// A step node. Manages its own inline-rename state; status/rename/delete flow back
// through callbacks passed in `data`. Its colours arrive as CSS custom properties
// (--tg-machine-h for the border hue, --tg-repo-h for the background hue); absent =
// neutral.
function StepNode({ id, data }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.title);
  const [picking, setPicking] = useState(false); // inline agent (repo) picker open

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== data.title) data.onRename(id, t);
    else setDraft(data.title);
  }

  const cls = [
    'tg-node',
    `st-${data.status}`,
    data.actionable ? 'is-actionable' : '',
    data.dim ? 'is-dim' : '',
    data.machineSlot != null ? 'has-machine' : '',
    data.repoSlot != null ? 'has-repo' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      style={nodeStyle(data.machineSlot, data.repoSlot)}
      title={[data.machineLabel ? `machine: ${data.machineLabel}` : 'no agent assigned', data.repoLabel ? `repo: ${data.repoLabel}` : null].filter(Boolean).join(' · ')}
      data-machine={data.machineKey || ''}
      data-repo={data.repoKey || ''}
    >
      <Handle type="target" position={Position.Top} />
      <div className="tg-node__row">
        {editing ? (
          <input
            className="tg-node__edit nodrag"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(data.title); setEditing(false); }
            }}
          />
        ) : (
          <span className="tg-node__title" onDoubleClick={() => { setDraft(data.title); setEditing(true); }}>
            {data.title}
          </span>
        )}
        <button className="tg-node__x nodrag" title="Delete step" onClick={() => data.onDelete(id)}>×</button>
      </div>
      <div className="tg-node__meta">
        <button
          className={`tg-chip tg-chip--status st-${data.status} nodrag`}
          title="Click to change status"
          onClick={() => data.onCycle(id, NEXT_STATUS[data.status])}
        >
          {data.status}
        </button>
        {picking ? (
          // Inline agent (repo) picker — the only way to (re)assign a step's agent
          // now that the detail view is gone. Empty value clears it to "no agent".
          <select
            className="tg-chip tg-chip--repo-edit nodrag"
            value={data.repoId || ''}
            autoFocus
            onChange={(e) => { data.onSetRepo(id, e.target.value); setPicking(false); }}
            onBlur={() => setPicking(false)}
          >
            <option value="">(no agent)</option>
            {(data.repos || []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        ) : data.repoId ? (
          <button
            className="tg-chip tg-chip--repo nodrag"
            title={`${data.repoLabel || data.repoId}${data.machineLabel ? ` on ${data.machineLabel}` : ''} — click to change agent`}
            onClick={() => setPicking(true)}
          >
            {data.repoName || data.repoLabel || data.repoId.slice(0, 6)}
            {data.machineLabel && data.machineKey !== 'self' ? <span className="tg-chip__machine"> @ {data.machineLabel}</span> : null}
          </button>
        ) : (
          <button
            className="tg-chip tg-chip--repo-empty nodrag"
            title="Assign an agent"
            onClick={() => setPicking(true)}
          >
            + agent
          </button>
        )}
        {data.actionable && <span className="tg-chip tg-chip--go">do next</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { step: StepNode };

function TaskGraphBoard({ refreshKey = 0, pollMs = 0 }) {
  const { repos } = useDock();
  const repoName = useCallback((id) => repos.find((r) => r.id === id)?.name || '', [repos]);

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null); // step id whose "why" chain is lit
  const [focus, setFocus] = useState(null); // legend focus: { kind: 'machine'|'repo', key }
  const [draftTitle, setDraftTitle] = useState('');
  const [draftRepo, setDraftRepo] = useState('');
  const [error, setError] = useState('');
  const [fleet, setFleet] = useState(null); // /api/arch/fleet/status: machine labels + repo remotes
  const wrapRef = useRef(null);
  const migratedRef = useRef(new Set()); // legacy boxed tasks already re-saved as absolute

  // Drag-to-resize the dock from its bottom-right grip (same UX as the Autopilot
  // dock). Size is remembered per device; double-clicking the grip resets it.
  const [size, setSize] = useState(readSize);
  const resizeRef = useRef(null);

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = wrapRef.current?.getBoundingClientRect();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseW: rect?.width ?? MIN_W,
      baseH: rect?.height ?? MIN_H,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function moveResize(e) {
    const r = resizeRef.current;
    if (!r) return;
    const maxW = Math.round(window.innerWidth * 0.95);
    const maxH = Math.round(window.innerHeight * 0.9);
    const w = Math.max(MIN_W, Math.min(maxW, Math.round(r.baseW + (e.clientX - r.startX))));
    const h = Math.max(MIN_H, Math.min(maxH, Math.round(r.baseH + (e.clientY - r.startY))));
    setSize({ w, h });
  }
  function endResize() {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    setSize((s) => {
      if (s) {
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify(s));
        } catch {
          /* private mode — in-memory only */
        }
      }
      return s;
    });
  }
  function resetSize() {
    setSize(null);
    try {
      localStorage.removeItem(SIZE_KEY);
    } catch {
      /* private mode */
    }
  }

  // --- load ---
  const load = useCallback(async () => {
    try {
      const board = await apiGet('/taskgraph');
      const boxes = new Map((board.machines || []).map((m) => [m.id, m]));
      const stepNodes = (board.nodes || []).map((n) => toRfNode(n, boxes));
      setNodes(stepNodes);
      setEdges((board.edges || []).map(toRfEdge));
      // One-time migration of tasks that still sit in a legacy box: re-save their
      // absolute place and clear the box link (best effort, once per task).
      for (const n of board.nodes || []) {
        if (!n.machineId || migratedRef.current.has(n.id)) continue;
        const box = boxes.get(n.machineId);
        if (!box) continue;
        migratedRef.current.add(n.id);
        apiPatch(`/taskgraph/nodes/${n.id}`, { machineId: '', x: (n.x ?? 0) + (box.x ?? 0), y: (n.y ?? 0) + (box.y ?? 0) }).catch(() => {});
      }
    } catch {
      setError('Could not load the task graph.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshKey) load(); }, [refreshKey, load]);
  // Standalone board (openspec management-split-tabs): re-read on an interval so
  // tasks created in another pane or by an agent appear without a reload.
  useEffect(() => {
    if (!pollMs) return undefined;
    const t = setInterval(() => { if (!document.hidden) load(); }, pollMs);
    return () => clearInterval(t);
  }, [pollMs, load]);

  // The fleet: machine labels and each repo's remote URL (for the colour keys).
  // Best effort — without it, machines fall back to "this machine"/source id and
  // repos to their id, still coloured consistently.
  useEffect(() => {
    let alive = true;
    const pull = () => apiGet('/arch/fleet/status').then((f) => { if (alive) setFleet(f); }).catch(() => {});
    pull();
    const t = setInterval(() => { if (!document.hidden) pull(); }, FLEET_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // sourceId|repoId → { remoteUrl, name, machine } from the fleet status.
  const fleetIndex = useMemo(() => {
    const byKey = new Map();
    const machines = new Map();
    for (const m of fleet?.machines || []) {
      const key = m.self ? 'self' : m.sourceId;
      machines.set(key, m.machine);
      for (const a of m.agents || []) byKey.set(`${key}|${a.repoId}`, { remoteUrl: a.remoteUrl || null, name: a.name, machine: m.machine });
    }
    return { byKey, machines };
  }, [fleet]);
  const remoteUrlOf = useCallback((n) => fleetIndex.byKey.get(`${n.sourceId || 'self'}|${n.repoId}`)?.remoteUrl || null, [fleetIndex]);
  const machineLabelOf = useCallback((key) => (key === 'self' ? fleetIndex.machines.get('self') || 'this machine' : fleetIndex.machines.get(key) || key), [fleetIndex]);

  // --- derived: actionable set + the selected node's dependent chain (the "why") ---
  const actionable = useMemo(() => actionableIds(nodes, edges), [nodes, edges]);
  const lit = useMemo(() => (selected ? whyChain(selected, edges) : null), [selected, edges]);

  // Colour slots: first-seen order over the tasks on the board, persisted per device
  // so a machine or repo keeps its colour across reloads.
  const [slots, setSlots] = useState(() => readSlots(typeof localStorage === 'undefined' ? null : localStorage));
  const keyed = useMemo(() => nodes.map((n) => ({
    id: n.id,
    machineKey: machineKey(n.data),
    repoKey: repoKey(n.data, remoteUrlOf),
  })), [nodes, remoteUrlOf]);
  useEffect(() => {
    const machines = assignSlots(keyed.map((k) => k.machineKey).filter(Boolean), slots.machines);
    const reposSlots = assignSlots(keyed.map((k) => k.repoKey).filter(Boolean), slots.repos);
    const changed = JSON.stringify(machines) !== JSON.stringify(slots.machines) || JSON.stringify(reposSlots) !== JSON.stringify(slots.repos);
    if (changed) {
      const next = { machines, repos: reposSlots };
      setSlots(next);
      writeSlots(typeof localStorage === 'undefined' ? null : localStorage, next);
    }
  }, [keyed, slots]);

  // Legend entries: every machine / repo present on the board, with counts.
  const legend = useMemo(() => {
    const m = new Map();
    const r = new Map();
    for (const k of keyed) {
      const node = nodes.find((n) => n.id === k.id);
      if (k.machineKey) {
        const e = m.get(k.machineKey) || { key: k.machineKey, label: machineLabelOf(k.machineKey), slot: slots.machines[k.machineKey], count: 0 };
        e.count += 1; m.set(k.machineKey, e);
      }
      if (k.repoKey) {
        const info = node ? fleetIndex.byKey.get(`${node.data.sourceId || 'self'}|${node.data.repoId}`) : null;
        const label = info?.name || (node ? repoName(node.data.repoId) : '') || k.repoKey.replace(/^id:/, '').slice(0, 8);
        const e = r.get(k.repoKey) || { key: k.repoKey, label, title: k.repoKey.startsWith('id:') ? label : k.repoKey, slot: slots.repos[k.repoKey], count: 0 };
        e.count += 1; r.set(k.repoKey, e);
      }
    }
    const bySlot = (a, b) => (a.slot ?? 0) - (b.slot ?? 0);
    return { machines: [...m.values()].sort(bySlot), repos: [...r.values()].sort(bySlot) };
  }, [keyed, nodes, slots, machineLabelOf, fleetIndex, repoName]);

  // step id -> machine key, for cross-machine edge detection.
  const nodeMachine = useMemo(() => new Map(keyed.map((k) => [k.id, k.machineKey])), [keyed]);

  // Re-decorate RF nodes/edges with derived state for rendering.
  const viewNodes = useMemo(
    () => nodes.map((n) => {
      const k = keyed.find((x) => x.id === n.id) || {};
      const info = fleetIndex.byKey.get(`${n.data.sourceId || 'self'}|${n.data.repoId}`);
      const focused = !focus ? true
        : focus.kind === 'machine' ? (focus.key === '' ? !k.machineKey : k.machineKey === focus.key)
          : (focus.key === '' ? !k.repoKey : k.repoKey === focus.key);
      return {
        ...n,
        data: {
          ...n.data,
          repoName: repoName(n.data.repoId) || info?.name || '',
          repos,
          machineKey: k.machineKey,
          machineLabel: k.machineKey ? machineLabelOf(k.machineKey) : null,
          machineSlot: k.machineKey ? slots.machines[k.machineKey] : null,
          repoKey: k.repoKey,
          repoLabel: info?.name || repoName(n.data.repoId) || null,
          repoSlot: k.repoKey ? slots.repos[k.repoKey] : null,
          actionable: actionable.has(n.id),
          dim: (lit ? !lit.nodes.has(n.id) : false) || !focused,
          onCycle: cycleStatus,
          onRename: renameNode,
          onSetRepo: setRepo,
          onDelete: deleteNode,
        },
      };
    }),
    [nodes, keyed, fleetIndex, focus, actionable, lit, repoName, repos, slots, machineLabelOf],
  );
  const viewEdges = useMemo(
    () => edges.map((e) => {
      const a = nodeMachine.get(e.source);
      const b = nodeMachine.get(e.target);
      const cross = Boolean(a && b && a !== b); // both assigned, different machines
      const dim = lit ? !lit.edges.has(e.id) : false;
      return {
        ...e,
        animated: lit ? lit.edges.has(e.id) : false,
        className: [cross ? 'tg-edge--cross' : '', dim ? 'tg-edge--dim' : ''].filter(Boolean).join(' '),
        style: cross ? { stroke: CROSS_COLOR, strokeWidth: 2, strokeDasharray: '6 4' } : undefined,
        // ArrowClosedSymbol fills/strokes with `color`, defaulting to 'none' when
        // color is undefined — and createMarkerIds spreads our marker object AFTER
        // its `color || defaultColor` fallback, so an explicit `color: undefined`
        // own-key clobbers the fallback back to undefined → an INVISIBLE arrowhead.
        // So OMIT color entirely on same-machine edges to let RF's defaultColor
        // render the head; cross-machine edges pass their explicit CROSS_COLOR.
        markerEnd: cross
          ? { type: MarkerType.ArrowClosed, color: CROSS_COLOR, width: 38, height: 38 }
          : { type: MarkerType.ArrowClosed, width: 38, height: 38 },
      };
    }),
    [edges, lit, nodeMachine],
  );

  // --- mutations ---
  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onConnect = useCallback(async (conn) => {
    setError('');
    try {
      const edge = await apiPost('/taskgraph/edges', { source: conn.source, target: conn.target });
      setEdges((eds) => [...eds, toRfEdge(edge)]);
    } catch (e) {
      setError(e?.message || 'Could not add that dependency.');
    }
  }, []);

  // Drag-stop persists the task's absolute position (there are no boxes to re-parent into).
  const onNodeDragStop = useCallback((_e, node) => {
    apiPatch(`/taskgraph/nodes/${node.id}`, { machineId: '', x: node.position.x, y: node.position.y }).catch(() => {});
  }, []);

  const onEdgesDelete = useCallback((deleted) => {
    deleted.forEach((e) => apiDelete(`/taskgraph/edges/${e.id}`).catch(() => {}));
  }, []);
  const onNodesDelete = useCallback((deleted) => {
    deleted.forEach((n) => apiDelete(`/taskgraph/nodes/${n.id}`).catch(() => {}));
  }, []);

  async function addNode(e) {
    e.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    setError('');
    // Drop new nodes near the top-left of the current view, fanned out so they
    // don't stack exactly.
    const x = 40 + (nodes.length % 5) * 30;
    const y = 40 + (nodes.length % 5) * 30;
    try {
      const node = await apiPost('/taskgraph/nodes', { title, repoId: draftRepo || null, x, y });
      setNodes((nds) => [...nds, toRfNode(node, new Map())]);
      setDraftTitle('');
    } catch {
      setError('Could not add the step.');
    }
  }

  function cycleStatus(id, status) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status } } : n)));
    apiPatch(`/taskgraph/nodes/${id}`, { status }).catch(() => {});
  }
  function renameNode(id, title) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, title } } : n)));
    apiPatch(`/taskgraph/nodes/${id}`, { title }).catch(() => {});
  }
  // (Re)assign a step's agent (a repo on THIS box; fleet assignment lives on the
  // kanban). Empty string clears it to "no agent" (the backend's CleanRepo turns
  // blank into null); a repo id sets it.
  function setRepo(id, repoId) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, repoId: repoId || null, sourceId: null } } : n)));
    apiPatch(`/taskgraph/nodes/${id}`, { repoId: repoId || '' }).catch(() => {});
  }
  function deleteNode(id) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    if (selected === id) setSelected(null);
    apiDelete(`/taskgraph/nodes/${id}`).catch(() => {});
  }

  const sizeStyle = size ? { width: size.w, height: size.h } : undefined;

  return (
    <div className="tg-panel" ref={wrapRef} style={sizeStyle}>
      <form className="tg-add" onSubmit={addNode}>
        <input
          className="tg-add__title"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="Add a step…"
        />
        <select className="tg-add__repo" value={draftRepo} onChange={(e) => setDraftRepo(e.target.value)}>
          <option value="">(no agent)</option>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <button className="tg-add__btn" type="submit" disabled={!draftTitle.trim()}>Add</button>
      </form>

      <p className="tg-hint">
        Drag from a step’s bottom dot to the step it <b>waits on</b>. Green ring = an <b>open front</b> (do next).
        <b> Border</b> = the machine its agent runs on, <b>background</b> = the repository; a dependency
        <b> across</b> machines is drawn dashed in orange. Click a step to trace <b>why</b>; click a legend
        entry to focus it.
        {error && <span className="tg-err"> · {error}</span>}
      </p>

      {/* Pinned legends (openspec taskgraph-colours): outside the React Flow viewport,
          so panning/zooming the graph never moves them. */}
      <div className="tg-legends" data-legends>
        <GraphLegend kind="machine" title="Machines" entries={legend.machines} focus={focus} onFocus={setFocus} />
        <GraphLegend kind="repo" title="Repositories" entries={legend.repos} focus={focus} onFocus={setFocus} />
      </div>

      <div className="tg-canvas">
        <ReactFlow
          nodes={viewNodes}
          edges={viewEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onNodeClick={(_e, n) => setSelected(n.id)}
          onPaneClick={() => setSelected(null)}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, width: 38, height: 38 } }}
          elevateNodesOnSelect={false}
          connectionRadius={50}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <span
        className="tg-panel__resize"
        role="separator"
        aria-label="Resize task graph panel"
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={resetSize}
      />
    </div>
  );
}

// React Flow wants a provider in scope for its hooks; wrap once here.
// `refreshKey` (openspec tasks-agent): the host bumps it when an agent run that may
// have changed the graph has ended; the board reloads without a page refresh.
export default function TaskGraphPanel({ refreshKey = 0, pollMs = 0 }) {
  const on = useFeature('taskGraph');
  if (!on) return null;
  return (
    <ReactFlowProvider>
      <TaskGraphBoard refreshKey={refreshKey} pollMs={pollMs} />
    </ReactFlowProvider>
  );
}

// --- helpers ---
// A task from the API as a React Flow node. A legacy boxed task has box-relative
// coordinates: shown at its absolute place (box origin + offset).
function toRfNode(n, boxes) {
  const box = n.machineId ? boxes.get(n.machineId) : null;
  return {
    id: n.id,
    type: 'step',
    position: { x: (n.x ?? 0) + (box?.x ?? 0), y: (n.y ?? 0) + (box?.y ?? 0) },
    data: {
      title: n.title, note: n.note, repoId: n.repoId, sourceId: n.sourceId || null,
      status: n.status || 'todo',
    },
  };
}
function toRfEdge(e) {
  return { id: e.id, source: e.source, target: e.target };
}

// A node is actionable if it isn't delivered and every step it depends on (its
// outgoing edges' targets) is delivered — merged work unblocks its dependents.
function actionableIds(nodes, edges) {
  const statusOf = new Map(nodes.map((n) => [n.id, n.data.status]));
  const out = new Set();
  for (const n of nodes) {
    if (DELIVERED(n.data.status)) continue;
    const deps = edges.filter((e) => e.source === n.id);
    if (deps.every((e) => DELIVERED(statusOf.get(e.target)))) out.add(n.id);
  }
  return out;
}

// From a node, the chain of steps that DEPEND on it (climb incoming edges' sources)
// up to the primary task — the "why am I doing this" trace.
function whyChain(startId, edges) {
  const litNodes = new Set([startId]);
  const litEdges = new Set();
  const stack = [startId];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of edges) {
      if (e.target === cur && !litNodes.has(e.source)) {
        litNodes.add(e.source);
        litEdges.add(e.id);
        stack.push(e.source);
      } else if (e.target === cur) {
        litEdges.add(e.id);
      }
    }
  }
  return { nodes: litNodes, edges: litEdges };
}

export { STATUSES };
