import { useState } from 'react';
import { useDock } from '../../context/DockContext';
import '../../pages/autopilot.css';

// The "Loops" sub-tab of the AutopilotConsole (plans/autopilot-loop-mode.md +
// openspec adopt-autopilot-loops + unify-loop-types). Loop mode is the
// deterministic sibling of the classifier, and a loop has a KIND: a 📋 RECIPE
// loop resends one stored ritual prompt each turn until the agent's own
// LOOP_DONE; a 🎯 GOAL loop drives toward a stated goal and, on the agent's
// done-claim, sends a verification turn — only GOAL_VERIFIED stops it. Both
// also stop on NEEDS_HUMAN, a deny-list hit, the iteration cap, or a run
// error. No brain, no LLM judge. One loop per agent, XOR with suggestion
// arming (server-enforced).
//
// This is the DEEP console: recipe management (the named templates the dock's
// control arms from — seeded with "Drive the OpenSpec change" / "Finish and
// ship the change"), per-agent arm forms (recipe-fillable, still
// hand-editable), live loop status with kind + phase, and the stop-reason
// readout that teaches us how to tune recipes/caps from real runs.

const DEFAULT_SENTINEL = 'LOOP_DONE';
const DEFAULT_CAP = 10;

// Loop status → badge class suffix (reuses the st-* / out-* palette in autopilot.css).
const LOOP_BADGE = {
  looping: { cls: 'run', label: 'looping' },
  done: { cls: 'sent', label: 'done' },
  escalate: { cls: 'esc', label: 'escalated' },
  capped: { cls: 'esc', label: 'capped' },
  error: { cls: 'esc', label: 'error' },
  stopped: { cls: 'off', label: 'stopped' },
};

// Human phrasing per stop reason for the "why did it stop" readout.
const STOP_REASON = {
  sentinel: 'agent reported done',
  verified: 'goal verified achieved',
  'needs-human': 'agent needs you',
  'deny-list': 'risky action mentioned',
  cap: 'iteration cap reached',
  error: 'run error',
  user: 'stopped by you',
  drained: 'queue drained — every prompt sent',
  'step-unverified': 'a step failed verification',
  'stash-tab-gone': 'the queue’s dock tab was closed',
};

// Loop kind → marker, matching the dock control and the console's nav emoji.
const KIND_EMOJI = { recipe: '📋', goal: '🎯', queue: '🗒️' };

function LoopRow({ agent, loop, recipes, loopAction }) {
  const active = loop?.active;
  // The form is open whenever there's no active loop and the user hasn't dismissed it.
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(loop?.prompt || '');
  const [sentinel, setSentinel] = useState(loop?.sentinel || DEFAULT_SENTINEL);
  const [cap, setCap] = useState(loop?.maxIterations || DEFAULT_CAP);
  const [busy, setBusy] = useState(false);

  const showForm = !active && (editing || !loop);

  // Arm-from-recipe: picking a recipe FILLS the visible fields (prompt / sentinel /
  // cap) — what you see below is exactly what will be resent, and stays editable.
  const applyRecipe = (id) => {
    const r = recipes.find((x) => x.id === id);
    if (!r) return;
    setPrompt(r.prompt);
    setSentinel(r.sentinel || DEFAULT_SENTINEL);
    setCap(r.maxIterations || DEFAULT_CAP);
  };

  const arm = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      await loopAction({
        repoId: agent.repoId, action: 'start',
        prompt: prompt.trim(), sentinel: sentinel.trim() || DEFAULT_SENTINEL,
        maxIterations: Number(cap) || DEFAULT_CAP,
      });
      setEditing(false);
    } finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true);
    try { await loopAction({ repoId: agent.repoId, action: 'stop' }); }
    finally { setBusy(false); }
  };

  const b = LOOP_BADGE[loop?.status] ?? LOOP_BADGE.stopped;

  return (
    <li className={`lp-card ${active ? 'is-active' : ''}`}>
      <div className="lp-card__head">
        <span className="lp-card__repo">{agent.repoName}</span>
        {loop && <span className="lp-card__kind">{KIND_EMOJI[loop.kind] ?? '📋'} {loop.kind ?? 'recipe'}</span>}
        {loop?.recipeName && <span className="lp-card__recipe">{loop.recipeName}</span>}
        {loop && (
          <span className={`ap-state st-${b.cls}`}>
            {active && loop.kind === 'goal' && loop.phase === 'verify' ? 'verifying' : b.label}
          </span>
        )}
      </div>

      {active ? (
        // --- live status ---
        <div className="lp-live">
          {loop.kind === 'goal' && loop.goal && (
            <div className="lp-live__goal" title={loop.goal}>🎯 {loop.goal}</div>
          )}
          <code className="lp-live__prompt" title={loop.prompt}>{loop.prompt}</code>
          <div className="lp-live__meta">
            <span className="lp-stat">
              <span className="lp-stat__k">iterations</span>
              <span className="lp-stat__v">{loop.iterationsDone} / {loop.maxIterations}</span>
            </span>
            <span className="lp-stat">
              <span className="lp-stat__k">sentinel</span>
              <code className="lp-stat__v">{loop.sentinel}</code>
            </span>
            {loop.lastSentAt > 0 && (
              <span className="lp-stat">
                <span className="lp-stat__k">last sent</span>
                <span className="lp-stat__v">{new Date(loop.lastSentAt).toLocaleTimeString()}</span>
              </span>
            )}
          </div>
          <div className="lp-progress">
            <div className="lp-progress__bar"
              style={{ width: `${Math.min(100, (loop.iterationsDone / loop.maxIterations) * 100)}%` }} />
          </div>
          <button className="lp-stop" onClick={stop} disabled={busy}>■ Stop loop</button>
        </div>
      ) : showForm ? (
        // --- arm form ---
        <form className="lp-form" onSubmit={(e) => { e.preventDefault(); arm(); }}>
          {recipes.length > 0 && (
            <label className="lp-field">
              <span className="lp-field__k">Fill from a recipe</span>
              <select
                className="lp-field__in"
                defaultValue=""
                onChange={(e) => { applyRecipe(e.target.value); }}
              >
                <option value="">— compose by hand —</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} (cap {r.maxIterations})</option>
                ))}
              </select>
            </label>
          )}
          <label className="lp-field">
            <span className="lp-field__k">Prompt to resend</span>
            <textarea
              className="lp-field__prompt" rows={2} value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Keep going. Do the next slice yourself. Print LOOP_DONE when nothing is left."
            />
          </label>
          <div className="lp-form__row">
            <label className="lp-field">
              <span className="lp-field__k">Sentinel (stop phrase)</span>
              <input className="lp-field__in" value={sentinel}
                onChange={(e) => setSentinel(e.target.value)} placeholder={DEFAULT_SENTINEL} />
            </label>
            <label className="lp-field lp-field--cap">
              <span className="lp-field__k">Max iterations</span>
              <input className="lp-field__in" type="number" min={1} max={100} value={cap}
                onChange={(e) => setCap(e.target.value)} />
            </label>
          </div>
          <div className="lp-form__actions">
            <button className="lp-arm" type="submit" disabled={busy || !prompt.trim()}>Arm loop</button>
            {loop && <button className="lp-mini" type="button" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      ) : (
        // --- finished loop: outcome + WHY (stop reason + detail) + re-arm ---
        <div className="lp-done">
          <span className="ap-muted">
            {loop.iterationsDone} iteration{loop.iterationsDone === 1 ? '' : 's'} sent
            {loop.stopReason && ` · ${STOP_REASON[loop.stopReason] ?? loop.stopReason}`}
          </span>
          {loop.stopDetail && (
            <div className={`lp-reason${loop.stopReason === 'needs-human' ? ' lp-reason--human' : ''}`}>
              {loop.stopDetail}
            </div>
          )}
          <button className="lp-mini on" onClick={() => setEditing(true)}>Arm again</button>
        </div>
      )}
    </li>
  );
}

// One agent's 🗒️ queue loop (openspec: queue-based-loop): status over the LIVE
// stash of the bound dock tab, plus an arm form with a tab picker — a repo can
// hold several dock tabs and the queue is per-tab. Arming an empty stash is
// refused server-side; the button stays disabled with the reason instead.
function QueueRow({ agent, loop, tabs, loopAction }) {
  const repoTabs = tabs.filter((tb) => tb.repoId === agent.repoId);
  const [tabId, setTabId] = useState('');
  const [verify, setVerify] = useState(true);
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);

  const isQueue = loop?.kind === 'queue';
  const active = !!loop?.active && isQueue;
  const chosen = repoTabs.find((tb) => tb.id === tabId) || repoTabs[0] || null;
  const stashLen = chosen?.stash?.length ?? 0;

  const act = async (body) => {
    setBusy(true);
    try { await loopAction(body); } finally { setBusy(false); }
  };
  const arm = () => {
    if (!chosen || stashLen === 0) return;
    act({
      repoId: agent.repoId, action: 'start', kind: 'queue', tabId: chosen.id,
      mode: 'drive', verifyEnabled: verify,
      maxIterations: Number(cap) >= 1 ? Number(cap) : undefined,
      sessionId: chosen.sessionId || undefined,
    });
  };

  const b = LOOP_BADGE[loop?.status] ?? LOOP_BADGE.stopped;

  return (
    <li className={`lp-card ${active ? 'is-active' : ''}`}>
      <div className="lp-card__head">
        <span className="lp-card__repo">{agent.repoName}</span>
        <span className="lp-card__kind">🗒️ queue</span>
        {isQueue && (
          <span className={`ap-state st-${b.cls}`}>
            {active && loop.phase === 'verify' ? 'verifying' : b.label}
          </span>
        )}
      </div>

      {active ? (
        <div className="lp-live">
          <div className="lp-live__meta">
            <span className="lp-stat">
              <span className="lp-stat__k">sent</span>
              <span className="lp-stat__v">{loop.queueSent ?? 0}</span>
            </span>
            <span className="lp-stat">
              <span className="lp-stat__k">queued</span>
              <span className="lp-stat__v">{loop.queueRemaining ?? 0}</span>
            </span>
            <span className="lp-stat">
              <span className="lp-stat__k">iterations</span>
              <span className="lp-stat__v">{loop.iterationsDone} / {loop.maxIterations}</span>
            </span>
            <span className="lp-stat">
              <span className="lp-stat__k">verify</span>
              <span className="lp-stat__v">{loop.verifyEnabled === false ? 'off' : 'each step'}</span>
            </span>
          </div>
          <button className="lp-stop" onClick={() => act({ repoId: agent.repoId, action: 'stop' })} disabled={busy}>
            ■ Stop loop
          </button>
        </div>
      ) : (
        <form className="lp-form" onSubmit={(e) => { e.preventDefault(); arm(); }}>
          {isQueue && loop?.stopReason && (
            <span className="ap-muted">
              {loop.queueSent ?? 0} step{(loop.queueSent ?? 0) === 1 ? '' : 's'} sent
              {` · ${STOP_REASON[loop.stopReason] ?? loop.stopReason}`}
            </span>
          )}
          {isQueue && loop?.stopDetail && (
            <div className={`lp-reason${loop.stopReason === 'needs-human' ? ' lp-reason--human' : ''}`}>
              {loop.stopDetail}
            </div>
          )}
          {repoTabs.length === 0 ? (
            <span className="ap-muted">
              No dashboard dock tab for this repo — a queue lives on a dock tab’s prompt stash.
            </span>
          ) : (
            <>
              <div className="lp-form__row">
                <label className="lp-field">
                  <span className="lp-field__k">Dock tab (its stash IS the queue)</span>
                  <select className="lp-field__in" value={chosen?.id || ''} onChange={(e) => setTabId(e.target.value)}>
                    {repoTabs.map((tb) => (
                      <option key={tb.id} value={tb.id}>
                        {tb.repoName} · {tb.stash?.length ?? 0} queued
                      </option>
                    ))}
                  </select>
                </label>
                <label className="lp-field lp-field--cap">
                  <span className="lp-field__k">Cap</span>
                  <input
                    className="lp-field__in" type="number" min={1} max={100} value={cap}
                    placeholder={String(Math.max(stashLen * 2, 2))}
                    onChange={(e) => setCap(e.target.value)}
                  />
                </label>
              </div>
              <label className="lp-check">
                <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
                Verify each step (agent must answer <code>STEP_VERIFIED</code>) — ~2 turns per item
              </label>
              <div className="lp-form__actions">
                <button className="lp-arm" type="submit" disabled={busy || !chosen || stashLen === 0}>
                  Arm queue loop
                </button>
                {stashLen === 0 && (
                  <span className="ap-muted">stash is empty — queue prompts from the agent’s chat box first</span>
                )}
              </div>
            </>
          )}
        </form>
      )}
    </li>
  );
}

// One recipe card: display or inline-edit. The prompt is fully visible — what is
// shown here is byte-identical to what an armed loop sends (nothing injected).
function RecipeCard({ recipe, saveRecipe, removeRecipe }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setDraft({
      name: recipe.name,
      prompt: recipe.prompt,
      sentinel: recipe.sentinel,
      maxIterations: recipe.maxIterations,
    });
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveRecipe(recipe.id, { ...draft, maxIterations: Number(draft.maxIterations) || DEFAULT_CAP });
      setEditing(false);
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await removeRecipe(recipe.id); }
    finally { setBusy(false); }
  };

  return (
    <li className="lp-card lp-recipe">
      {editing ? (
        <form className="lp-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="lp-form__row">
            <label className="lp-field">
              <span className="lp-field__k">Name</span>
              <input className="lp-field__in" value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </label>
            <label className="lp-field">
              <span className="lp-field__k">Sentinel</span>
              <input className="lp-field__in" value={draft.sentinel}
                onChange={(e) => setDraft((d) => ({ ...d, sentinel: e.target.value }))} />
            </label>
            <label className="lp-field lp-field--cap">
              <span className="lp-field__k">Cap</span>
              <input className="lp-field__in" type="number" min={1} max={100} value={draft.maxIterations}
                onChange={(e) => setDraft((d) => ({ ...d, maxIterations: e.target.value }))} />
            </label>
          </div>
          <label className="lp-field">
            <span className="lp-field__k">Prompt (sent verbatim — keep the contract paragraph)</span>
            <textarea className="lp-field__prompt" rows={5} value={draft.prompt}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))} />
          </label>
          <div className="lp-form__actions">
            <button className="lp-arm" type="submit"
              disabled={busy || !draft.name.trim() || !draft.prompt.trim()}>
              Save
            </button>
            <button className="lp-mini" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="lp-card__head">
            <span className="lp-card__repo">{recipe.name}</span>
            <span className="ap-muted">cap {recipe.maxIterations} · sentinel <code>{recipe.sentinel}</code></span>
          </div>
          <code className="lp-recipe__prompt">{recipe.prompt}</code>
          <div className="lp-form__actions">
            <button className="lp-mini" disabled={busy} onClick={startEdit}>Edit</button>
            <button className="lp-mini rp-mini--danger" disabled={busy} onClick={remove}>Delete</button>
          </div>
        </>
      )}
    </li>
  );
}

// `section` picks which half renders (openspec restructure-autopilot-tabs): the
// Goal-based loop root shows 'agents' and 'recipes' as separate subtabs, both
// over this one component so the shared intro and subcomponents stay in one place.
export default function LoopsView({ section = 'agents', data, loopAction, addRecipe, saveRecipe, removeRecipe }) {
  const agents = data?.agents ?? [];
  const loops = data?.loops ?? [];
  const recipes = data?.recipes ?? [];
  // Dock tabs back the 🗒️ Queue subtab: each tab's prompt stash is a candidate
  // queue, so the arm form picks among THIS repo's tabs.
  const { tabs } = useDock();
  const byRepo = Object.fromEntries(loops.map((l) => [l.repoId, l]));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', prompt: '', sentinel: DEFAULT_SENTINEL, maxIterations: DEFAULT_CAP });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await addRecipe({ ...draft, maxIterations: Number(draft.maxIterations) || DEFAULT_CAP });
      setAdding(false);
      setDraft({ name: '', prompt: '', sentinel: DEFAULT_SENTINEL, maxIterations: DEFAULT_CAP });
    } finally { setBusy(false); }
  };

  return (
    <>
      <p className="autopilot__summary">
        A loop drives the agent every time it finishes a turn. A <b>📋 recipe loop</b> resends
        one stored ritual prompt until the agent prints the <b>sentinel</b>; a <b>🎯 goal
        loop</b> drives toward a stated goal and, on the agent’s done-claim, sends a
        <b> verification turn</b> — only <code>GOAL_VERIFIED</code> stops it; a <b>🗒️ queue
        loop</b> (its own subtab) drains a dock tab’s prompt stash step by step. All stop when the
        agent asks for you with <code>NEEDS_HUMAN:</code>, mentions a deny-listed risky action,
        or hits the iteration cap — and record <b>why</b> they stopped. Deterministic — no
        brain, no LLM judge. Arming is exclusive per agent (a loop displaces suggestion arming
        and vice versa); sends are fenced by the operator gate and the kill switch, and every
        send is audited. The contract a driven agent follows lives in
        <code> docs/loop-driven-agent-convention.md</code>.
      </p>

      {/* --- Recipes: the named templates the dock's one-tap control arms from --- */}
      {section === 'recipes' && (<>
      <h3 className="rp-section">Loop recipes</h3>
      <p className="autopilot__summary autopilot__summary--sub">
        Reusable templates (prompt + sentinel + cap) the 📋 recipe loop arms from, so starting a
        codified loop is a pick, not a composition. Seeded with the delivery ritual —
        <b> Drive the OpenSpec change</b> and <b>Finish and ship the change</b>; edits stick,
        and deleted seeds stay deleted.
      </p>
      <ul className="lp-list lp-list--recipes">
        {recipes.map((r) => (
          <RecipeCard key={r.id} recipe={r} saveRecipe={saveRecipe} removeRecipe={removeRecipe} />
        ))}
        {recipes.length === 0 && <li className="autopilot__empty">No recipes yet — add one below.</li>}
      </ul>
      {adding ? (
        <form className="lp-form lp-form--add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <div className="lp-form__row">
            <label className="lp-field">
              <span className="lp-field__k">Name</span>
              <input className="lp-field__in" value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </label>
            <label className="lp-field">
              <span className="lp-field__k">Sentinel</span>
              <input className="lp-field__in" value={draft.sentinel}
                onChange={(e) => setDraft((d) => ({ ...d, sentinel: e.target.value }))} />
            </label>
            <label className="lp-field lp-field--cap">
              <span className="lp-field__k">Cap</span>
              <input className="lp-field__in" type="number" min={1} max={100} value={draft.maxIterations}
                onChange={(e) => setDraft((d) => ({ ...d, maxIterations: e.target.value }))} />
            </label>
          </div>
          <label className="lp-field">
            <span className="lp-field__k">Prompt (include the done/needs-human contract paragraph)</span>
            <textarea className="lp-field__prompt" rows={4} value={draft.prompt}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))} />
          </label>
          <div className="lp-form__actions">
            <button className="lp-arm" type="submit"
              disabled={busy || !draft.name.trim() || !draft.prompt.trim()}>
              Add recipe
            </button>
            <button className="lp-mini" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="lp-mini on" onClick={() => setAdding(true)}>+ Add recipe</button>
      )}
      </>)}

      {/* --- Queue loops over dock-tab stashes (openspec queue-based-loop) --- */}
      {section === 'queue' && (<>
      <h3 className="rp-section">Queue loops</h3>
      <p className="autopilot__summary autopilot__summary--sub">
        A <b>🗒️ queue loop</b> drains a dock tab’s <b>prompt stash</b> top-down: it sends the
        head prompt, waits for the reply, verifies it (<code>STEP_VERIFIED</code>, on by
        default), then unloads the next. The strip under that agent’s chat box IS the
        queue — reorder it to reorder the loop, stash more mid-run and they join the end.
        An item leaves the stash only when its send lands, so stopping mid-way loses
        nothing: re-arm and it resumes from the head.
      </p>
      <ul className="lp-list">
        {agents.map((a) => (
          <QueueRow key={a.repoId} agent={a} loop={byRepo[a.repoId]} tabs={tabs} loopAction={loopAction} />
        ))}
        {agents.length === 0 && <li className="autopilot__empty">No agents yet.</li>}
      </ul>
      </>)}

      {/* --- Per-agent loops --- */}
      {section === 'agents' && (<>
      <h3 className="rp-section">Agents</h3>
      <ul className="lp-list">
        {agents.map((a) => (
          <LoopRow key={a.repoId} agent={a} loop={byRepo[a.repoId]} recipes={recipes} loopAction={loopAction} />
        ))}
        {agents.length === 0 && <li className="autopilot__empty">No agents yet.</li>}
      </ul>
      </>)}
    </>
  );
}
