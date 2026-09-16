import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../../api/client';
import TaskFilterBar from './TaskFilterBar';
import { useTaskFilter } from './taskFilterStore';
import { COLUMNS, columnOf } from './kanbanColumns';
import { defaultLayout, normalizeLayout, toggleColumn, isVisible, widthOf, setWidth, dragWidth, sameLayout, toWire } from './kanbanLayout';
import { cleanTitle, cleanNote, editKey, titleChanged, noteChanged } from './cardEdit';
import { progressOf, progressNote, boardCheckOf, linksOf, observationOf } from './cardSections';
import { applyFilter, assigneesOf, blockedIds, filterContext, flagsOf, isNarrowed, staleIds, taskView } from './taskFilters';
import { useTaskColors, machineKey, repoKey } from './useTaskColors';
import AgentMark from './AgentMark';
import AgentStatusDot, { agentDotState, workingBadgeClass } from '../shared/AgentStatusDot';
import './kanban.css';

// The Kanban view of the task board (openspec task-board-kanban, columns per
// openspec kanban-lifecycle-columns): the same nodes and depends-on edges as the
// Task graph, read as the six delivery-lifecycle columns. Where the graph answers
// "what waits on what", the board answers "where is the work really" — from
// committed up the HARNESS moves cards by observing git/PR facts, so a card in
// Done means the merge is real, not that an agent said so. The operator, the
// arch agent (through its MCP tools) and any future management agent all write
// to the same /api/taskgraph store.
//
// Columns (kanbanColumns.js, per openspec kanban-lifecycle-columns) = statuses: Todo ·
// Doing · Committed (on a branch, NOT on origin) · PR opened · PR merged · Done.
// Assignment is a chip on the card, not a column. Dragging writes status through the
// operator PATCH (unclamped — the operator is the escape hatch for cards the verifier
// cannot see).
//
// Filters (openspec task-filters): the bar pinned under the head narrows the cards by
// machine, repo agent, state (column) and flag, plus a text search; the model is the
// shared task filter (URL query + last filter per browser), the same the Task graph
// uses. A filtered-out card is not rendered; the column head shows "shown of all".
//
// Column layout (fleet task 0a57d282, kanbanLayout.js): the row above the board toggles
// each column shown/hidden and every column has a drag handle on its right edge for
// horizontal resize (the row scrolls horizontally). The LIVE layout is what the Operator
// is editing; "Save layout" snapshots it server-side (this harness's kanban-layout.json,
// GET/PUT /api/taskgraph/layout — outside the fleet-synced graph on purpose) and
// "Restore layout" re-applies that snapshot exactly. On load the live layout starts from
// the saved one, so the saved layout is what survives a reload. Hiding a column only
// stops rendering its cards here — nothing moves or is deleted.

const POLL_MS = 5000;

const DELIVERED = (s) => s === 'pr-merged' || s === 'done';

function ago(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export default function KanbanBoard() {
  const [board, setBoard] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [ideaNumbers, setIdeaNumbers] = useState({});
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyNote, setVerifyNote] = useState('');
  const [copiedId, setCopiedId] = useState(null); // the card whose reference was just copied
  const [confirmDelete, setConfirmDelete] = useState(null); // the card whose delete is armed (fleet task e3b7065c)
  const [, setTick] = useState(0);
  // Column layout (fleet task 0a57d282): LIVE (being edited) vs SAVED (server-side).
  const [layout, setLayout] = useState(defaultLayout);
  const [savedLayout, setSavedLayout] = useState(null); // null = nothing saved on this harness
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [layoutNote, setLayoutNote] = useState('');
  const [resizing, setResizing] = useState(null); // the column key whose handle is being dragged
  const resizeRef = useRef(null);

  // The saved layout, once: live starts from it so a reload shows the saved board.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiGet('/taskgraph/layout');
        if (!alive) return;
        const saved = r?.layout ? normalizeLayout(r.layout) : null;
        setSavedLayout(saved);
        if (saved) setLayout(saved);
      } catch {
        /* unreachable → defaults; Save will report if it also fails */
      } finally {
        if (alive) setLayoutLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const saveLayout = async () => {
    setLayoutBusy(true);
    setLayoutNote('');
    try {
      const r = await apiPut('/taskgraph/layout', toWire(layout));
      const saved = normalizeLayout(r?.layout);
      setSavedLayout(saved);
      setLayout(saved);
      setLayoutNote('layout saved');
    } catch (e) {
      setLayoutNote(`save failed: ${e?.message || e}`);
    } finally {
      setLayoutBusy(false);
    }
  };
  const restoreLayout = () => {
    if (!savedLayout) return;
    setLayout(savedLayout);
    setLayoutNote('layout restored');
  };
  // Live ≠ what Restore would give → the Save button is emphasised and marked •.
  const layoutDirty = layoutLoaded && !sameLayout(layout, savedLayout || defaultLayout());

  // Drag a column's right-edge handle: pointer events on window so the drag survives
  // leaving the handle; the width updates live (clamped) and settles on release.
  const startResize = (key) => (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { key, x: e.clientX, w: widthOf(layout, key) };
    resizeRef.current = start;
    setResizing(key);
    const onMove = (ev) => {
      const r = resizeRef.current;
      if (!r) return;
      setLayout((l) => setWidth(l, r.key, dragWidth(r.w, ev.clientX - r.x)));
    };
    const onUp = () => {
      resizeRef.current = null;
      setResizing(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const load = useCallback(async () => {
    try {
      // includeConsumed: promoted ideas are consumed (hidden from the default list),
      // but the 💡#N chip must still resolve their handle (openspec ideas-consume-on-promotion).
      const [b, f, ideas] = await Promise.all([apiGet('/taskgraph'), apiGet('/arch/fleet/status').catch(() => null), apiGet('/notes?includeConsumed=true').catch(() => null)]);
      setBoard(b);
      if (f) setFleet(f);
      if (Array.isArray(ideas)) setIdeaNumbers(Object.fromEntries(ideas.filter((i) => i.number > 0).map((i) => [i.id, i.number])));
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const tick = setInterval(() => setTick((n) => n + 1), 5000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, [load]);

  const nodes = board?.nodes || [];
  const edges = board?.edges || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const prereqsOf = (id) => edges.filter((e) => e.source === id).map((e) => byId.get(e.target)).filter(Boolean);
  const isBlocked = (n) => !DELIVERED(n.status) && prereqsOf(n.id).some((p) => !DELIVERED(p.status));
  const staleMs = (board?.staleHours || 24) * 3600e3;
  const isStale = (n) => (n.status === 'committed' || n.status === 'pr-opened') && Date.now() - (n.updatedAt || 0) > staleMs;

  // The shared task filter (openspec task-filters) over this board's cards.
  const [filter, setFilter] = useTaskFilter();
  const filterCtx = useMemo(() => filterContext(fleet, columnOf), [fleet]);
  const blockedSet = useMemo(() => blockedIds(nodes, edges), [nodes, edges]);
  // Stale = parked in committed / pr-opened past the board's window (the same rule as
  // the card's stale badge), so the "stale" flag chip appears when such cards exist.
  const staleMsForFilter = (board?.staleHours || 24) * 3600e3;
  const staleSet = useMemo(() => staleIds(nodes, staleMsForFilter), [nodes, staleMsForFilter]);
  // Board integrity flags (openspec kanban-board-integrity): "needs human" and "manual"
  // are filterable like blocked / stale.
  const needsHumanSet = useMemo(() => new Set(nodes.filter((n) => n.needsHuman).map((n) => n.id)), [nodes]);
  const manualSet = useMemo(() => new Set(nodes.filter((n) => n.manual).map((n) => n.id)), [nodes]);
  const views = useMemo(() => nodes.map((n) => taskView(n, filterCtx, flagsOf(n.id, blockedSet, staleSet, needsHumanSet, manualSet))), [nodes, filterCtx, blockedSet, staleSet, needsHumanSet, manualSet]);
  const shownIds = useMemo(() => applyFilter(views, filter), [views, filter]);
  const narrowed = isNarrowed(filter);

  // Assignee choices: every repo agent the fleet status knows, keyed "sourceId|repoId".
  const agents = [];
  const machineLabel = {};
  for (const m of fleet?.machines || []) {
    machineLabel[m.self ? '' : m.sourceId] = m.machine;
    // The handle ("spacex/prg#2", openspec stable-handles) is the label everywhere.
    for (const a of m.agents || []) agents.push({ key: `${m.self ? '' : m.sourceId}|${a.repoId}`, label: `${a.handle || `${m.machine}/${a.name}`}${a.managed ? ' 🏛' : ''}`, machine: m.machine, name: a.name, handle: a.handle, managed: a.managed, remoteUrl: a.remoteUrl, runningSince: a.runningSince, onDefault: a.onDefault, branch: a.branch });
  }
  // The live activity of one assignee (fleet-status task dfee16ea): look the assignee up
  // in the SAME fleet-status snapshot Fleet Status uses, so the shared AgentStatusDot
  // reflects real current state (pulsing while running, green when free) and updates on
  // the board's 5 s fleet poll — not a stale card field. null when the fleet doesn't know
  // the agent (offline / unmanaged) → the dot reads "unknown".
  const fleetAgentOf = (a) => agents.find((x) => x.key === `${a.sourceId || ''}|${a.repoId}`) || null;
  // Shared machine/repo colours (fleet-status task 327aa5ae): the SAME palette + slot map
  // the Task graph and Fleet Status use, so a machine/agent has one hue across all views.
  // A chip's border = its machine's hue, its background tint = its repo's hue.
  const remoteUrlOf = (a) => agents.find((x) => x.key === `${a.sourceId || ''}|${a.repoId}`)?.remoteUrl || null;
  const mkOf = (a) => machineKey({ sourceId: a.sourceId || null, repoId: a.repoId });
  const rkOf = (a) => repoKey({ sourceId: a.sourceId || null, repoId: a.repoId }, remoteUrlOf);
  const allAssignees = nodes.flatMap((n) => assigneesOf(n));
  const colors = useTaskColors(allAssignees.map(mkOf), allAssignees.map(rkOf));
  // One assignee's label: the fleet handle when known, else a readable fallback
  // (openspec task-multi-assignee: a card carries one or several of these).
  const keyOf = (a) => `${a.sourceId || ''}|${a.repoId}`;
  const assigneeLabelOf = (a) => {
    const known = agents.find((x) => x.key === keyOf(a));
    if (known) return known.handle || `${known.machine}/${known.name}`;
    return `${String(a.repoId).slice(0, 8)}… @ ${machineLabel[a.sourceId || ''] || (a.sourceId ? a.sourceId.slice(0, 8) : 'this machine')}`;
  };
  // The assignee's colour-independent identity (fleet task 4ddcfce3): the SAME glyph +
  // monogram its chip carries on Fleet Status, from the shared module — machine label and
  // repo handle as the fleet reports them, so the two views agree letter for letter.
  const markOf = (a) => {
    const known = agents.find((x) => x.key === keyOf(a));
    const machine = known?.machine || machineLabel[a.sourceId || ''] || (a.sourceId ? a.sourceId.slice(0, 8) : 'this machine');
    return colors.mark(mkOf(a), rkOf(a), machine, known?.handle || known?.name || String(a.repoId).slice(0, 8));
  };

  const patch = async (id, body) => {
    try { await apiPatch(`/taskgraph/nodes/${id}`, body); await load(); } catch (e) { setError(e?.message || String(e)); }
  };
  const setStatus = (n, status) => patch(n.id, { status });

  // Rename a card / edit its description (fleet task 576ead63, cardEdit.js): the SAME
  // operator PATCH (title / note) the arch's update_task funnels into — one store, nothing
  // parallel. The id, and so the #ref, never changes. load() re-reads the board right
  // after, so the card and its detail show the new text at once (the Task graph reads the
  // same node on its poll). One editor at a time; Enter/✓ saves, Esc/✕ cancels; a blank
  // title is not savable (the server refuses it too).
  const [editTitle, setEditTitle] = useState(null); // the card whose title is being edited
  const [titleDraft, setTitleDraft] = useState('');
  const [editNote, setEditNote] = useState(null);   // the card whose description is being edited
  const [noteDraft, setNoteDraft] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const startTitleEdit = (e, n) => { e.stopPropagation(); setTitleDraft(n.title || ''); setEditTitle(n.id); };
  const cancelTitleEdit = () => { setEditTitle(null); setTitleDraft(''); };
  const saveTitle = async (n) => {
    if (!cleanTitle(titleDraft)) return;
    if (!titleChanged(titleDraft, n.title)) { cancelTitleEdit(); return; }
    setEditBusy(true);
    try { await apiPatch(`/taskgraph/nodes/${n.id}`, { title: cleanTitle(titleDraft) }); await load(); cancelTitleEdit(); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setEditBusy(false); }
  };
  const startNoteEdit = (e, n) => { e.stopPropagation(); setNoteDraft(n.note || ''); setEditNote(n.id); };
  const cancelNoteEdit = () => { setEditNote(null); setNoteDraft(''); };
  const saveNote = async (n) => {
    if (!noteChanged(noteDraft, n.note)) { cancelNoteEdit(); return; }
    setEditBusy(true);
    try { await apiPatch(`/taskgraph/nodes/${n.id}`, { note: cleanNote(noteDraft) }); await load(); cancelNoteEdit(); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setEditBusy(false); }
  };
  const onEditKey = (e, kind, save, cancel) => {
    const k = editKey(e, kind);
    if (k === 'save') { e.preventDefault(); save(); } else if (k === 'cancel') { e.preventDefault(); cancel(); }
  };

  // Board goal + the policeman (openspec kanban-board-integrity, fleet task b2ea0809).
  // The goal is the Operator's reference for the board (PATCH /taskgraph/goal, synced
  // across the fleet with the board); `integrity` is the policeman's last verdict, riding
  // the same board poll. "Go manual" flips the card's manual flag through the SAME node
  // PATCH; a human request is raised/resolved on the card.
  const [editGoal, setEditGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [goalBusy, setGoalBusy] = useState(false);
  const saveGoal = async () => {
    setGoalBusy(true);
    try { await apiPatch('/taskgraph/goal', { text: goalDraft }); await load(); setEditGoal(false); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setGoalBusy(false); }
  };
  const integrity = board?.integrity || null;
  const integrityOf = useMemo(() => new Map((integrity?.flagged || []).map((f) => [f.id, f])), [integrity]);
  const setManual = (n, manual) => patch(n.id, { manual });
  const requestHuman = async (n) => {
    try { await apiPost(`/taskgraph/nodes/${n.id}/human`, { reason: 'raised by the Operator on the board' }); await load(); }
    catch (e) { setError(e?.message || String(e)); }
  };
  // The policeman's observation on a card (openspec policeman-observes-agents): the Operator
  // can dismiss it; the next pass may record a fresh one.
  const dismissObservation = async (n) => {
    try { await apiDelete(`/taskgraph/nodes/${n.id}/observation`); await load(); }
    catch (e) { setNote((s) => ({ ...s, [n.id]: `dismiss failed: ${e?.message || e}` })); }
  };
  const resolveHuman = async (n) => {
    try { await apiDelete(`/taskgraph/nodes/${n.id}/human`); await load(); }
    catch (e) { setError(e?.message || String(e)); }
  };
  // Add / remove one assignee (openspec task-multi-assignee): the set on the card grows
  // or shrinks; every other assignee keeps its own state.
  const changeAssignees = async (n, key, mode) => {
    const [sourceId, repoId] = key ? key.split('|') : ['', ''];
    if (!repoId) return;
    try { await apiPost(`/taskgraph/nodes/${n.id}/assign`, { assignees: [{ sourceId: sourceId || null, repoId }], mode, by: 'human' }); await load(); } catch (e) { setError(e?.message || String(e)); }
  };
  const dispatch = async (n) => {
    setBusy(n.id);
    try {
      const r = await apiPost(`/taskgraph/nodes/${n.id}/dispatch`, {});
      setNote((m) => ({ ...m, [n.id]: `${r.status}: ${r.detail || ''}` }));
      await load();
    } catch (e) {
      setNote((m) => ({ ...m, [n.id]: e?.message || String(e) }));
    } finally { setBusy(null); }
  };
  // Delete a task (fleet task e3b7065c): the confirmed trash button and the detail's
  // Delete both land here → DELETE /api/taskgraph/nodes/{id} removes the node, its
  // assignee rows and its edges (and restores any promoted idea), then reload so the card
  // vanishes from the Kanban and the Task graph at once. Two-step confirm via confirmDelete
  // so nothing is deleted by accident.
  const remove = async (n) => {
    setConfirmDelete(null);
    setOpen((o) => (o === n.id ? null : o));
    try { await apiDelete(`/taskgraph/nodes/${n.id}`); await load(); } catch (e) { setError(e?.message || String(e)); }
  };
  // The delete affordance, used on the card face and in the detail. Armed = show the
  // confirm pair; otherwise a small trash button. Every handler stops propagation so it
  // never opens the card or starts a drag; the buttons are draggable=false for the same.
  const deleteControl = (n, variant) => (
    confirmDelete === n.id ? (
      <span className={`kb__del-confirm${variant === 'detail' ? ' kb__del-confirm--detail' : ''}`} onClick={(e) => e.stopPropagation()} data-delete-confirm={n.id}>
        <span className="kb__del-q">Delete?</span>
        <button type="button" className="kb__btn kb__btn--danger" draggable={false} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(n); }} data-confirm-delete={n.id}>🗑 Delete</button>
        <button type="button" className="kb__btn" draggable={false} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}>Cancel</button>
      </span>
    ) : (
      <button type="button" className="kb__del" title="Delete this task" aria-label={`Delete task ${cardRef(n)}`} draggable={false} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setConfirmDelete(n.id); }} data-delete={n.id}>🗑</button>
    )
  );
  const add = async (e) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    try { await apiPost('/taskgraph/nodes', { title, createdBy: 'human' }); setDraft(''); await load(); } catch (err) { setError(err?.message || String(err)); }
  };
  // Card reference (openspec kanban-card-ref): the short stable code "#5cc3e900" is the
  // first 8 characters of the task id; the COPIED text is "task <full id>", which the
  // arch resolves exactly (its tools take the id; they also accept the #ref itself).
  const cardRef = (n) => `#${String(n.id).slice(0, 8)}`;
  const copyRef = async (e, n) => {
    e.stopPropagation();
    e.preventDefault();
    const text = `task ${n.id}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be unavailable over plain HTTP on the LAN: legacy path.
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      document.body.removeChild(ta);
    }
    setCopiedId(n.id);
    setTimeout(() => setCopiedId((cur) => (cur === n.id ? null : cur)), 1500);
  };
  // Re-verify (openspec board-verify-remote): one verifier pass now — this machine's
  // assignees from git, every card with a PR against GitHub — so stuck cards move
  // without waiting for the minute tick. Reports what moved.
  const reverify = async () => {
    setVerifying(true);
    setVerifyNote('');
    try {
      const r = await apiPost('/taskgraph/verify', {});
      const moved = (r.changes || []).map((c) => `${c.title}: ${c.from} → ${c.to}`);
      setVerifyNote(moved.length ? `moved ${moved.length}: ${moved.join(' · ')}` : `checked ${r.checked} card(s), nothing to move${(r.notes || []).length ? ` · ${r.notes[0]}` : ''}`);
      await load();
    } catch (e) {
      setVerifyNote(e?.message || String(e));
    } finally { setVerifying(false); }
  };

  // Drag a card onto a column = set that status (the operator PATCH, unclamped;
  // assignment stays — it is a chip now, not a column).
  const onDrop = (col) => (e) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/task-id');
    const n = byId.get(id);
    if (!n || n.status === col) return;
    setStatus(n, col);
  };

  const columns = COLUMNS.map(([key, label, hint]) => {
    const all = nodes.filter((n) => columnOf(n) === key).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { key, label, hint, all, cards: all.filter((n) => shownIds.has(n.id)) };
  });
  // Only the columns the layout shows are rendered; their cards stay exactly where they are.
  const shownColumns = columns.filter((c) => isVisible(layout, c.key));
  const hiddenColumns = columns.length - shownColumns.length;

  return (
    <div className={`kb${resizing ? ' kb--resizing' : ''}`} data-kanban>
      {/* Board goal + policeman verdict (openspec kanban-board-integrity). */}
      <div className="kb__goal" data-board-goal>
        <span className="kb__goal-label">🎯 Board goal</span>
        {editGoal ? (
          <div className="kb__goal-edit" data-goal-editor>
            <textarea
              className="kb__goal-input"
              value={goalDraft}
              autoFocus
              rows={2}
              placeholder="What should this board achieve? The policeman's report and the arch judge the board against this."
              aria-label="Board goal"
              onChange={(e) => setGoalDraft(e.target.value)}
              onKeyDown={(e) => onEditKey(e, 'textarea', saveGoal, () => setEditGoal(false))}
              disabled={goalBusy}
              data-goal-input
            />
            <div className="kb__row kb__actions">
              <button type="button" className="kb__btn kb__btn--primary" onClick={saveGoal} disabled={goalBusy} data-goal-save>✓ Save goal</button>
              <button type="button" className="kb__btn" onClick={() => setEditGoal(false)} disabled={goalBusy} data-goal-cancel>✕ Cancel</button>
              <span className="kb__dim">Ctrl+Enter saves · Esc cancels · shared by the whole fleet board</span>
            </div>
          </div>
        ) : (
          <>
            <span className={`kb__goal-text${board?.goal ? '' : ' kb__dim'}`} data-goal-text>{board?.goal || 'no goal set — say what this board should achieve; the policeman and the arch judge the board against it'}</span>
            <button type="button" className="kb__edit kb__edit--label" onClick={() => { setGoalDraft(board?.goal || ''); setEditGoal(true); }} title="Set or edit the board goal" data-edit-goal>✎ {board?.goal ? 'edit' : 'set goal'}</button>
          </>
        )}
        <span className="kb__layout-spacer" />
        <span
          className={`kb__police${integrity && (integrity.dishonest > 0 || integrity.stuck > 0) ? ' kb__police--alert' : ''}`}
          title="Board check, by the auto-verifier after every pass: every card is judged against the real facts (the assignee's clone, the PR on GitHub, the deploy log). Honest = the column matches the facts. Not verified yet = the card claims more than the facts confirm. Needs human = stamped 🆘 by the policeman, an agent or you. Manual = you drive it by hand, it is not policed. Each card's Board check section says which and why."
          data-police
          data-police-dishonest={integrity?.dishonest ?? ''}
          data-police-stuck={integrity?.stuck ?? ''}
        >
          🔎 {integrity
            ? `board check ${ago(Date.now() - integrity.checkedAt) || '0 s'} ago · ${integrity.honest} honest · ${integrity.dishonest} not verified yet · ${integrity.stuck} need human · ${integrity.manual} manual`
            : 'board check — no pass yet'}
        </span>
      </div>
      <div className="kb__head">
        <form className="kb__add" onSubmit={add}>
          <input className="kb__input" placeholder="New task — one line of what done looks like" value={draft} onChange={(e) => setDraft(e.target.value)} data-kanban-draft />
          <button type="submit" className="kb__btn kb__btn--primary" disabled={!draft.trim()}>＋ Task</button>
        </form>
        <span className="kb__dim">Same tasks as the Task graph, read as columns. Assign a card to any repo agent on any machine; the arch agent pings assigned cards on its next wake, or press Ping.</span>
        <button type="button" className="kb__btn" onClick={reverify} disabled={verifying} title="Run the verifier now: this machine's assignees from git, every card with a PR against GitHub (merged PR = proof, even when the branch is gone)" data-reverify>{verifying ? 'verifying…' : '↻ Re-verify board'}</button>
        {verifyNote && <span className="kb__dim" data-reverify-note>{verifyNote}</span>}
      </div>
      <TaskFilterBar views={views} filter={filter} setFilter={setFilter} view="kanban" />
      {/* Column layout controls (fleet task 0a57d282): show/hide each column, save/restore the layout. */}
      <div className="kb__layout" role="toolbar" aria-label="Kanban column layout" data-kanban-layout>
        <span className="kb__layout-label">columns</span>
        {columns.map((c) => {
          const on = isVisible(layout, c.key);
          return (
            <button
              key={c.key}
              type="button"
              className={`kb__coltoggle${on ? ' kb__coltoggle--on' : ''}`}
              aria-pressed={on}
              title={on ? `Hide the ${c.label} column in this view (its ${c.all.length} card${c.all.length === 1 ? '' : 's'} stay where they are)` : `Show the ${c.label} column`}
              onClick={() => setLayout((l) => toggleColumn(l, c.key))}
              data-column-toggle={c.key}
              data-on={on ? 'true' : 'false'}
            >
              <span className="kb__coltoggle-box" aria-hidden="true">{on ? '☑' : '☐'}</span>
              {c.label}
              <span className="kb__coltoggle-n">{c.all.length}</span>
            </button>
          );
        })}
        <span className="kb__layout-spacer" />
        {hiddenColumns > 0 && <span className="kb__dim" data-hidden-columns={hiddenColumns}>{hiddenColumns} column{hiddenColumns > 1 ? 's' : ''} hidden</span>}
        <button
          type="button"
          className={`kb__btn${layoutDirty ? ' kb__btn--primary' : ''}`}
          onClick={saveLayout}
          disabled={layoutBusy || !layoutLoaded}
          title="Save the current column layout (which columns are shown + each width) on this harness — it survives reloads and other browsers"
          data-save-layout
          data-dirty={layoutDirty ? 'true' : 'false'}
        >
          {layoutBusy ? 'saving…' : `💾 Save layout${layoutDirty ? ' •' : ''}`}
        </button>
        <button
          type="button"
          className="kb__btn"
          onClick={restoreLayout}
          disabled={!savedLayout || layoutBusy}
          title={savedLayout ? 'Re-apply the saved column layout exactly (shown columns + widths)' : 'Nothing saved yet — press Save layout first'}
          data-restore-layout
        >
          ↺ Restore layout
        </button>
        {layoutNote && <span className="kb__dim" data-layout-note>{layoutNote}</span>}
      </div>
      {!board && !error && <div className="kb__note" data-loading>Loading the board…</div>}
      {error && <div className="kb__note kb__note--err">{error}</div>}
      {board && shownColumns.length === 0 && <div className="kb__note" data-all-hidden>All columns are hidden — tick a column above to show it. No card was moved or deleted.</div>}
      <div className="kb__cols">
        {shownColumns.map((c) => (
          <section
            key={c.key}
            className={`kb__col kb__col--${c.key}${dragOver === c.key ? ' kb__col--over' : ''}`}
            style={{ width: widthOf(layout, c.key) }}
            data-column={c.key}
            data-column-width={widthOf(layout, c.key)}
            onDragOver={(e) => { e.preventDefault(); if (dragOver !== c.key) setDragOver(c.key); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={onDrop(c.key)}
          >
            <div className="kb__col-head" title={c.hint}>
              <span>{c.label}</span>
              <span className="kb__count" data-column-count={c.cards.length} data-column-total={c.all.length}>
                {c.cards.length}{narrowed && c.all.length !== c.cards.length ? <span className="kb__count-of"> of {c.all.length}</span> : null}
              </span>
            </div>
            <div className="kb__cards">
              {c.cards.length === 0 && <div className="kb__empty">{narrowed && c.all.length > 0 ? `${c.all.length} hidden by the filter` : c.key === 'todo' ? 'nothing waiting' : '—'}</div>}
              {c.cards.map((n) => {
                const blocked = isBlocked(n);
                const prereqs = prereqsOf(n.id);
                const isOpen = open === n.id;
                return (
                  <article
                    key={n.id}
                    className={`kb__card${blocked ? ' kb__card--blocked' : ''}${isOpen ? ' kb__card--open' : ''}${n.manual ? ' kb__card--manual' : ''}${n.needsHuman ? ' kb__card--human' : ''}${integrityOf.get(n.id)?.state === 'dishonest' ? ' kb__card--dishonest' : ''}`}
                    draggable={editTitle !== n.id && editNote !== n.id}
                    onDragStart={(e) => { e.dataTransfer.setData('text/task-id', n.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => setOpen(isOpen ? null : n.id)}
                    data-task={n.id}
                    data-column={c.key}
                  >
                    <div className={`kb__title${editTitle === n.id ? ' kb__title--editing' : ''}`}>
                      {editTitle === n.id ? (
                        <span className="kb__title-edit" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} data-title-editor>
                          <input
                            className="kb__title-input"
                            value={titleDraft}
                            autoFocus
                            placeholder="A readable title"
                            aria-label={`Title of card ${cardRef(n)}`}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onKeyDown={(e) => onEditKey(e, 'input', () => saveTitle(n), cancelTitleEdit)}
                            disabled={editBusy}
                            data-title-input
                          />
                          <button type="button" className="kb__edit-ok" title="Save the new title (Enter)" aria-label="Save title" onClick={() => saveTitle(n)} disabled={editBusy || !cleanTitle(titleDraft)} data-title-save>✓</button>
                          <button type="button" className="kb__edit-cancel" title="Cancel (Esc)" aria-label="Cancel rename" onClick={cancelTitleEdit} disabled={editBusy} data-title-cancel>✕</button>
                        </span>
                      ) : (
                        <span className="kb__title-text" onDoubleClick={(e) => startTitleEdit(e, n)} title="Double-click to rename">{n.title}</span>
                      )}
                      <span className="kb__ref" data-card-ref={cardRef(n)} title={`card ${cardRef(n)} — task id ${n.id}`}>
                        <code className="kb__ref-code">{cardRef(n)}</code>
                        <button
                          type="button"
                          className={`kb__copy${copiedId === n.id ? ' kb__copy--done' : ''}`}
                          title="Copy a reference to this card for the arch agent prompt (task <id>)"
                          aria-label={`Copy reference to card ${cardRef(n)}`}
                          draggable={false}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => copyRef(e, n)}
                          data-copy-ref
                        >
                          {copiedId === n.id ? '✓ copied' : '⧉'}
                        </button>
                      </span>
                      {editTitle !== n.id && (
                        <button
                          type="button"
                          className="kb__edit"
                          title="Rename this card — the task id and #ref stay the same"
                          aria-label={`Rename card ${cardRef(n)}`}
                          draggable={false}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => startTitleEdit(e, n)}
                          data-edit-title
                        >
                          ✎
                        </button>
                      )}
                      <button
                        type="button"
                        className={`kb__edit kb__manual${n.manual ? ' kb__manual--on' : ''}`}
                        title={n.manual ? 'Manual — click to hand the card back to the harness (the policeman and the arch resume)' : 'Go manual — you drive this repo agent directly on its machine; the policeman and the arch will ignore this card'}
                        aria-label={n.manual ? 'Back to automatic' : 'Go manual'}
                        aria-pressed={!!n.manual}
                        draggable={false}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setManual(n, !n.manual); }}
                        data-manual-toggle={n.manual ? 'on' : 'off'}
                      >
                        ✋
                      </button>
                      {deleteControl(n)}
                    </div>
                    {/* Card sections (openspec kanban-card-sections): Header (title row above +
                        assignees), Progress, Board check, Links — every status names its source. */}
                    {assigneesOf(n).length > 0 && (
                    <div className="kb__meta kb__who" data-card-assignees>
                      {assigneesOf(n).map((a) => {
                        const multi = assigneesOf(n).length > 1;
                        const c = colors.chip(mkOf(a), rkOf(a));
                        // Working emphasis (task 3546287b): the SAME state that drives the
                        // blinking dot decides it — on a multi-assignee card only the
                        // assignee that is actually running enlarges.
                        const st = agentDotState(fleetAgentOf(a));
                        const working = workingBadgeClass(st);
                        return (
                          <span key={keyOf(a)} className={`kb__chip kb__chip--who${c.cls}${multi ? ' kb__chip--who-multi' : ''}${a.warning ? ' kb__chip--who-warn' : ''}${working ? ` ${working} kb__chip--working` : ''}`} style={c.style} title={`${assigneeLabelOf(a)} — this machine + repo agent's colour, mark and activity dot match Fleet Status${working ? ' · WORKING NOW' : ''}${multi ? ` · ${a.status}` : ''}${a.warning ? ` · ⚠ ${a.warning}` : ''}`} data-assignee={keyOf(a)} data-working={working ? 'true' : undefined}>
                            <AgentStatusDot state={st} /><AgentMark mark={markOf(a)} compact /> {assigneeLabelOf(a)}{multi ? <span className="kb__who-status"> · {a.status}</span> : null}
                          </span>
                        );
                      })}
                    </div>
                    )}
                    {(() => {
                      const blockedBy = blocked ? prereqs.filter((p) => !DELIVERED(p.status)).map((p) => p.title) : [];
                      const progress = progressOf(n);
                      const pnote = progressNote(n, { blockedBy });
                      const check = boardCheckOf(n, { integrity: integrityOf.get(n.id) || null, checkedAt: integrity?.checkedAt || null });
                      const links = linksOf(n, { prereqs, blockedBy, stale: isStale(n), ideaNumber: ideaNumbers[n.ideaId] || null });
                      const obs = observationOf(n);
                      return (
                        <>
                          <div className="kb__sec kb__progress" data-card-progress={progress.current}>
                            <span className="kb__sec-label">Progress</span>
                            <ol className="kb__steps" aria-label={`Progress: ${progress.currentLabel}`}>
                              {progress.steps.map((s) => (
                                <li
                                  key={s.key}
                                  className={`kb__step kb__step--${s.state}`}
                                  title={s.state === 'current-unverified' ? `${s.label} — the current column, not yet confirmed by the facts` : s.state === 'current' ? `${s.label} — the current column` : s.state === 'done' ? `${s.label} — passed` : `${s.label} — not yet`}
                                  data-step={s.key}
                                  data-step-state={s.state}
                                >
                                  {s.label}
                                </li>
                              ))}
                            </ol>
                            {pnote && <span className={`kb__dim kb__progress-note${blockedBy.length ? ' kb__progress-note--blocked' : ''}`} data-progress-note>{pnote}</span>}
                          </div>
                          <div className={`kb__sec kb__check kb__check--${check.key}`} data-board-check={check.key} data-check-source={check.source} title={`${check.word}: ${check.text} — ${check.sourceLabel}${check.at ? `, ${ago(Date.now() - check.at) || '0 s'} ago` : ''}`}>
                            <span className="kb__sec-label">Board check</span>
                            <span className="kb__check-word">{check.icon} {check.word}</span>
                            <span className="kb__check-text">{check.text}</span>
                            <span className="kb__check-by">— {check.sourceLabel}{check.at ? `, ${ago(Date.now() - check.at) || '0 s'} ago` : ''}</span>
                            {check.resolvable && (
                              <button type="button" className="kb__btn kb__btn--primary kb__check-resolve" draggable={false} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); resolveHuman(n); }} title="Clear the request — you handled it (whoever raised it)" data-resolve-human>✓ Resolve</button>
                            )}
                          </div>
                          {obs && (
                            <div className={`kb__sec kb__agent kb__agent--${obs.key}${obs.attention ? ' kb__agent--attention' : ''}`} data-agent-observation={obs.key} data-observation-source={obs.source} title={`${obs.word}: ${obs.meaning}`}>
                              <span className="kb__sec-label">Agent</span>
                              <span className="kb__check-word">{obs.icon} {obs.word}</span>
                              <span className="kb__check-text">{obs.text}</span>
                              <span className="kb__check-by">— {obs.sourceLabel}{obs.at ? `, ${ago(Date.now() - obs.at) || '0 s'} ago` : ''}{obs.session ? ` · session ${obs.session}` : ''}</span>
                              <button type="button" className="kb__x kb__agent-dismiss" draggable={false} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); dismissObservation(n); }} title="Dismiss this reading (the policeman may record a fresh one on its next pass)" data-dismiss-observation>✕</button>
                            </div>
                          )}
                          {links.items.length > 0 && (
                            <details className="kb__sec kb__links" onClick={(e) => e.stopPropagation()} data-card-links>
                              <summary className="kb__links-sum">
                                <span className="kb__sec-label">Links</span>
                                <span className="kb__links-brief" data-links-brief>{links.summary}</span>
                              </summary>
                              <dl className="kb__links-list">
                                {links.items.map((it) => (
                                  <div key={it.key} className={`kb__link kb__link--${it.tone || 'plain'}`} data-link={it.key}>
                                    <dt>{it.label}</dt>
                                    <dd>
                                      {it.href ? <a href={it.href} target="_blank" rel="noreferrer">{it.value}</a> : it.value}
                                      {it.note ? <span className="kb__dim"> — {it.note}</span> : null}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </details>
                          )}
                        </>
                      );
                    })()}
                    {isOpen && (
                      <div className="kb__detail" onClick={(e) => e.stopPropagation()}>
                        {/* Description (fleet task 576ead63): read, or a multi-line editor with save/cancel. */}
                        {editNote === n.id ? (
                          <div className="kb__note-edit" data-note-editor>
                            <textarea
                              className="kb__note-input"
                              value={noteDraft}
                              autoFocus
                              rows={4}
                              placeholder="Describe the task in your own words…"
                              aria-label={`Description of card ${cardRef(n)}`}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              onKeyDown={(e) => onEditKey(e, 'textarea', () => saveNote(n), cancelNoteEdit)}
                              disabled={editBusy}
                              data-note-input
                            />
                            <div className="kb__row kb__actions">
                              <button type="button" className="kb__btn kb__btn--primary" onClick={() => saveNote(n)} disabled={editBusy} data-note-save>✓ Save description</button>
                              <button type="button" className="kb__btn" onClick={cancelNoteEdit} disabled={editBusy} data-note-cancel>✕ Cancel</button>
                              <span className="kb__dim">Ctrl+Enter saves · Esc cancels · empty clears it</span>
                            </div>
                          </div>
                        ) : (
                          <div className="kb__note-row" data-note-row>
                            {n.note ? <div className="kb__note-text" data-note-text>{n.note}</div> : <div className="kb__dim" data-note-empty>no description yet</div>}
                            <button type="button" className="kb__edit kb__edit--label" title={n.note ? 'Edit the description' : 'Add a description'} onClick={(e) => startNoteEdit(e, n)} data-edit-note>✎ {n.note ? 'edit' : 'describe'}</button>
                          </div>
                        )}
                        <div className="kb__row kb__assignees" data-assignees={assigneesOf(n).length}>
                          <span className="kb__dim">assignees</span>
                          {assigneesOf(n).map((a) => {
                            const c = colors.chip(mkOf(a), rkOf(a));
                            return (
                            <span key={keyOf(a)} className={`kb__chip kb__chip--who${c.cls}`} style={c.style} title={`${assigneeLabelOf(a)} · ${a.status}${a.branch ? ` · ⎇ ${a.branch}` : ''}${a.prUrl ? ` · PR${a.prNumber ? ' #' + a.prNumber : ''}` : ''}${a.warning ? ` · ⚠ ${a.warning}` : ''}`}>
                              <AgentStatusDot state={agentDotState(fleetAgentOf(a))} /><AgentMark mark={markOf(a)} compact /> {assigneeLabelOf(a)}{assigneesOf(n).length > 1 ? <span className="kb__who-status"> · {a.status}</span> : null}
                              <button type="button" className="kb__x" title="remove this assignee" onClick={() => changeAssignees(n, keyOf(a), 'remove')} data-remove-assignee={keyOf(a)}>×</button>
                            </span>
                          ); })}
                          <select className="kb__select" value="" onChange={(e) => changeAssignees(n, e.target.value, 'add')} data-assign>
                            <option value="">{assigneesOf(n).length ? '＋ add another assignee…' : '— nobody — pick an assignee…'}</option>
                            {agents.filter((x) => !assigneesOf(n).some((a) => keyOf(a) === x.key)).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                          </select>
                        </div>
                        {prereqs.length > 0 && (
                          <div className="kb__row kb__dim">waits on: {prereqs.map((p) => `${p.title} (${p.status})`).join(' · ')}</div>
                        )}
                        <div className="kb__row kb__actions">
                          {n.status !== 'todo' && <button type="button" className="kb__btn" onClick={() => setStatus(n, 'todo')}>◀ todo</button>}
                          {n.status !== 'doing' && <button type="button" className="kb__btn" onClick={() => setStatus(n, 'doing')}>doing</button>}
                          {n.status !== 'done' && <button type="button" className="kb__btn" title="move the card to done — the harness keeps verifying and badges the card until the merge is confirmed" onClick={() => setStatus(n, 'done')}>done ✓</button>}
                          <button type="button" className="kb__btn kb__btn--primary" disabled={!n.repoId || DELIVERED(n.status) || blocked || busy === n.id || !!n.manual} title={!n.repoId ? 'assign first' : blocked ? 'a prerequisite is not delivered' : assigneesOf(n).length > 1 ? 'send the task brief to every assignee not yet pinged, each told which repo is its own' : 'send the task brief to the assignee now'} onClick={() => dispatch(n)} data-dispatch>📣 {assigneesOf(n).length > 1 ? 'Ping assignees' : 'Ping assignee'}</button>
                          <button type="button" className={`kb__btn${n.manual ? ' kb__btn--primary' : ''}`} onClick={() => setManual(n, !n.manual)} title={n.manual ? 'Hand the card back to the harness: the policeman and the arch resume' : 'You drive this repo agent directly on its machine; the policeman and the arch ignore the card'} data-manual-action>{n.manual ? '↩ Back to auto' : '✋ Go manual'}</button>
                          {!n.needsHuman && <button type="button" className="kb__btn" onClick={() => requestHuman(n)} title="Flag this card: a human needs to step in" data-request-human>🆘 Needs human</button>}
                          {deleteControl(n, 'detail')}
                        </div>
                        {(n.headCommit || n.mergeCommit) && (
                          <div className="kb__row kb__dim kb__mono" data-linkage>
                            {n.headCommit ? `head ${n.headCommit.slice(0, 8)}` : ''}{n.mergeCommit ? `${n.headCommit ? ' · ' : ''}merged ${n.mergeCommit.slice(0, 8)}` : ''}
                          </div>
                        )}
                        {note[n.id] && <div className="kb__row kb__dim" data-dispatch-note>{note[n.id]}</div>}
                        <div className="kb__row kb__dim kb__mono">
                          id {n.id}
                          <button type="button" className={`kb__copy${copiedId === n.id ? ' kb__copy--done' : ''}`} title="Copy a reference to this card (task <id>)" onClick={(e) => copyRef(e, n)} data-copy-ref-detail>{copiedId === n.id ? '✓ copied' : '⧉ copy'}</button>
                          {n.assignedBy ? ` · assigned by ${n.assignedBy}` : ''}{n.assignedAt ? ` ${ago(Date.now() - n.assignedAt)} ago` : ''}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {/* Right-edge drag handle: horizontal resize of this column (fleet task 0a57d282). */}
            <div
              className={`kb__resizer${resizing === c.key ? ' kb__resizer--active' : ''}`}
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize the ${c.label} column`}
              title="Drag to resize this column"
              onPointerDown={startResize(c.key)}
              onClick={(e) => e.stopPropagation()}
              data-column-resizer={c.key}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
