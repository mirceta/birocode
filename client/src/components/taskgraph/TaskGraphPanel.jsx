import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  NodeResizer,
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
//
// MACHINE GROUPS (plans/taskgraph-machine-groups.md): a step can live inside a
// "machine" box — a React Flow group node that represents one host running agents.
// Membership is the node's React Flow `parentId` (mirrored to the backend's
// `machineId`); a child's stored {x,y} is RELATIVE to its box, so dragging the box
// carries its nodes for free. An edge whose two endpoints sit in DIFFERENT boxes is
// a cross-machine hand-off and is drawn with a distinct dashed colour.
// Backend-synced via /api/taskgraph; positions persist on drag-stop.

const STATUSES = ['todo', 'doing', 'done'];
const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' };

const CROSS_COLOR = '#e8590c'; // cross-machine edge accent (also in taskgraph.css)
const MACHINE_MIN_W = 220;
const MACHINE_MIN_H = 160;

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
  const [picking, setPicking] = useState(false); // inline agent (repo) picker open

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
            style={{ '--repo-color': repoColor(data.repoId) }}
            title="Click to change agent"
            onClick={() => setPicking(true)}
          >
            {data.repoName || data.repoId.slice(0, 6)}
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

// A machine box (plans/taskgraph-machine-groups.md): a labelled rectangle that
// contains step nodes. Rendered behind the steps; drag it to move its members,
// drag the bottom-right when selected to resize. Rename inline; × deletes the box
// but KEEPS the nodes inside (they detach to the canvas).
function MachineNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.name);

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== data.name) data.onRename(id, t);
    else setDraft(data.name);
  }

  return (
    <div className={`tg-machine${selected ? ' is-selected' : ''}`}>
      <NodeResizer
        color={CROSS_COLOR}
        isVisible={selected}
        minWidth={MACHINE_MIN_W}
        minHeight={MACHINE_MIN_H}
        onResizeEnd={(_e, params) => data.onResize(id, params)}
      />
      <div className="tg-machine__head">
        <span className="tg-machine__icon" aria-hidden>🖥️</span>
        {editing ? (
          <input
            className="tg-machine__edit nodrag"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(data.name); setEditing(false); }
            }}
          />
        ) : (
          <span className="tg-machine__name" onDoubleClick={() => { setDraft(data.name); setEditing(true); }}>
            {data.name}
          </span>
        )}
        <button
          className="tg-machine__x nodrag"
          title="Delete machine (the steps inside are kept)"
          onClick={() => data.onDelete(id)}
        >
          ×
        </button>
      </div>
    </div>
  );
}

const nodeTypes = { step: StepNode, machine: MachineNode };

function TaskGraphBoard() {
  const { repos } = useDock();
  const repoName = useCallback((id) => repos.find((r) => r.id === id)?.name || '', [repos]);

  // One React Flow node array holding BOTH machine boxes (type 'machine') and
  // step nodes (type 'step'). Machines are kept ahead of steps in the array so a
  // child never precedes its parent (a React Flow ordering requirement).
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null); // step id whose "why" chain is lit
  const [draftTitle, setDraftTitle] = useState('');
  const [draftRepo, setDraftRepo] = useState('');
  const [error, setError] = useState('');
  const wrapRef = useRef(null);

  // Latest-nodes ref so drag-stop reparenting reads current geometry without
  // re-creating the callback on every node change.
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

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
      const machineNodes = (board.machines || []).map(toRfMachine);
      const stepNodes = (board.nodes || []).map(toRfNode);
      setNodes([...machineNodes, ...stepNodes]); // machines first
      setEdges((board.edges || []).map(toRfEdge));
    } catch {
      setError('Could not load the task graph.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // --- derived: actionable set + the selected node's dependent chain (the "why") ---
  const stepNodes = useMemo(() => nodes.filter((n) => n.type === 'step'), [nodes]);
  const actionable = useMemo(() => actionableIds(stepNodes, edges), [stepNodes, edges]);
  const lit = useMemo(() => (selected ? whyChain(selected, edges) : null), [selected, edges]);
  // step id -> its machine (parentId or null), for cross-machine edge detection.
  const nodeMachine = useMemo(() => {
    const map = new Map();
    for (const n of stepNodes) map.set(n.id, n.parentId || null);
    return map;
  }, [stepNodes]);

  // Re-decorate RF nodes/edges with derived state for rendering.
  const viewNodes = useMemo(
    () => nodes.map((n) => {
      if (n.type === 'machine') {
        return { ...n, data: { ...n.data, onRename: renameMachine, onDelete: deleteMachine, onResize: resizeMachine } };
      }
      return {
        ...n,
        data: {
          ...n.data,
          repoName: repoName(n.data.repoId),
          repos,
          actionable: actionable.has(n.id),
          dim: lit ? !lit.nodes.has(n.id) : false,
          onCycle: cycleStatus,
          onRename: renameNode,
          onSetRepo: setRepo,
          onDelete: deleteNode,
        },
      };
    }),
    [nodes, actionable, lit, repoName, repos],
  );
  const viewEdges = useMemo(
    () => edges.map((e) => {
      const a = nodeMachine.get(e.source);
      const b = nodeMachine.get(e.target);
      const cross = Boolean(a && b && a !== b); // both placed, different boxes
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
        // So OMIT color entirely on same-box edges to let RF's defaultColor render
        // the head; cross-box edges pass their explicit CROSS_COLOR.
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

  // On drag-stop: machines just persist their new position (children follow for
  // free). Step nodes re-evaluate which box (if any) they were dropped into and
  // re-parent, translating between absolute and box-relative coordinates.
  const onNodeDragStop = useCallback((_e, node) => {
    if (node.type === 'machine') {
      apiPatch(`/taskgraph/machines/${node.id}`, { x: node.position.x, y: node.position.y }).catch(() => {});
      return;
    }
    const all = nodesRef.current;
    const oldParentId = node.parentId || null;
    const oldParent = oldParentId ? all.find((n) => n.id === oldParentId) : null;
    const absX = node.position.x + (oldParent?.position.x ?? 0);
    const absY = node.position.y + (oldParent?.position.y ?? 0);
    const w = node.measured?.width ?? 160;
    const h = node.measured?.height ?? 60;
    const cx = absX + w / 2;
    const cy = absY + h / 2;

    let target = null;
    for (const m of all) {
      if (m.type !== 'machine') continue;
      const mw = m.measured?.width ?? m.style?.width ?? 360;
      const mh = m.measured?.height ?? m.style?.height ?? 240;
      if (cx >= m.position.x && cx <= m.position.x + mw && cy >= m.position.y && cy <= m.position.y + mh) {
        target = m; // last match wins (topmost in array)
      }
    }
    const newParentId = target?.id ?? null;
    if (newParentId === oldParentId) {
      // Membership unchanged — node.position is already in the right frame.
      apiPatch(`/taskgraph/nodes/${node.id}`, { x: node.position.x, y: node.position.y }).catch(() => {});
      return;
    }
    const newPos = target
      ? { x: absX - target.position.x, y: absY - target.position.y }
      : { x: absX, y: absY };
    setNodes((nds) => nds.map((n) => (
      n.id === node.id
        ? { ...n, parentId: newParentId || undefined, position: newPos, data: { ...n.data, machineId: newParentId } }
        : n
    )));
    apiPatch(`/taskgraph/nodes/${node.id}`, { machineId: newParentId || '', x: newPos.x, y: newPos.y }).catch(() => {});
  }, []);

  const onEdgesDelete = useCallback((deleted) => {
    deleted.forEach((e) => apiDelete(`/taskgraph/edges/${e.id}`).catch(() => {}));
  }, []);
  // Keyboard-deleting nodes: route machines to the machine endpoint (which detaches
  // their members) and translate any orphaned children back to absolute coords so
  // they don't snap to the origin once their parent is gone.
  const onNodesDelete = useCallback((deleted) => {
    const machines = deleted.filter((n) => n.type === 'machine');
    deleted.forEach((n) => {
      const path = n.type === 'machine' ? 'machines' : 'nodes';
      apiDelete(`/taskgraph/${path}/${n.id}`).catch(() => {});
    });
    if (machines.length) {
      setNodes((nds) => nds.map((n) => {
        const dm = machines.find((m) => m.id === n.parentId);
        if (!dm) return n;
        return {
          ...n,
          parentId: undefined,
          position: { x: n.position.x + dm.position.x, y: n.position.y + dm.position.y },
          data: { ...n.data, machineId: null },
        };
      }));
    }
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
      setNodes((nds) => [...nds, toRfNode(node)]); // steps after machines
      setDraftTitle('');
    } catch {
      setError('Could not add the step.');
    }
  }

  async function addMachine() {
    setError('');
    const count = nodesRef.current.filter((n) => n.type === 'machine').length;
    const x = 80 + (count % 4) * 60;
    const y = 80 + (count % 4) * 60;
    try {
      const m = await apiPost('/taskgraph/machines', { name: `machine ${count + 1}`, x, y });
      setNodes((nds) => [toRfMachine(m), ...nds]); // keep machines ahead of steps
    } catch {
      setError('Could not add the machine.');
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
  // (Re)assign a step's agent. Empty string clears it to "no agent" (the backend's
  // CleanRepo turns blank into null); a repo id sets it.
  function setRepo(id, repoId) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, repoId: repoId || null } } : n)));
    apiPatch(`/taskgraph/nodes/${id}`, { repoId: repoId || '' }).catch(() => {});
  }
  function deleteNode(id) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    if (selected === id) setSelected(null);
    apiDelete(`/taskgraph/nodes/${id}`).catch(() => {});
  }

  function renameMachine(id, name) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n)));
    apiPatch(`/taskgraph/machines/${id}`, { name }).catch(() => {});
  }
  function resizeMachine(id, params) {
    setNodes((nds) => nds.map((n) => (
      n.id === id
        ? { ...n, position: { x: params.x, y: params.y }, style: { ...n.style, width: params.width, height: params.height } }
        : n
    )));
    apiPatch(`/taskgraph/machines/${id}`, { x: params.x, y: params.y, w: params.width, h: params.height }).catch(() => {});
  }
  // Delete a box but KEEP its steps: detach each child (translate to absolute,
  // clear parent). The backend mirrors this translation on DELETE.
  function deleteMachine(id) {
    setNodes((nds) => {
      const m = nds.find((n) => n.id === id);
      const mx = m?.position.x ?? 0;
      const my = m?.position.y ?? 0;
      return nds
        .filter((n) => n.id !== id)
        .map((n) => (
          n.parentId === id
            ? { ...n, parentId: undefined, position: { x: n.position.x + mx, y: n.position.y + my }, data: { ...n.data, machineId: null } }
            : n
        ));
    });
    apiDelete(`/taskgraph/machines/${id}`).catch(() => {});
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
        <button className="tg-add__btn tg-add__btn--machine" type="button" onClick={addMachine} title="Add a machine box">
          🖥️ Machine
        </button>
      </form>

      <p className="tg-hint">
        Drag from a step’s bottom dot to the step it <b>waits on</b>. Green fill = an <b>open front</b> (do next).
        Drop a step inside a <b>machine</b> box to place it there; a dependency <b>across</b> boxes is
        drawn dashed in orange. Click a step to trace <b>why</b>.
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
          onNodeClick={(_e, n) => setSelected(n.type === 'step' ? n.id : null)}
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
  const node = {
    id: n.id,
    type: 'step',
    position: { x: n.x ?? 0, y: n.y ?? 0 },
    data: { title: n.title, note: n.note, repoId: n.repoId, machineId: n.machineId || null, status: n.status || 'todo' },
  };
  // A placed step is a React Flow child of its machine box; its {x,y} is already
  // box-relative (that's how we store it), so no translation is needed here.
  if (n.machineId) node.parentId = n.machineId;
  return node;
}
function toRfMachine(m) {
  return {
    id: m.id,
    type: 'machine',
    position: { x: m.x ?? 0, y: m.y ?? 0 },
    style: { width: m.w ?? 360, height: m.h ?? 240 },
    data: { name: m.name || 'machine' },
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
