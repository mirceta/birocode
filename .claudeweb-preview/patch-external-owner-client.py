# One-shot client patch for openspec kanban-external-owner (board task 34707224).
# Exact-string replacements, every anchor asserted unique so drift fails loudly.
import shutil

def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: anchor not unique/found:\n{old[:160]}"
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

TG = 'client/src/components/taskgraph/'

# ---- cardSections.js: the Owner section + the external Board check ------------------------
edit(TG + 'cardSections.js', [
("""//   Board check — ONE plain-English status that always names WHO set it and WHEN:
//                 ✅ Honest · ⚠️ Not verified yet · 🆘 Needs human · 🔧 Manual
//                                                                  boardCheckOf()""",
"""//   Board check — ONE plain-English status that always names WHO set it and WHEN:
//                 ✅ Honest · ⚠️ Not verified yet · 🆘 Needs human · 🔧 Manual · 👤 External owner
//                                                                  boardCheckOf()
//   Owner       — only when a DIFFERENT human developer owns the card (openspec
//                 kanban-external-owner): who, since when, and that it is out of our domain
//                                                                  ownerOf()"""),
("""/** ONE status for the Board check section. key ∈ manual | needs-human | unverified | honest.""",
"""/** The Owner section (openspec kanban-external-owner): null while the card is ours; else who
 * owns it, since when, set by the Operator. External wins over manual: another person's card
 * is theirs whatever else it says. */
export function ownerOf(node) {
  const name = node?.externalOwner ? String(node.externalOwner).trim() : '';
  if (!name) return null;
  return {
    key: 'external', icon: '👤', name, word: `${name} (external)`,
    text: 'out of our domain — the verifier, the policeman and the arch leave this card alone',
    source: 'operator', sourceLabel: sourceLabel('operator'), at: node.externalOwnerAt || null,
  };
}

/** ONE status for the Board check section. key ∈ external | manual | needs-human | unverified | honest."""),
("""  if (!node) return null;
  if (node.manual) {
    return {
      key: 'manual', icon: '🔧', word: 'Manual',""",
"""  if (!node) return null;
  const owner = ownerOf(node);
  if (owner) {
    return {
      key: 'external', icon: '👤', word: 'External owner',
      text: `${owner.name} owns this card — not ours to judge; nothing automatic touches it`,
      source: 'operator', sourceLabel: sourceLabel('operator'), at: owner.at, resolvable: false,
    };
  }
  if (node.manual) {
    return {
      key: 'manual', icon: '🔧', word: 'Manual',"""),
])

# ---- taskFilters.js: the `external` flag ----------------------------------------------------
edit(TG + 'taskFilters.js', [
("""  ['manual', 'manual', 'handled by the Operator directly; the policeman and the arch ignore it'],
];""",
"""  ['manual', 'manual', 'handled by the Operator directly; the policeman and the arch ignore it'],
  // openspec kanban-external-owner: a different human developer's card — out of our domain.
  ['external', 'external owner', 'owned by another human developer — out of our domain; the verifier, the policeman and the arch leave it alone'],
];"""),
("""export function flagsOf(id, blocked, stale, needsHuman = null, manual = null) {
  const f = [];
  if (blocked?.has(id)) f.push('blocked');
  if (stale?.has(id)) f.push('stale');
  if (needsHuman?.has(id)) f.push('needs-human');
  if (manual?.has(id)) f.push('manual');
  return f;
}""",
"""export function flagsOf(id, blocked, stale, needsHuman = null, manual = null, external = null) {
  const f = [];
  if (blocked?.has(id)) f.push('blocked');
  if (stale?.has(id)) f.push('stale');
  if (needsHuman?.has(id)) f.push('needs-human');
  if (manual?.has(id)) f.push('manual');
  if (external?.has(id)) f.push('external');
  return f;
}"""),
])

# ---- KanbanBoard.jsx: the Owner section, the control, the flag, the policeman line ---------
edit(TG + 'KanbanBoard.jsx', [
("import { progressOf, progressNote, boardCheckOf, linksOf, observationOf } from './cardSections';",
 "import { progressOf, progressNote, boardCheckOf, linksOf, observationOf, ownerOf } from './cardSections';"),
("""  const manualSet = useMemo(() => new Set(nodes.filter((n) => n.manual).map((n) => n.id)), [nodes]);
  const views = useMemo(() => nodes.map((n) => taskView(n, filterCtx, flagsOf(n.id, blockedSet, staleSet, needsHumanSet, manualSet))), [nodes, filterCtx, blockedSet, staleSet, needsHumanSet, manualSet]);""",
"""  const manualSet = useMemo(() => new Set(nodes.filter((n) => n.manual).map((n) => n.id)), [nodes]);
  // openspec kanban-external-owner: another human developer's cards are filterable too.
  const externalSet = useMemo(() => new Set(nodes.filter((n) => n.externalOwner).map((n) => n.id)), [nodes]);
  const views = useMemo(() => nodes.map((n) => taskView(n, filterCtx, flagsOf(n.id, blockedSet, staleSet, needsHumanSet, manualSet, externalSet))), [nodes, filterCtx, blockedSet, staleSet, needsHumanSet, manualSet, externalSet]);"""),
("""  const setManual = (n, manual) => patch(n.id, { manual });
""",
"""  const setManual = (n, manual) => patch(n.id, { manual });
  // External owner (openspec kanban-external-owner): hand the card to a DIFFERENT human
  // developer (POST …/owner {name}) or take it back (DELETE …/owner). While set it is out of
  // our domain — the verifier, the policeman and the arch leave it entirely alone.
  const [ownerDraft, setOwnerDraft] = useState({});
  const setOwner = async (n, name) => {
    try {
      if (name) await apiPost(`/taskgraph/nodes/${n.id}/owner`, { name });
      else await apiDelete(`/taskgraph/nodes/${n.id}/owner`);
      setOwnerDraft((s) => ({ ...s, [n.id]: '' }));
      await load();
    } catch (e) { setError(e?.message || String(e)); }
  };
"""),
("""            ? `board check ${ago(Date.now() - integrity.checkedAt) || '0 s'} ago · ${integrity.honest} honest · ${integrity.dishonest} not verified yet · ${integrity.stuck} need human · ${integrity.manual} manual`""",
 """            ? `board check ${ago(Date.now() - integrity.checkedAt) || '0 s'} ago · ${integrity.honest} honest · ${integrity.dishonest} not verified yet · ${integrity.stuck} need human · ${integrity.manual} manual · ${integrity.external || 0} external`"""),
("""${n.manual ? ' kb__card--manual' : ''}${n.needsHuman ? ' kb__card--human' : ''}""",
 """${n.manual ? ' kb__card--manual' : ''}${n.externalOwner ? ' kb__card--external' : ''}${n.needsHuman ? ' kb__card--human' : ''}"""),
("""                      const obs = observationOf(n);
                      return (""",
"""                      const obs = observationOf(n);
                      const owner = ownerOf(n);
                      return ("""),
("""                          {obs && (
                            <div className={`kb__sec kb__agent kb__agent--${obs.key}""",
"""                          {/* Owner (openspec kanban-external-owner): only when another human
                              developer owns the card — who, since when, and a way back. */}
                          {owner && (
                            <div className="kb__sec kb__owner" data-card-owner={owner.name} title={`External owner: ${owner.name} — ${owner.text}`}>
                              <span className="kb__sec-label">Owner</span>
                              <span className="kb__check-word">{owner.icon} {owner.word}</span>
                              <span className="kb__check-text">{owner.text}</span>
                              <span className="kb__check-by">— set by {owner.sourceLabel}{owner.at ? `, ${ago(Date.now() - owner.at) || '0 s'} ago` : ''}</span>
                              <button type="button" className="kb__btn kb__owner-clear" draggable={false} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setOwner(n, null); }} title="Take the card back: it is ours again and the verifier, the policeman and the arch resume" data-clear-owner>↩ Ours again</button>
                            </div>
                          )}
                          {obs && (
                            <div className={`kb__sec kb__agent kb__agent--${obs.key}"""),
("""                        )}
                        <div className="kb__row kb__actions">
                          {n.status !== 'todo' && <button""",
"""                        )}
                        {/* Whose card (openspec kanban-external-owner): name a different human
                            developer as the owner, or take it back. Distinct from manual. */}
                        <div className="kb__row kb__owner-edit" data-owner-editor>
                          {n.externalOwner ? (
                            <>
                              <span className="kb__dim" data-owner-detail>Owner: 👤 {n.externalOwner} (external) — out of our domain; nothing automatic touches this card</span>
                              <button type="button" className="kb__btn" onClick={() => setOwner(n, null)} title="Take the card back: it is ours again and the verifier, the policeman and the arch resume" data-owner-clear-detail>↩ Ours again</button>
                            </>
                          ) : (
                            <>
                              <input
                                className="kb__owner-input"
                                placeholder="external owner's name…"
                                aria-label={`External owner of card ${cardRef(n)}`}
                                value={ownerDraft[n.id] || ''}
                                draggable={false}
                                onMouseDown={(e) => e.stopPropagation()}
                                onChange={(e) => setOwnerDraft((s) => ({ ...s, [n.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter' && (ownerDraft[n.id] || '').trim()) setOwner(n, ownerDraft[n.id].trim()); }}
                                data-owner-input
                              />
                              <button type="button" className="kb__btn" disabled={!(ownerDraft[n.id] || '').trim()} onClick={() => setOwner(n, (ownerDraft[n.id] || '').trim())} title="Hand this card to a different human developer: it leaves our domain — the verifier, the policeman and the arch leave it alone until you take it back" data-owner-set>👤 External owner</button>
                            </>
                          )}
                        </div>
                        <div className="kb__row kb__actions">
                          {n.status !== 'todo' && <button"""),
("""disabled={!n.repoId || DELIVERED(n.status) || blocked || busy === n.id || !!n.manual} title={!n.repoId ? 'assign first' : blocked""",
 """disabled={!n.repoId || DELIVERED(n.status) || blocked || busy === n.id || !!n.manual || !!n.externalOwner} title={!n.repoId ? 'assign first' : n.externalOwner ? `owned by ${n.externalOwner} (external) — not ours to ping` : blocked"""),
])

# ---- kanban.css: distinct styling ----------------------------------------------------------
edit(TG + 'kanban.css', [
(""".kb__card--human { border-left: 4px solid #e5484d; }
.kb__card--dishonest { border-left: 4px solid #d29922; }

/* Rename / describe a card""",
""".kb__card--human { border-left: 4px solid #e5484d; }
.kb__card--dishonest { border-left: 4px solid #d29922; }

/* External owner (openspec kanban-external-owner): another human developer's card — a violet
   dotted edge, a violet Owner section and a violet Board check, so at a glance it reads as
   "not ours" (distinct from manual's dashed grey = the Operator's own). */
.kb__card--external { border-left: 4px dotted #a371f7; opacity: 0.92; }
.kb__owner { border-radius: 8px; padding: 4px 6px; border: 1px dotted #a371f7; background: rgba(163, 113, 247, 0.08); }
.kb__owner .kb__check-word { color: #a371f7; }
.kb__owner-clear { margin-left: auto; padding: 1px 8px; font-size: 11px; }
.kb__check--external { border-style: dotted; border-color: #a371f7; }
.kb__check--external .kb__check-word { color: #a371f7; }
.kb__owner-edit { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.kb__owner-input { flex: 1 1 160px; min-width: 120px; font: inherit; font-size: 12px; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--color-border, #444); background: transparent; color: inherit; }

/* Rename / describe a card"""),
])

# ---- PolicemanPanel.jsx: the live verdict line --------------------------------------------
edit(TG + 'PolicemanPanel.jsx', [
("board now: {v.honest} honest · {v.dishonest} dishonest · {v.stuck} stuck · {v.manual} manual",
 "board now: {v.honest} honest · {v.dishonest} dishonest · {v.stuck} stuck · {v.manual} manual · {v.external || 0} external"),
])

# ---- policemanDiagram.js: the explainer knows the state ----------------------------------
edit(TG + 'policemanDiagram.js', [
("""    { id: 'manual', x: 660, y: 180, w: 170, h: 58, label: '🔧 Manual', sub: 'not policed at all', tone: 'plain' },
  ],""",
"""    { id: 'manual', x: 660, y: 180, w: 170, h: 58, label: '🔧 Manual', sub: 'not policed at all', tone: 'plain' },
    { id: 'external', x: 660, y: 340, w: 170, h: 58, label: '👤 External owner', sub: 'another human’s — not ours', tone: 'plain' },
  ],"""),
("""    { from: 'manual', to: 'honest', label: 'you: back to auto', bend: -150 },
  ],""",
"""    { from: 'manual', to: 'honest', label: 'you: back to auto', bend: -150 },
    { from: 'honest', to: 'external', label: 'you: name an external owner', bend: 90 },
    { from: 'external', to: 'honest', label: 'you: ours again', bend: 90 },
  ],"""),
("label: '🚫 Not mine', sub: 'manual, or delivered', action: '→ leave alone; clear my own marks', tone: 'plain' }",
 "label: '🚫 Not mine', sub: 'manual, external owner, or delivered', action: '→ leave alone; clear my own marks', tone: 'plain' }"),
("    { from: 'working', to: 'skip', label: 'delivered · go manual', bend: 80 },",
 "    { from: 'working', to: 'skip', label: 'delivered · go manual · external owner', bend: 80 },"),
("note: 'Classification is mechanical first (board_integrity: manual · dishonest · stuck · honest)",
 "note: 'Classification is mechanical first (board_integrity: external · manual · dishonest · stuck · honest)"),
("  ['🚫 Not mine', 'manual, or Merged / Done', 'leave alone; on a delivered card withdraw my own observation', 'read, observe, move or flag a manual card'],",
 "  ['🚫 Not mine', 'manual, externally owned, or Merged / Done', 'leave alone; on a delivered card withdraw my own observation', 'read, observe, move or flag a manual or externally owned card'],"),
("  { n: 1, tool: 'board_integrity', what: 'the harness’s verdict from the facts: dishonest · stuck · manual · who raised what' },",
 "  { n: 1, tool: 'board_integrity', what: 'the harness’s verdict from the facts: dishonest · stuck · manual · external · who raised what' },"),
("  { n: 6, tool: 'verdict', what: 'N honest · N dishonest · N need human · N manual — then one line per move, per worrying observation, per flag; or “no change”' },",
 "  { n: 6, tool: 'verdict', what: 'N honest · N dishonest · N need human · N manual · N external — then one line per move, per worrying observation, per flag; or “no change”' },"),
("  ['Touch a manual card', 'not read, not observed, not moved, not flagged'],",
 "  ['Touch a manual or externally owned card', 'not read, not observed, not moved, not flagged — an external owner’s card is out of our domain, not ours to judge'],"),
])

edit(TG + 'policemanDiagram.test.mjs', [
("  assert.deepEqual(BOARD_CHECK.states.map((s) => s.id), ['honest', 'unverified', 'needs-human', 'manual']);",
 "  assert.deepEqual(BOARD_CHECK.states.map((s) => s.id), ['honest', 'unverified', 'needs-human', 'manual', 'external']);\n  // openspec kanban-external-owner: another human's card is a state of its own, reachable and leavable only by you.\n  assert.ok(BOARD_CHECK.edges.some((e) => e.from === 'honest' && e.to === 'external' && /you/.test(e.label)) && BOARD_CHECK.edges.some((e) => e.from === 'external' && e.to === 'honest' && /you/.test(e.label)));"),
("  assert.equal((svg.match(/data-state=\"/g) || []).length, 4);",
 "  assert.equal((svg.match(/data-state=\"/g) || []).length, 5);"),
("assert.ok(CANNOT.some(([w]) => /Dispatch/.test(w)) && CANNOT.some(([w]) => /Move by claim/.test(w)) && CANNOT.some(([w]) => /manual/.test(w)));",
 "assert.ok(CANNOT.some(([w]) => /Dispatch/.test(w)) && CANNOT.some(([w]) => /Move by claim/.test(w)) && CANNOT.some(([w]) => /manual/.test(w)) && CANNOT.some(([w]) => /externally owned/.test(w)));"),
])

# ---- policemanStateMachine.js (+ its vendored copy in the understanding app) ---------------
edit(TG + 'policemanStateMachine.js', [
("  S('c-skip', '🚫 Not mine', 'manual or delivered → leave alone', 1000, 840, { parent: 'cards', kind: 'card', shape: 'terminal' }),",
 "  S('c-skip', '🚫 Not mine', 'manual · external owner · delivered → leave alone', 1000, 840, { parent: 'cards', kind: 'card', shape: 'terminal' }),"),
("  E('c-working', 'c-skip', 'delivered · go manual', 'card'),",
 "  E('c-working', 'c-skip', 'delivered · go manual · external owner', 'card'),"),
])
src = open(TG + 'policemanStateMachine.js', encoding='utf-8').read()
open('understanding-app/policemanStateMachine.js', 'w', encoding='utf-8', newline='\n').write(
    '// VENDORED COPY of client/src/components/taskgraph/policemanStateMachine.js for the build-less understanding app — keep in step.\n' + src)
print('re-vendored understanding-app/policemanStateMachine.js')

# ---- taskFilters.test.mjs: the flag -------------------------------------------------------
edit(TG + 'taskFilters.test.mjs', [
("""  const keys = FLAGS.map(([k]) => k);
  assert.ok(keys.includes('needs-human') && keys.includes('manual'));
});""",
"""  const keys = FLAGS.map(([k]) => k);
  assert.ok(keys.includes('needs-human') && keys.includes('manual'));
});

test('flagsOf: an external owner is a filter flag of its own (openspec kanban-external-owner)', () => {
  const external = new Set(['x']);
  assert.deepEqual(flagsOf('x', null, null, null, null, external), ['external']);
  assert.deepEqual(flagsOf('x', null, null, null, new Set(['x']), external), ['manual', 'external']); // both can be set; distinct flags
  assert.deepEqual(flagsOf('y', null, null, null, null, external), []);
  const row = FLAGS.find(([k]) => k === 'external');
  assert.ok(row && /external owner/.test(row[1]) && /out of our domain/.test(row[2]));
});"""),
])

# ---- package.json: the new test file --------------------------------------------------------
edit('client/package.json', [
("src/components/taskgraph/cardSections.observation.test.mjs\"",
 "src/components/taskgraph/cardSections.observation.test.mjs src/components/taskgraph/cardSections.owner.test.mjs\""),
])
print('all client patches applied')
