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
import './taskgraph.css';

// Task dependency graph (plans/task-dependency-graph.md): a single global board of
// step nodes + "depends-on" edges, rendered with React Flow. An edge Source→Target
// means "Source waits on Target" (Target is the prerequisite). The board derives:
//   • ACTIONABLE NOW — a step that isn't done and whose every prerequisite IS done
//     (or has none): the things you can actually do next.
//   • WHY (the trace) — selecting a step highlights the chain of steps that depend
//     on it, up to the primary task it serves.
// Backend-synced via /api/taskgraph; positions persist on drag-stop.

const STATUSES = ['todo', 'doing', 'done'];
const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' };

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

// Deterministic colour per repo so a step's agent reads at a glance (label/colour
// only — no live agent state, by design).
function repoHue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
const repoColor = (id) => (id ? `hsl(${repoHue(id)} 60% 45%)` : 'var(--color-border)');

// A step node. Manages its own inline-rename state; status/rename/delete flow back
// through callbacks passed in `data`.
function StepNode({ id, data }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.title);

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== data.title) data.onRename(id, t);
    else setDraft(data.title);
  }

  return (
    <div
      className={`tg-node st-${data.status}${data.actionable ? ' is-actionable' : ''}${data.dim ? ' is-dim' : ''}`}
      style={{ '--repo-color': repoColor(data.repoId) }}
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
        {data.repoId && (
          <span className="tg-chip tg-chip--repo" style={{ '--repo-color': repoColor(data.repoId) }}>
            {data.repoName || data.repoId.slice(0, 6)}
          </span>
        )}
        {data.actionable && <span className="tg-chip tg-chip--go">do next</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { step: StepNode };

function TaskGraphBoard() {
  const { repos } = useDock();
  const repoName = useCallback((id) => repos.find((r) => r.id === id)?.name || '', [repos]);

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null); // node id whose "why" chain is lit
  const [draftTitle, setDraftTitle] = useState('');
  const [draftRepo, setDraftRepo] = useState('');
  const [error, setError] = useState('');
  const [scratch, setScratch] = useState(''); // free-text pad below the graph (persisted)
  const scratchTimer = useRef(null);
  const wrapRef = useRef(null);

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
      setNodes((board.nodes || []).map(toRfNode));
      setEdges((board.edges || []).map(toRfEdge));
      setScratch(board.scratch || '');
    } catch {
      setError('Could not load the task graph.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Flush any pending scratchpad save on unmount.
  useEffect(() => () => { if (scratchTimer.current) clearTimeout(scratchTimer.current); }, []);

  // Persist the scratchpad, debounced while typing (and flushed on blur).
  function onScratchChange(e) {
    const text = e.target.value;
    setScratch(text);
    if (scratchTimer.current) clearTimeout(scratchTimer.current);
    scratchTimer.current = setTimeout(() => {
      apiPatch('/taskgraph/scratch', { text }).catch(() => {});
    }, 500);
  }
  function flushScratch() {
    if (scratchTimer.current) { clearTimeout(scratchTimer.current); scratchTimer.current = null; }
    apiPatch('/taskgraph/scratch', { text: scratch }).catch(() => {});
  }

  // --- derived: actionable set + the selected node's dependent chain (the "why") ---
  const actionable = useMemo(() => actionableIds(nodes, edges), [nodes, edges]);
  const lit = useMemo(() => (selected ? whyChain(selected, edges) : null), [selected, edges]);

  // Re-decorate RF nodes/edges with derived state for rendering.
  const viewNodes = useMemo(
    () => nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        repoName: repoName(n.data.repoId),
        actionable: actionable.has(n.id),
        dim: lit ? !lit.nodes.has(n.id) : false,
        onCycle: cycleStatus,
        onRename: renameNode,
        onDelete: deleteNode,
      },
    })),
    [nodes, actionable, lit, repoName],
  );
  const viewEdges = useMemo(
    () => edges.map((e) => ({
      ...e,
      animated: lit ? lit.edges.has(e.id) : false,
      className: lit && !lit.edges.has(e.id) ? 'tg-edge--dim' : '',
    })),
    [edges, lit],
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

  const onNodeDragStop = useCallback((_e, node) => {
    apiPatch(`/taskgraph/nodes/${node.id}`, { x: node.position.x, y: node.position.y }).catch(() => {});
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
      setNodes((nds) => [...nds, toRfNode(node)]);
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
  function deleteNode(id) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
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
        Drag from a step’s bottom dot to the step it <b>waits on</b>. Green ring = <b>do next</b>.
        Click a step to trace <b>why</b> (the chain up to its goal); click empty space to clear.
        {error && <span className="tg-err"> · {error}</span>}
      </p>

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
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="tg-scratch">
        <span className="tg-scratch__label">Scratchpad</span>
        <textarea
          className="tg-scratch__box"
          value={scratch}
          onChange={onScratchChange}
          onBlur={flushScratch}
          placeholder="Plain-text scratchpad — jot tasks/notes here. (If you find yourself living down here instead of using the graph above, that's the signal the graph isn't pulling its weight.)"
        />
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
export default function TaskGraphPanel() {
  const on = useFeature('taskGraph');
  if (!on) return null;
  return (
    <ReactFlowProvider>
      <TaskGraphBoard />
    </ReactFlowProvider>
  );
}

// --- helpers ---
function toRfNode(n) {
  return {
    id: n.id,
    type: 'step',
    position: { x: n.x ?? 0, y: n.y ?? 0 },
    data: { title: n.title, note: n.note, repoId: n.repoId, status: n.status || 'todo' },
  };
}
function toRfEdge(e) {
  return { id: e.id, source: e.source, target: e.target };
}

// A node is actionable if it isn't done and every step it depends on (its outgoing
// edges' targets) is done.
function actionableIds(nodes, edges) {
  const statusOf = new Map(nodes.map((n) => [n.id, n.data.status]));
  const out = new Set();
  for (const n of nodes) {
    if (n.data.status === 'done') continue;
    const deps = edges.filter((e) => e.source === n.id);
    if (deps.every((e) => statusOf.get(e.target) === 'done')) out.add(n.id);
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
      if (e.target === cur) {
        litEdges.add(e.id);
        if (!litNodes.has(e.source)) { litNodes.add(e.source); stack.push(e.source); }
      }
    }
  }
  return { nodes: litNodes, edges: litEdges };
}
