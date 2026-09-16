# One-shot client patch for openspec cross-repo-effort-legs (board task 68d33734).
def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: anchor not unique/found ({s.count(old)}):\n{old[:200]}"
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

TG = 'client/src/components/taskgraph/'

# ---- cardSections.js: legsOf + the mismatch as the Board check's text -------------------
edit(TG + 'cardSections.js', [
("""//   Links       — branch · PR · verified state · pings · deps, collapsed by default
//                                                                  linksOf()""",
"""//   Legs        — a cross-repo EFFORT (openspec cross-repo-effort-legs): every typed leg
//                 (driver / driven, agentless checkouts) with its own PR + verified merge,
//                 "N of M legs merged", PARTIALLY merged named — never done off one leg
//                                                                  legsOf()
//   Links       — branch · PR · verified state · pings · deps, collapsed by default
//                                                                  linksOf()"""),
("""  const unverified = !!node.warning || integrity?.state === 'dishonest' || isUnverified(node.status, node.verifiedStatus);
  if (unverified) {
    return {
      key: 'unverified', icon: '⚠️', word: 'Not verified yet',
      text: plainUnverifiedReason(node),""",
"""  // A cross-repo effort whose column claims merged while a leg is not (openspec
  // cross-repo-effort-legs): the reason names every leg — the Knjiga-pošte rule.
  const mismatch = legsOf(node).mismatch;
  const unverified = !!mismatch || !!node.warning || integrity?.state === 'dishonest' || isUnverified(node.status, node.verifiedStatus);
  if (unverified) {
    return {
      key: 'unverified', icon: '⚠️', word: 'Not verified yet',
      text: mismatch || plainUnverifiedReason(node),"""),
("""// ---- Links -------------------------------------------------------------------------------
""",
"""// ---- Legs (a cross-repo effort, openspec cross-repo-effort-legs) ------------------------------

/** role → [icon, word, meaning] — the same words the server's Effort carries. */
export const ROLES = {
  driver: ['🚗', 'driver', 'the orchestrator that drives the other legs'],
  driven: ['🔩', 'driven', 'a product repo the driver drives'],
};

/** An AGENTLESS leg: a checkout no managed agent owns (its repoId is the synthetic path:<path>). */
export function isAgentlessLeg(a) {
  return !!(a?.path || String(a?.repoId || '').startsWith('path:'));
}
export function legPath(a) {
  if (!a) return null;
  if (a.path) return String(a.path);
  const r = String(a.repoId || '');
  return r.startsWith('path:') ? r.slice(5) : null;
}
/** The last two path segments: copy1/prg. */
export function pathTail(p) {
  const parts = String(p || '').split(/[\\\\/]+/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/') : (parts[0] || String(p || ''));
}
/** Verified merged on GitHub (the verifier recorded pr-merged or done). */
export function legMerged(a) {
  return rank(a?.verifiedStatus) >= rank('pr-merged');
}
/** One leg's merge state in words — the same as the server's Effort.MergeWord. */
export function legMergeWord(a) {
  if (legMerged(a)) return a.prNumber ? `merged (PR #${a.prNumber})` : 'merged';
  if (a?.prNumber) return `PR #${a.prNumber} ${rank(a.verifiedStatus) >= rank('pr-opened') ? 'open, not merged' : 'not verified'}`;
  if (a?.prUrl) return 'PR recorded, not verified';
  return a?.branch ? 'no PR' : 'no PR recorded';
}

const legsListOf = (node) => {
  if (!node) return [];
  if (Array.isArray(node.assignees) && node.assignees.length > 0) return node.assignees.map((a) => ({ ...a, sourceId: a.sourceId || null, status: a.status || 'todo' }));
  return node.repoId ? [{ sourceId: node.sourceId || null, repoId: node.repoId, status: node.status || 'todo', branch: node.branch, prUrl: node.prUrl, prNumber: node.prNumber, verifiedStatus: node.verifiedStatus, role: null, path: null }] : [];
};

/** The Legs section. `label(a)` names an agent leg (its handle) — an agentless leg is named by
 * its path tail. Returns { show, crossRepo, legs, merged, total, allMerged, partiallyMerged,
 * summary, mismatch, title }: `show` when the card is an effort (several legs, or any leg typed
 * or agentless); `mismatch` = the plain-English reason when the column claims merged while a leg
 * is not — which is exactly the rule that would have caught the Knjiga-pošte card. */
export function legsOf(node, { label = null } = {}) {
  const list = legsListOf(node);
  const legs = list.map((a) => {
    const agentless = isAgentlessLeg(a);
    const path = legPath(a);
    const [roleIcon, roleWord, roleMeaning] = ROLES[a.role] || ['·', 'untyped', 'no role recorded'];
    const name = agentless ? pathTail(path) : (label ? label(a) : String(a.repoId || ''));
    return {
      key: `${a.sourceId || ''}|${a.repoId}`, label: name, role: a.role || null, roleIcon, roleWord, roleMeaning, agentless, path,
      status: a.status || 'todo', statusLabel: LABEL[a.status] || a.status || 'To do', verifiedStatus: a.verifiedStatus || null,
      merged: legMerged(a), mergeWord: legMergeWord(a), prUrl: a.prUrl || null, prNumber: a.prNumber || null, branch: a.branch || null, warning: a.warning || null,
    };
  });
  const total = legs.length;
  const merged = legs.filter((l) => l.merged).length;
  const crossRepo = total > 1;
  const allMerged = total > 0 && merged === total;
  const partiallyMerged = crossRepo && merged > 0 && !allMerged;
  const show = crossRepo || legs.some((l) => l.role || l.agentless);
  let mismatch = null;
  if (crossRepo && !allMerged && rank(node?.status) >= rank('pr-merged')) {
    const done = legs.filter((l) => l.merged).map((l) => `${l.label} ${l.mergeWord}`);
    const open = legs.filter((l) => !l.merged).map((l) => `${l.label} — ${l.mergeWord}`);
    mismatch = `cross-repo effort: ${merged} of ${total} legs merged on GitHub (${done.length ? done.join(', ') : 'none'}); not merged: ${open.join('; ')} — the card is not ${node.status === 'done' ? 'done' : 'merged'} until every leg is merged`;
  }
  const summary = total === 0 ? 'no legs' : `${merged} of ${total} leg${total === 1 ? '' : 's'} merged${partiallyMerged ? ' — partially merged, not done' : allMerged ? ' — every leg merged' : ''}`;
  const title = show ? `A cross-repo effort: ${legs.map((l) => `${l.label} (${l.roleWord}${l.agentless ? ', no agent' : ''}: ${l.mergeWord})`).join('; ')}. The card is done only when EVERY leg's PR is verified merged on GitHub.` : '';
  return { show, crossRepo, legs, merged, total, allMerged, partiallyMerged, summary, mismatch, title };
}

// ---- Links -------------------------------------------------------------------------------
"""),
])

# ---- taskFilters.js: the partially-merged flag ---------------------------------------------
edit(TG + 'taskFilters.js', [
("""  ['external', 'external owner', 'owned by another human developer — out of our domain; the verifier, the policeman and the arch leave it alone'],
];""",
"""  ['external', 'external owner', 'owned by another human developer — out of our domain; the verifier, the policeman and the arch leave it alone'],
  // openspec cross-repo-effort-legs: a cross-repo effort with some legs merged and some not.
  ['partial-merge', 'partially merged', 'a cross-repo effort with some legs merged on GitHub and some not — it is NOT done until every leg is merged'],
];"""),
("""export function flagsOf(id, blocked, stale, needsHuman = null, manual = null, external = null) {
  const f = [];
  if (blocked?.has(id)) f.push('blocked');
  if (stale?.has(id)) f.push('stale');
  if (needsHuman?.has(id)) f.push('needs-human');
  if (manual?.has(id)) f.push('manual');
  if (external?.has(id)) f.push('external');
  return f;
}""",
"""export function flagsOf(id, blocked, stale, needsHuman = null, manual = null, external = null, partial = null) {
  const f = [];
  if (blocked?.has(id)) f.push('blocked');
  if (stale?.has(id)) f.push('stale');
  if (needsHuman?.has(id)) f.push('needs-human');
  if (manual?.has(id)) f.push('manual');
  if (external?.has(id)) f.push('external');
  if (partial?.has(id)) f.push('partial-merge');
  return f;
}"""),
])

# ---- KanbanBoard.jsx: the Legs section, agentless labels, the leg editor, the flag ---------
edit(TG + 'KanbanBoard.jsx', [
("import { progressOf, progressNote, boardCheckOf, linksOf, observationOf, ownerOf } from './cardSections';",
 "import { progressOf, progressNote, boardCheckOf, linksOf, observationOf, ownerOf, legsOf, isAgentlessLeg, legPath, pathTail } from './cardSections';"),
("""  const externalSet = useMemo(() => new Set(nodes.filter((n) => n.externalOwner).map((n) => n.id)), [nodes]);
  const views = useMemo(() => nodes.map((n) => taskView(n, filterCtx, flagsOf(n.id, blockedSet, staleSet, needsHumanSet, manualSet, externalSet))), [nodes, filterCtx, blockedSet, staleSet, needsHumanSet, manualSet, externalSet]);""",
"""  const externalSet = useMemo(() => new Set(nodes.filter((n) => n.externalOwner).map((n) => n.id)), [nodes]);
  // openspec cross-repo-effort-legs: a partially merged effort is a flag of its own.
  const partialSet = useMemo(() => new Set(nodes.filter((n) => legsOf(n).partiallyMerged).map((n) => n.id)), [nodes]);
  const views = useMemo(() => nodes.map((n) => taskView(n, filterCtx, flagsOf(n.id, blockedSet, staleSet, needsHumanSet, manualSet, externalSet, partialSet))), [nodes, filterCtx, blockedSet, staleSet, needsHumanSet, manualSet, externalSet, partialSet]);"""),
("""  const workerHrefOf = (a) => agentWorkerHref(machineBySource[a.sourceId || ''], workerRoot, a.repoId);""",
 """  const workerHrefOf = (a) => (isAgentlessLeg(a) ? null : agentWorkerHref(machineBySource[a.sourceId || ''], workerRoot, a.repoId));"""),
("""  const assigneeLabelOf = (a) => {
    const known = agents.find((x) => x.key === keyOf(a));
    if (known) return known.handle || `${known.machine}/${known.name}`;""",
"""  const assigneeLabelOf = (a) => {
    // An agentless leg (openspec cross-repo-effort-legs) is its checkout, never an agent.
    if (isAgentlessLeg(a)) return `${pathTail(legPath(a))} (no agent)`;
    const known = agents.find((x) => x.key === keyOf(a));
    if (known) return known.handle || `${known.machine}/${known.name}`;"""),
("""      setOwnerDraft((s) => ({ ...s, [n.id]: '' }));
      await load();
    } catch (e) { setError(e?.message || String(e)); }
  };
""",
"""      setOwnerDraft((s) => ({ ...s, [n.id]: '' }));
      await load();
    } catch (e) { setError(e?.message || String(e)); }
  };
  // Typed legs of a cross-repo effort (openspec cross-repo-effort-legs): add a leg — a repo
  // agent, or an AGENTLESS checkout by path — with its role, branch and PR (POST …/legs); type
  // an existing leg (POST …/legs/role). Removal is the assignee row's × (the same set).
  const [legDraft, setLegDraft] = useState({});
  const legField = (n, k, v) => setLegDraft((s) => ({ ...s, [n.id]: { ...(s[n.id] || {}), [k]: v } }));
  const addLeg = async (n) => {
    const d = legDraft[n.id] || {};
    const [sourceId, repoId] = d.agent ? d.agent.split('|') : ['', ''];
    const path = (d.path || '').trim();
    if (!repoId && !path) return;
    try {
      await apiPost(`/taskgraph/nodes/${n.id}/legs`, { sourceId: sourceId || null, repoId: repoId || null, path: path || null, role: d.role || null, branch: (d.branch || '').trim() || null, prUrl: (d.pr || '').trim() || null, by: 'human' });
      setLegDraft((s) => ({ ...s, [n.id]: {} }));
      await load();
    } catch (e) { setError(e?.message || String(e)); }
  };
  const setLegRole = async (n, key, role) => {
    try { await apiPost(`/taskgraph/nodes/${n.id}/legs/role`, { key, role: role || null }); await load(); }
    catch (e) { setError(e?.message || String(e)); }
  };
"""),
("""                      const owner = ownerOf(n);
                      return (""",
"""                      const owner = ownerOf(n);
                      const legs = legsOf(n, { label: assigneeLabelOf });
                      return ("""),
("""                            {pnote && <span className={`kb__dim kb__progress-note${blockedBy.length ? ' kb__progress-note--blocked' : ''}`} data-progress-note>{pnote}</span>}
                          </div>""",
"""                            {pnote && <span className={`kb__dim kb__progress-note${blockedBy.length ? ' kb__progress-note--blocked' : ''}`} data-progress-note>{pnote}</span>}
                          </div>
                          {/* Legs (openspec cross-repo-effort-legs): every typed leg with its own
                              PR + verified merge; "N of M merged"; partially merged is named. */}
                          {legs.show && (
                            <div className={`kb__sec kb__legs${legs.partiallyMerged ? ' kb__legs--partial' : legs.allMerged ? ' kb__legs--all' : ''}`} data-card-legs={legs.total} data-legs-merged={legs.merged} data-legs-partial={legs.partiallyMerged ? 'true' : undefined} title={legs.title}>
                              <div className="kb__legs-head">
                                <span className="kb__sec-label">Legs</span>
                                <span className="kb__legs-brief" data-legs-brief>{legs.partiallyMerged ? '⛓ ' : ''}{legs.summary}</span>
                              </div>
                              {legs.legs.map((l) => (
                                <div key={l.key} className={`kb__leg kb__leg--${l.merged ? 'merged' : l.prNumber || l.prUrl ? 'open' : 'none'}`} data-leg={l.key} data-leg-role={l.role || 'untyped'} data-leg-merged={l.merged ? 'true' : 'false'} data-leg-agentless={l.agentless ? 'true' : undefined} title={`${l.roleWord}: ${l.roleMeaning}${l.agentless ? ` · no agent — the checkout ${l.path}` : ''}${l.branch ? ` · ⎇ ${l.branch}` : ''}`}>
                                  <span className={`kb__leg-role kb__leg-role--${l.role || 'untyped'}`}>{l.roleIcon} {l.roleWord}</span>
                                  <span className="kb__leg-name">{l.label}</span>
                                  {l.agentless && <span className="kb__leg-agentless" title={l.path}>no agent</span>}
                                  <span className="kb__dim">{l.statusLabel}</span>
                                  <span className="kb__leg-merge">{l.prUrl ? <a href={l.prUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{l.mergeWord}</a> : l.mergeWord}</span>
                                </div>
                              ))}
                            </div>
                          )}"""),
("""                              <button type="button" className="kb__x" title="remove this assignee" onClick={() => changeAssignees(n, keyOf(a), 'remove')} data-remove-assignee={keyOf(a)}>×</button>""",
"""                              <select className="kb__select kb__leg-role-select" value={a.role || ''} onChange={(e) => setLegRole(n, keyOf(a), e.target.value)} onClick={(e) => e.stopPropagation()} title="this leg's role in the effort: driver (the orchestrator) or driven (a product repo it drives)" data-leg-role-select={keyOf(a)}>
                                <option value="">untyped</option>
                                <option value="driver">driver</option>
                                <option value="driven">driven</option>
                              </select>
                              <button type="button" className="kb__x" title="remove this assignee" onClick={() => changeAssignees(n, keyOf(a), 'remove')} data-remove-assignee={keyOf(a)}>×</button>"""),
("""                            {agents.filter((x) => !assigneesOf(n).some((a) => keyOf(a) === x.key)).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                          </select>
                        </div>""",
"""                            {agents.filter((x) => !assigneesOf(n).some((a) => keyOf(a) === x.key)).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                          </select>
                        </div>
                        {/* Add a typed LEG (openspec cross-repo-effort-legs): a repo agent or an
                            agentless checkout by path, with role, branch and PR. */}
                        <div className="kb__row kb__leg-edit" data-leg-editor>
                          <span className="kb__dim" title="A cross-repo effort: the driver (orchestrator) drives the driven legs (product repos); a leg with no managed agent is named by its checkout path. The card is done only when every leg's PR is merged.">add leg</span>
                          <select className="kb__select kb__leg-role-select" value={legDraft[n.id]?.role || ''} onChange={(e) => legField(n, 'role', e.target.value)} data-leg-role-input>
                            <option value="">untyped</option>
                            <option value="driver">driver</option>
                            <option value="driven">driven</option>
                          </select>
                          <select className="kb__select" value={legDraft[n.id]?.agent || ''} onChange={(e) => legField(n, 'agent', e.target.value)} data-leg-agent-input>
                            <option value="">— a repo agent, or type a path —</option>
                            {agents.filter((x) => !assigneesOf(n).some((a) => keyOf(a) === x.key)).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                          </select>
                          <input className="kb__leg-input" placeholder="agentless checkout path (C:\\\\prgcopies\\\\copy1\\\\prg)" value={legDraft[n.id]?.path || ''} draggable={false} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => legField(n, 'path', e.target.value)} data-leg-path-input />
                          <input className="kb__leg-input kb__leg-input--short" placeholder="branch" value={legDraft[n.id]?.branch || ''} draggable={false} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => legField(n, 'branch', e.target.value)} data-leg-branch-input />
                          <input className="kb__leg-input" placeholder="PR URL" value={legDraft[n.id]?.pr || ''} draggable={false} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => legField(n, 'pr', e.target.value)} data-leg-pr-input />
                          <button type="button" className="kb__btn" disabled={!(legDraft[n.id]?.agent || (legDraft[n.id]?.path || '').trim())} onClick={() => addLeg(n)} title="Add this leg to the effort" data-leg-add>＋ Add leg</button>
                        </div>"""),
])

# ---- kanban.css ------------------------------------------------------------------------------
edit(TG + 'kanban.css', [
("""/* Rename / describe a card""",
"""/* Legs of a cross-repo effort (openspec cross-repo-effort-legs): one row per typed leg with
   its role, name, "no agent" for a checkout, status and merge state; the brief says "N of M
   legs merged"; a PARTIALLY merged effort is amber — visibly not done. */
.kb__legs { flex-direction: column; align-items: stretch; border-radius: 8px; padding: 4px 6px; border: 1px solid var(--color-border, #444); gap: 2px; }
.kb__legs-head { display: flex; align-items: center; gap: 6px; }
.kb__legs-brief { color: var(--color-text-muted, #9aa); font-size: 11px; }
.kb__legs--partial { border-color: #d29922; background: rgba(210, 153, 34, 0.08); }
.kb__legs--partial .kb__legs-brief { color: #d29922; font-weight: 700; }
.kb__legs--all { border-color: rgba(63, 185, 80, 0.5); }
.kb__legs--all .kb__legs-brief { color: #3fb950; }
.kb__leg { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11.5px; padding-left: 68px; }
.kb__leg-role { font-weight: 700; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.04em; border: 1px solid var(--color-border, #444); border-radius: 999px; padding: 0 6px; white-space: nowrap; }
.kb__leg-role--driver { color: #5ea0ef; border-color: #5ea0ef; }
.kb__leg-role--driven { color: var(--color-text, #eee); }
.kb__leg-role--untyped { color: var(--color-text-muted, #9aa); }
.kb__leg-name { font-weight: 600; }
.kb__leg-agentless { color: var(--color-text-muted, #9aa); font-style: italic; }
.kb__leg--merged .kb__leg-merge, .kb__leg--merged .kb__leg-merge a { color: #3fb950; }
.kb__leg--open .kb__leg-merge, .kb__leg--open .kb__leg-merge a { color: #d29922; }
.kb__leg-merge a { text-decoration: none; }
.kb__leg-edit { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.kb__leg-input { flex: 1 1 200px; min-width: 140px; font: inherit; font-size: 12px; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--color-border, #444); background: transparent; color: inherit; }
.kb__leg-input--short { flex: 0 1 120px; min-width: 90px; }
.kb__leg-role-select { font-size: 11px; padding: 1px 4px; }

/* Rename / describe a card"""),
])

# ---- package.json: the new test -----------------------------------------------------------
edit('client/package.json', [
("src/components/taskgraph/cardSections.owner.test.mjs\"",
 "src/components/taskgraph/cardSections.owner.test.mjs src/components/taskgraph/cardSections.legs.test.mjs\""),
])
print('all client patches applied')
