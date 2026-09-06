import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import TaskFilterBar from './TaskFilterBar';
import { useTaskFilter } from './taskFilterStore';
import { COLUMNS, columnOf } from './kanbanColumns';
import { applyFilter, blockedIds, filterContext, flagsOf, isNarrowed, staleIds, taskView } from './taskFilters';
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
  const [, setTick] = useState(0);

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
  const views = useMemo(() => nodes.map((n) => taskView(n, filterCtx, flagsOf(n.id, blockedSet, staleSet))), [nodes, filterCtx, blockedSet, staleSet]);
  const shownIds = useMemo(() => applyFilter(views, filter), [views, filter]);
  const narrowed = isNarrowed(filter);

  // Assignee choices: every repo agent the fleet status knows, keyed "sourceId|repoId".
  const agents = [];
  const machineLabel = {};
  for (const m of fleet?.machines || []) {
    machineLabel[m.self ? '' : m.sourceId] = m.machine;
    // The handle ("spacex/prg#2", openspec stable-handles) is the label everywhere.
    for (const a of m.agents || []) agents.push({ key: `${m.self ? '' : m.sourceId}|${a.repoId}`, label: `${a.handle || `${m.machine}/${a.name}`}${a.managed ? ' 🏛' : ''}`, machine: m.machine, name: a.name, handle: a.handle, managed: a.managed });
  }
  const assigneeLabel = (n) => {
    if (!n.repoId) return null;
    const a = agents.find((x) => x.key === `${n.sourceId || ''}|${n.repoId}`);
    if (a) return a.handle || `${a.machine}/${a.name}`;
    return `${n.repoId.slice(0, 8)}… @ ${machineLabel[n.sourceId || ''] || (n.sourceId ? n.sourceId.slice(0, 8) : 'this machine')}`;
  };

  const patch = async (id, body) => {
    try { await apiPatch(`/taskgraph/nodes/${id}`, body); await load(); } catch (e) { setError(e?.message || String(e)); }
  };
  const setStatus = (n, status) => patch(n.id, { status });
  const assign = async (n, key) => {
    const [sourceId, repoId] = key ? key.split('|') : ['', ''];
    try { await apiPost(`/taskgraph/nodes/${n.id}/assign`, { sourceId: sourceId || null, repoId: repoId || '', by: 'human' }); await load(); } catch (e) { setError(e?.message || String(e)); }
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
  const remove = async (n) => {
    try { await apiDelete(`/taskgraph/nodes/${n.id}`); setOpen(null); await load(); } catch (e) { setError(e?.message || String(e)); }
  };
  const add = async (e) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    try { await apiPost('/taskgraph/nodes', { title, createdBy: 'human' }); setDraft(''); await load(); } catch (err) { setError(err?.message || String(err)); }
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

  return (
    <div className="kb" data-kanban>
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
      {!board && !error && <div className="kb__note" data-loading>Loading the board…</div>}
      {error && <div className="kb__note kb__note--err">{error}</div>}
      <div className="kb__cols">
        {columns.map((c) => (
          <section
            key={c.key}
            className={`kb__col kb__col--${c.key}${dragOver === c.key ? ' kb__col--over' : ''}`}
            data-column={c.key}
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
                    className={`kb__card${blocked ? ' kb__card--blocked' : ''}${isOpen ? ' kb__card--open' : ''}`}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/task-id', n.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => setOpen(isOpen ? null : n.id)}
                    data-task={n.id}
                    data-column={c.key}
                  >
                    <div className="kb__title">{n.title}</div>
                    <div className="kb__meta">
                      {n.repoId && <span className="kb__chip kb__chip--who" title="assignee">👤 {assigneeLabel(n)}</span>}
                      {blocked && <span className="kb__chip kb__chip--blocked" title={`waits on ${prereqs.filter((p) => p.status !== 'done').map((p) => p.title).join(', ')}`}>⛔ blocked</span>}
                      {!blocked && prereqs.length > 0 && <span className="kb__chip" title="prerequisites done">✓ {prereqs.length} prereq</span>}
                      {n.dispatchedAt && <span className="kb__chip kb__chip--pinged" title={`pinged ${n.dispatchCount}×`}>📣 {ago(Date.now() - n.dispatchedAt)} ago{n.dispatchCount > 1 ? ` ×${n.dispatchCount}` : ''}</span>}
                      {c.key === 'todo' && n.repoId && !n.dispatchedAt && !blocked && n.assignedAt && <span className="kb__chip kb__chip--await" title="assigned but not yet pinged — the arch dispatches it on its next wake">⏳ awaiting ping</span>}
                      {c.key === 'todo' && n.repoId && !n.assignedAt && <span className="kb__chip" title="the repo label came from the graph before the board existed; re-assign (or Ping) to make it a real assignment">📎 label only</span>}
                      {n.branch && <span className={`kb__chip kb__chip--branch${n.pushed === false ? ' kb__chip--unpushed' : ''}`} title={n.pushed === false ? `branch ${n.branch} is NOT on origin — it lives only on the machine that did the work` : `branch ${n.branch}`}>⎇ {n.branch}{n.pushed === false ? ' ⚠ not on origin' : ''}</span>}
                      {n.prUrl && <span className="kb__chip kb__chip--pr" title={n.mergeCommit ? `merged as ${n.mergeCommit.slice(0, 8)}` : 'pull request'}><a href={n.prUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>PR{n.prNumber ? ` #${n.prNumber}` : ''}</a></span>}
                      {isStale(n) && <span className="kb__chip kb__chip--stale" title={`no activity for ${ago(Date.now() - (n.updatedAt || 0))} — ${n.status === 'committed' ? 'unpushed branch parked on one machine' : 'PR open, nobody moving it'}`}>⏱ stale</span>}
                      {n.warning && <span className="kb__chip kb__chip--warn" title={n.warning}>⚠</span>}
                      {n.createdBy && n.createdBy !== 'human' && <span className="kb__chip" title="created by">🏛 {n.createdBy}</span>}
                      {n.ideaId && <span className="kb__chip" title="promoted from an idea" data-idea-ref>💡{ideaNumbers[n.ideaId] ? ` #${ideaNumbers[n.ideaId]}` : ''}</span>}
                    </div>
                    {isOpen && (
                      <div className="kb__detail" onClick={(e) => e.stopPropagation()}>
                        {n.note && <div className="kb__note-text">{n.note}</div>}
                        <label className="kb__row">
                          assignee
                          <select className="kb__select" value={n.repoId ? `${n.sourceId || ''}|${n.repoId}` : ''} onChange={(e) => assign(n, e.target.value)} data-assign>
                            <option value="">— nobody —</option>
                            {agents.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                            {n.repoId && !agents.some((a) => a.key === `${n.sourceId || ''}|${n.repoId}`) && <option value={`${n.sourceId || ''}|${n.repoId}`}>{assigneeLabel(n)}</option>}
                          </select>
                        </label>
                        {prereqs.length > 0 && (
                          <div className="kb__row kb__dim">waits on: {prereqs.map((p) => `${p.title} (${p.status})`).join(' · ')}</div>
                        )}
                        <div className="kb__row kb__actions">
                          {n.status !== 'todo' && <button type="button" className="kb__btn" onClick={() => setStatus(n, 'todo')}>◀ todo</button>}
                          {n.status !== 'doing' && <button type="button" className="kb__btn" onClick={() => setStatus(n, 'doing')}>doing</button>}
                          {n.status !== 'done' && <button type="button" className="kb__btn" title="operator override — from committed up the harness normally moves the card itself from git/PR facts" onClick={() => setStatus(n, 'done')}>done ✓</button>}
                          <button type="button" className="kb__btn kb__btn--primary" disabled={!n.repoId || DELIVERED(n.status) || blocked || busy === n.id} title={!n.repoId ? 'assign first' : blocked ? 'a prerequisite is not delivered' : 'send the task brief to the assignee now'} onClick={() => dispatch(n)} data-dispatch>📣 Ping assignee</button>
                          <button type="button" className="kb__btn kb__btn--danger" onClick={() => remove(n)} title="delete the task">✕</button>
                        </div>
                        {(n.branch || n.headCommit || n.mergeCommit) && (
                          <div className="kb__row kb__dim kb__mono" data-linkage>
                            {n.branch ? `⎇ ${n.branch}` : ''}{n.headCommit ? ` @ ${n.headCommit.slice(0, 8)}` : ''}{n.pushed != null ? (n.pushed ? ' · on origin' : ' · NOT on origin') : ''}{n.mergeCommit ? ` · merged ${n.mergeCommit.slice(0, 8)}` : ''}{n.verifiedStatus ? ` · verified: ${n.verifiedStatus}` : ''}
                          </div>
                        )}
                        {n.warning && <div className="kb__row kb__warn" data-warning>⚠ {n.warning}</div>}
                        {note[n.id] && <div className="kb__row kb__dim" data-dispatch-note>{note[n.id]}</div>}
                        <div className="kb__row kb__dim kb__mono">id {n.id}{n.assignedBy ? ` · assigned by ${n.assignedBy}` : ''}{n.assignedAt ? ` ${ago(Date.now() - n.assignedAt)} ago` : ''}</div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
