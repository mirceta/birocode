import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';

// THE loop section on the agent dock card (openspec: unify-loop-types, revision 2).
// One mental model, spoken plainly by the UI: this agent has (at most) ONE loop
// instance — kind 💡 suggestion / 📋 recipe / 🎯 goal / 🗒️ queue — armed or not, and
// runs in one of two MODES: "suggest" (its decided next prompt only pre-fills the
// chat composer, as a pending suggestion) or "drive" (it actually sends, capped).
//
// The collapsed header names the instance's type + armed state + mode, and holds
// the one Drive checkbox (openspec: dock-loop-controls-declutter) — the common
// mode axis, flippable without opening the popover. Expanding shows controls
// only: the type picker, the selected type's parameters, prompt inspection, the
// pending suggestion (with a put-in-textbox action via onUsePending), and Arm /
// one Disarm — kind/mode explanations live in the Autopilot console's Loops tab.
// Arming any type replaces the slot server-side (exclusive by construction),
// stated up front before the click.
//
// Two disclosure tiers feed it: badge/status data (kind, mode, phase, counts, and
// — only while the gate is open — the pending prompt) comes from the read-only,
// non-operator-gated GET /api/autopilot/loops (polled by the Dashboard and passed
// down) so terminal states stay honest after the gate closes; prompt INSPECTION
// fetches the gated GET /api/autopilot/loops/detail on open — a 403 renders the
// explicit gate-closed hint in place of prompt text. Actions go through the fully
// gated endpoints; a 403 there shows the same hint.
// The queue kind (openspec: queue-based-loop) drains THIS dock tab's live
// prompt stash top-down — its parameters are the stash itself (reorder the
// strip to reorder the loop) plus the per-step verification toggle.
const KINDS = ['suggestion', 'recipe', 'goal', 'queue'];
const EMOJI = { suggestion: '💡', recipe: '📋', goal: '🎯', queue: '🗒️' };

// Clipboard with a fallback chain (openspec: add-loop-debug-handoff): the async
// API needs a secure context (the harness is often plain http off-box), so fall
// back to the synchronous execCommand copy; a false return means both failed and
// the caller shows the text for manual copying instead.
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* insecure context or permission — try the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export default function DockLoopControl({ repoId, repoName, sessionId, tabId, stash = [], loop, recipes = [], onChanged, onUsePending }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const [pickedMode, setPickedMode] = useState(null);
  const [recipeId, setRecipeId] = useState(recipes[0]?.id || '');
  const [cap, setCap] = useState('');
  const [goal, setGoal] = useState('');
  // Queue verification toggle: null = untouched (defaults ON — the safe
  // posture); a persisted opt-out re-hydrates via the gated detail.
  const [verifyPick, setVerifyPick] = useState(null);
  const [verifySeed, setVerifySeed] = useState(null);
  // Per-arm deny-list (openspec: advance-queue-loop, D2): the global default
  // terms arrive with the gated detail; the operator may drop terms for THIS
  // arm only. denyDefault = the server's list; denyDropped = terms removed here.
  // Nothing dropped → the arm request omits denyList → global default applies.
  const [denyDefault, setDenyDefault] = useState([]);
  const [denyDropped, setDenyDropped] = useState([]);
  const [inspect, setInspect] = useState(false);
  // Gated prompt-level detail: null = not fetched, 'gate-closed' = 403,
  // otherwise { loops, recipes, goalTemplates }.
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gateHint, setGateHint] = useState(false);
  const [err, setErr] = useState('');
  // Copy-for-debugging: idle | busy | copied | manual (clipboard failed — show
  // the text for hand-copying) | error (fetch failed).
  const [dbg, setDbg] = useState({ phase: 'idle', text: '' });

  const armed = !!loop?.active;
  const armedKind = armed ? loop.kind : null;
  const selected = picked ?? armedKind ?? loop?.kind ?? 'suggestion';
  // The mode shown/used: the armed instance's live mode when the selected type IS
  // the armed one, otherwise the arming choice (default: drive for driven kinds,
  // suggest for the suggestion kind — safe by default for the watcher).
  const mode = armedKind === selected
    ? loop.mode
    : (pickedMode ?? (selected === 'suggestion' ? 'suggest' : 'drive'));
  const chosenRecipe = recipes.find((r) => r.id === recipeId) || recipes[0] || null;

  const kindName = (k) => t(`dashboard.loopType.${k}`);
  const modeName = (m) => t(`dashboard.loopMode.${m}`);

  // Close the popover when the armed instance visibly flips — the action's own
  // setOpen can lose a race with the poll re-render because the arm POST's
  // response is slow (it rebuilds the full autopilot state).
  useEffect(() => { setOpen(false); setPicked(null); setPickedMode(null); }, [armedKind]);

  // Prompt inspection needs the gated detail; fetch once per popover open so
  // the previews are byte-identical to what the engine will send. The same
  // fetch seeds the parameter fields from the PERSISTED loop record (openspec:
  // fix-loop-arm-freshness) — a resolved or restart-survived loop reopens with
  // the goal/cap/mode it was armed with, not blanks. Untouched fields only:
  // anything the user already typed wins.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    apiGet('/autopilot/loops/detail')
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        const defaults = Array.isArray(d?.denyList) ? d.denyList : [];
        setDenyDefault(defaults);
        const mine = d?.loops?.find((l) => l.repoId === repoId);
        // Re-hydrate a persisted per-arm trim (only when the user hasn't
        // touched the chips yet this open): dropped = default minus stored.
        if (mine?.denyList != null) {
          setDenyDropped((prev) => (prev.length > 0 ? prev
            : defaults.filter((term) => !mine.denyList.includes(term))));
        }
        if (!mine) return;
        if (mine.goal) setGoal((g) => g || mine.goal);
        if (mine.maxIterations > 0) setCap((c) => (c === '' ? String(mine.maxIterations) : c));
        if (!mine.active && mine.mode) setPickedMode((m) => m ?? mine.mode);
        if (mine.kind === 'queue' && typeof mine.verifyEnabled === 'boolean') setVerifySeed(mine.verifyEnabled);
      })
      .catch((e) => { if (alive) setDetail(e?.status === 403 ? 'gate-closed' : null); });
    return () => { alive = false; };
  }, [open, repoId]);

  const act = async (path, body, keepOpen = false) => {
    setBusy(true);
    setGateHint(false);
    setErr('');
    try {
      await apiPost(path, body);
      if (!keepOpen) setOpen(false);
      onChanged?.();
    } catch (e) {
      if (e?.status === 403) {
        setGateHint(true); // gate closed → teach, don't fail mutely
      } else {
        let text = e.message;
        try {
          text = JSON.parse(e.message).error || text;
        } catch { /* raw text */ }
        setErr(text);
      }
    } finally {
      setBusy(false);
    }
  };

  const capNum = Number(cap);
  // Driven kinds arm PINNED to the conversation this dock is showing (openspec:
  // fix-loop-conversation-identity): the loop then reads and resumes that
  // session's lineage only. Null (no conversation yet) lets the server fall
  // back to the repo's newest session at arm time.
  // Effective verify setting for the queue kind: the user's explicit pick, else
  // the persisted value a re-arm hydrated, else the default ON.
  const verifyOn = verifyPick ?? verifySeed ?? true;
  // The arm's effective deny-list: the default minus the dropped chips. Sent
  // only when something was dropped — untouched arms keep following the
  // global default (null on the instance).
  const denyEffective = denyDefault.filter((term) => !denyDropped.includes(term));
  const arm = () => {
    if (selected === 'suggestion') {
      return act('/autopilot/loop', { repoId, action: 'start', kind: 'suggestion', mode });
    }
    if (selected === 'queue') {
      if (!tabId || stash.length === 0) return undefined;
      return act('/autopilot/loop', {
        repoId, action: 'start', kind: 'queue', tabId, mode,
        verifyEnabled: verifyOn,
        maxIterations: capNum >= 1 ? capNum : undefined,
        sessionId: sessionId || undefined,
        denyList: denyDropped.length > 0 ? denyEffective : undefined,
      });
    }
    if (selected === 'recipe') {
      if (!chosenRecipe) return undefined;
      return act('/autopilot/loop', {
        repoId, action: 'start', recipeId: chosenRecipe.id, mode,
        maxIterations: capNum >= 1 ? capNum : undefined,
        sessionId: sessionId || undefined,
      });
    }
    if (!goal.trim()) return undefined;
    return act('/autopilot/loop', {
      repoId, action: 'start', kind: 'goal', goal: goal.trim(), mode,
      maxIterations: capNum >= 1 ? capNum : undefined,
      sessionId: sessionId || undefined,
    });
  };

  // One Disarm for whatever is armed — the agent has one loop slot.
  const disarm = () => act('/autopilot/loop', { repoId, action: 'disarm' });

  // One-step resume (openspec: advance-queue-loop, D3): a stopped queue
  // instance with items still stashed re-activates in place — sent-history
  // kept, fresh iteration budget, drives from the current head. Eligibility
  // comes from the ungated projection; the action itself is gated.
  const resumable = loop?.kind === 'queue' && !loop.active && (loop.queueRemaining ?? 0) > 0;
  const resume = () => act('/autopilot/loop', { repoId, action: 'resume' });

  // Copy-for-debugging (openspec: add-loop-debug-handoff): fetch the server's
  // debug bundle and put a paste-ready block on the clipboard, so the user can
  // hand this exact loop to an agent in chat. Works in every loop state — a
  // stopped-when-it-shouldn't-have loop is the primary use.
  const copyDebug = async () => {
    setDbg({ phase: 'busy', text: '' });
    try {
      const bundle = await apiGet(`/autopilot/loops/${repoId}/debug`);
      const text = `Claude Web loop debug bundle — repo "${bundle?.repo?.name ?? repoId}", generated ${bundle?.generatedAt}. Paste this whole block to an agent; it is self-describing.\n\`\`\`json\n${JSON.stringify(bundle, null, 2)}\n\`\`\``;
      if (await copyToClipboard(text)) {
        setDbg({ phase: 'copied', text: '' });
        setTimeout(() => setDbg((d) => (d.phase === 'copied' ? { phase: 'idle', text: '' } : d)), 2500);
      } else {
        setDbg({ phase: 'manual', text });
      }
    } catch {
      setDbg({ phase: 'error', text: '' });
    }
  };
  // Flip a live instance's mode without resetting it (revision 2, D9).
  const setLiveMode = (m) => act('/autopilot/loop', { repoId, action: 'mode', mode: m }, true);

  // ---- collapsed header: type · armed · mode at a glance ----
  const verifying = (loop?.kind === 'goal' || loop?.kind === 'queue') && loop?.phase === 'verify';
  const capText = loop?.maxIterations > 0 ? `${loop.iterationsDone}/${loop.maxIterations}` : `${loop?.iterationsDone ?? 0}`;
  // Queue progress (openspec: queue-based-loop): sent / remaining from the
  // ungated projection — remaining is the bound tab's LIVE stash length, so
  // stashing mid-run visibly grows it.
  const queueText = loop?.kind === 'queue'
    ? ` · ${t('dashboard.loopQueueProgress', { sent: loop.queueSent ?? 0, left: loop.queueRemaining ?? 0 })}`
    : '';
  // Binding line (openspec: advance-queue-loop, D5): an armed queue names the
  // repo it drives on every disclosure surface, so a wrong-tab arm is visible
  // before its first send lands.
  const bindText = repoName ? ` · ${t('dashboard.loopQueueBind', { repo: repoName })}` : '';
  const summary = loop
    ? (armed
      ? `${EMOJI[loop.kind]} ${kindName(loop.kind)} · ${t('dashboard.loopArmedWord')} · ${modeName(loop.mode)}${loop.kind === 'suggestion' ? '' : ` · ${capText}`}${queueText}${loop.kind === 'queue' ? bindText : ''}${verifying ? ` · ${t('dashboard.loopVerifying')}` : ''}`
      : `${EMOJI[loop.kind]} ${kindName(loop.kind)} · ${t(`dashboard.loopStatus.${loop.status}`) || loop.status}${loop.kind === 'queue' ? queueText : ''}`)
    : t('dashboard.loopNone');

  return (
    <div className="phone__loop">
      <div className="phone__loop-row">
        <button
          type="button"
          className={`phone__loop-btn${open ? ' phone__loop-btn--on' : ''}${armed ? ' phone__loop-btn--armed' : ''}`}
          onClick={() => setOpen((v) => !v)}
          title={t('dashboard.loopHint')}
        >
          ⟳ {summary}
        </button>
        {loop?.status === 'escalate' && loop.stopDetail && (
          <span className="phone__loop-question" title={loop.stopDetail}>
            {loop.stopDetail}
          </span>
        )}
        {/* The suggest/drive mode as ONE header-row checkbox (openspec:
            dock-loop-controls-declutter, D1/D2): visible collapsed and
            expanded, so the mode is glanceable and flippable without opening
            the popover. Checked = drive. Same two paths as the old radiogroup:
            flip the live armed instance in place, else seed the next arm. */}
        <label className="phone__loop-drive" title={t(`dashboard.loopModeHint.${mode}`)}>
          <input
            type="checkbox"
            checked={mode === 'drive'}
            disabled={busy}
            aria-label={t('dashboard.loopModeAria')}
            onChange={(e) => {
              const m = e.target.checked ? 'drive' : 'suggest';
              if (armedKind === selected) setLiveMode(m); else setPickedMode(m);
            }}
          />
          {t('dashboard.loopDriveCheck')}
        </label>
      </div>
      {/* Gate/error feedback lives OUTSIDE the popover subtree (D3): a
          collapsed-row checkbox flip that 403s must not fail mutely. */}
      {gateHint && (
        <div className="phone__loop-msg phone__loop-msg--gate" role="status">
          {t('dashboard.loopGateClosed')}
        </div>
      )}
      {err && (
        <div className="phone__loop-msg phone__loop-msg--err" role="status">
          {t('dashboard.loopError', { error: err })}
        </div>
      )}
      {open && (
        <div className="phone__loop-pop">
          {/* Armed header: the one instance's live status + the single Disarm */}
          {armed && (
            <div className="phone__loop-armed">
              <span className="phone__loop-armed-k">
                {EMOJI[armedKind]} {t('dashboard.loopArmedAs', { mode: kindName(armedKind) })}
              </span>
              <span className="phone__loop-armed-v">
                {loop.kind === 'suggestion'
                  ? modeName(loop.mode)
                  : `${modeName(loop.mode)} · ${capText}${queueText}${loop.kind === 'queue' ? bindText : ''} · ${verifying ? t('dashboard.loopVerifying') : t(`dashboard.loopStatus.${loop.status}`) || loop.status}`}
              </span>
              <button type="button" className="phone__loop-stop" onClick={disarm} disabled={busy}>
                ■ {t('dashboard.loopDisarm')}
              </button>
            </div>
          )}

          {/* One-step Resume (openspec: advance-queue-loop, D3): a stopped
              queue with remainder re-activates in place — same instance, same
              sent-history, fresh iteration budget, drives from the current
              stash head. Gated action: 403 renders the gate hint like Arm. */}
          {resumable && (
            <div className="phone__loop-resume">
              <span className="phone__loop-resume-k">
                {t('dashboard.loopResumeLabel', { n: loop.queueRemaining ?? 0 })}
              </span>
              <button type="button" className="phone__loop-arm" onClick={resume} disabled={busy}>
                ▶ {t('dashboard.loopResume')}
              </button>
            </div>
          )}

          {/* Live decision readout (fix-suggestion-loop-inert, D3): what the
              engine last decided for this armed instance and why. The decision
              WORD is always in the ungated projection; the reason arrives only
              while the operator gate is open (same rule as the pending prompt),
              so gate-closed shows the word alone. */}
          {armed && loop.decision && (
            <div className="phone__loop-decision">
              <span className={`phone__loop-decision-word phone__loop-decision-word--${loop.decision}`}>
                {t(`dashboard.loopDecision.${loop.decision}`)}
              </span>
              {loop.decisionReason && (
                <span className="phone__loop-decision-reason" title={loop.decisionReason}>
                  {loop.decisionReason}
                </span>
              )}
            </div>
          )}

          {/* Pending suggestion (suggest mode): the loop's decided next prompt,
              waiting for the human — one action puts it in the composer. With a
              below-threshold near-miss now pending too (D1), the chip shows the
              brain's honest confidence for suggestion-kind pendings. */}
          {armed && loop.pendingPrompt && (
            <div className="phone__loop-pending">
              <div className="phone__loop-pending-k">
                {t('dashboard.loopPendingLabel')}
                {loop.kind === 'suggestion' && typeof loop.decisionConfidence === 'number' && loop.decisionConfidence > 0 && (
                  <span className="phone__loop-pending-conf">
                    {t('dashboard.loopPendingConfidence', { pct: Math.round(loop.decisionConfidence * 100) })}
                  </span>
                )}
              </div>
              <pre className="phone__loop-inspect-pre">{loop.pendingPrompt}</pre>
              <button
                type="button"
                className="phone__loop-use"
                onClick={() => { onUsePending?.(loop.pendingPrompt); setOpen(false); }}
              >
                {t('dashboard.loopUsePending')}
              </button>
            </div>
          )}

          {/* Type picker: one choice, then its parameters */}
          <div className="phone__loop-types" role="radiogroup" aria-label={t('dashboard.loopTypeAria')}>
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={selected === k}
                className={`phone__loop-type${selected === k ? ' phone__loop-type--on' : ''}`}
                onClick={() => { setPicked(k); setInspect(false); }}
              >
                {EMOJI[k]} {kindName(k)}
              </button>
            ))}
          </div>
          {/* Parameters for the selected type (arming only — an armed instance
              keeps its own stored copies) */}
          {selected === 'recipe' && armedKind !== 'recipe' && (
            recipes.length === 0 ? (
              <div className="phone__loop-msg">{t('dashboard.loopNoRecipes')}</div>
            ) : (
              <div className="phone__loop-recipes" role="radiogroup" aria-label={t('dashboard.loopRecipe')}>
                {recipes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={chosenRecipe?.id === r.id}
                    className={`phone__loop-recipe${chosenRecipe?.id === r.id ? ' phone__loop-recipe--on' : ''}`}
                    onClick={() => setRecipeId(r.id)}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )
          )}
          {selected === 'goal' && armedKind !== 'goal' && (
            <textarea
              className="phone__loop-goal"
              rows={3}
              value={goal}
              placeholder={t('dashboard.loopGoalPlaceholder')}
              onChange={(e) => setGoal(e.target.value)}
            />
          )}
          {/* Queue parameters: the queue ITSELF is the stash strip below the
              composer — here only the next-up preview, the live count, and the
              per-step verification toggle (default on). Arming an empty queue
              is refused server-side too; the hint teaches instead of failing. */}
          {selected === 'queue' && armedKind !== 'queue' && (
            stash.length === 0 ? (
              <div className="phone__loop-msg">{t('dashboard.loopQueueEmpty')}</div>
            ) : (
              <div className="phone__loop-queue">
                {/* Binding line (openspec: advance-queue-loop, D5): name the
                    drive target and the immediate consequence BEFORE the arm
                    click — the wrong-tab arm of 2026-07-31 had nothing here. */}
                <div className="phone__loop-bind">
                  {t('dashboard.loopQueueBindLine', { repo: repoName || repoId, n: stash.length })}
                </div>
                <p className="phone__loop-sect-desc">{t('dashboard.loopQueueFiresNote')}</p>
                {/* Full unload-order preview (openspec: queue-loop-visibility,
                    D4): every stash item, numbered top-down — the live stash
                    prop, so reordering the strip reorders this list. */}
                <div className="phone__loop-inspect-k">
                  {t('dashboard.loopQueueOrder')}
                  <span className="phone__loop-queue-count">
                    {t('dashboard.loopQueueCount', { n: stash.length })}
                  </span>
                </div>
                <ol className="phone__loop-queue-list">
                  {stash.map((s) => (
                    <li key={s.id} className="phone__loop-queue-item">{s.text}</li>
                  ))}
                </ol>
                <label className="phone__loop-verifytoggle">
                  <input
                    type="checkbox"
                    checked={verifyOn}
                    onChange={(e) => setVerifyPick(e.target.checked)}
                  />
                  {t('dashboard.loopQueueVerify')}
                </label>
                <p className="phone__loop-sect-desc">
                  {t(verifyOn ? 'dashboard.loopQueueVerifyHint' : 'dashboard.loopQueueVerifyOffHint')}
                </p>
                {/* Per-arm deny-list (openspec: advance-queue-loop, D2): the
                    global default terms as removable chips. Dropping a term
                    ("push" on a commit-and-push repo) applies to THIS arm only;
                    the global default is untouched. Chips need the gated
                    detail — gate closed shows the hint instead. */}
                {denyDefault.length > 0 ? (
                  <>
                    <div className="phone__loop-inspect-k">{t('dashboard.loopDenyLabel')}</div>
                    <div className="phone__loop-denychips">
                      {denyDefault.map((term) => {
                        const dropped = denyDropped.includes(term);
                        return (
                          <button
                            key={term}
                            type="button"
                            className={`phone__loop-denychip${dropped ? ' phone__loop-denychip--off' : ''}`}
                            title={t(dropped ? 'dashboard.loopDenyRestore' : 'dashboard.loopDenyDrop')}
                            onClick={() => setDenyDropped((prev) =>
                              dropped ? prev.filter((x) => x !== term) : [...prev, term])}
                          >
                            {term}{dropped ? '' : ' ×'}
                          </button>
                        );
                      })}
                    </div>
                    {denyDropped.length > 0 && (
                      <p className="phone__loop-sect-desc">
                        {t('dashboard.loopDenyTrimmed', { terms: denyDropped.join(', ') })}
                      </p>
                    )}
                  </>
                ) : (detail === 'gate-closed' && (
                  <p className="phone__loop-sect-desc">{t('dashboard.loopDenyGateClosed')}</p>
                ))}
              </div>
            )
          )}

          {/* Prompt inspection (gated detail) */}
          {selected !== 'suggestion' && (
            <button
              type="button"
              className="phone__loop-inspect-toggle"
              onClick={() => setInspect((v) => !v)}
            >
              {inspect ? t('dashboard.loopInspectHide') : t('dashboard.loopInspectShow')}
            </button>
          )}
          {selected !== 'suggestion' && inspect && renderInspection()}

          {/* Arm row (hidden when the selected type IS the armed one — the
              header's Disarm is the action there) */}
          {armedKind !== selected && (
            <div className="phone__loop-armrow">
              {(selected === 'recipe' || selected === 'goal' || selected === 'queue') && (
                <label className="phone__loop-cap">
                  {t('dashboard.loopCap')}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={cap}
                    // Queue placeholder = 2× the queued items: with verification
                    // on, every item costs a step turn PLUS a verify turn.
                    placeholder={selected === 'queue'
                      ? String(Math.max(stash.length * 2, 2))
                      : selected === 'recipe' && chosenRecipe ? String(chosenRecipe.maxIterations) : '10'}
                    onChange={(e) => setCap(e.target.value)}
                  />
                </label>
              )}
              <button
                type="button"
                className="phone__loop-arm"
                onClick={arm}
                disabled={busy
                  || (selected === 'recipe' && !chosenRecipe)
                  || (selected === 'goal' && !goal.trim())
                  || (selected === 'queue' && (!tabId || stash.length === 0))}
              >
                {busy ? t('dashboard.loopArming') : t('dashboard.loopArm')}
              </button>
            </div>
          )}
          {armed && armedKind !== selected && (
            <div className="phone__loop-replace">
              {t('dashboard.loopReplaces', { mode: kindName(armedKind) })}
            </div>
          )}

          {/* Copy-for-debugging: always offered — terminal and even missing
              loop states are exactly when the user needs to hand this to an
              agent ("here is what my loop did"). */}
          <button
            type="button"
            className="phone__loop-debugcopy"
            onClick={copyDebug}
            disabled={dbg.phase === 'busy'}
          >
            {dbg.phase === 'copied' ? `✓ ${t('dashboard.loopDebugCopied')}` : `⧉ ${t('dashboard.loopDebugCopy')}`}
          </button>
          {dbg.phase === 'error' && (
            <div className="phone__loop-msg phone__loop-msg--err" role="status">
              {t('dashboard.loopDebugFailed')}
            </div>
          )}
          {dbg.phase === 'manual' && (
            <textarea
              readOnly
              className="phone__loop-debug-manual"
              rows={6}
              value={dbg.text}
              onFocus={(e) => e.target.select()}
            />
          )}

          {/* The one pointer to the relocated reference copy (openspec:
              dock-loop-controls-declutter, D4) — the popover itself is
              controls-only, prose lives in the console. */}
          <p className="phone__loop-sect-desc">{t('dashboard.loopMoreInfo')}</p>
        </div>
      )}
    </div>
  );

  // ---- inspection pane content for the selected type ----
  function renderInspection() {
    if (detail === 'gate-closed' || detail === null) {
      return <div className="phone__loop-msg phone__loop-msg--gate">{t('dashboard.loopGateClosed')}</div>;
    }
    if (selected === 'queue') {
      // Queue inspection: the verification template the engine composes from
      // (prompt text — gated detail only) and, once a step has landed, the
      // last unloaded step it would verify against.
      const mine = detail.loops?.find((l) => l.repoId === repoId);
      return (
        <div className="phone__loop-inspect">
          {/* Per-arm deny-list disclosure (advance-queue-loop, D2): only shown
              when this instance carries a trim — null means the global default. */}
          {mine?.denyList != null && (
            <>
              <div className="phone__loop-inspect-k">{t('dashboard.loopDenyEffectiveLabel')}</div>
              <pre className="phone__loop-inspect-pre">
                {mine.denyList.length > 0 ? mine.denyList.join(', ') : t('dashboard.loopDenyNone')}
              </pre>
            </>
          )}
          <div className="phone__loop-inspect-k">{t('dashboard.loopQueueVerifyTplLabel')}</div>
          <pre className="phone__loop-inspect-pre">{detail.queueVerifyTemplate || '—'}</pre>
          {mine?.lastStepText && (
            <>
              <div className="phone__loop-inspect-k">{t('dashboard.loopQueueLastStepLabel')}</div>
              <pre className="phone__loop-inspect-pre">{mine.lastStepText}</pre>
            </>
          )}
          {/* Sent-history (openspec: queue-loop-visibility, D3): the step texts
              that actually landed this arm, oldest first — labeled honestly as
              the last N when the bound has dropped older ones. */}
          {mine?.queueSentTexts?.length > 0 && (
            <>
              <div className="phone__loop-inspect-k">
                {t('dashboard.loopQueueSentLabel')}
                {(mine.queueSent ?? 0) > mine.queueSentTexts.length && (
                  <span className="phone__loop-queue-count">
                    {t('dashboard.loopQueueSentPartial', { n: mine.queueSentTexts.length })}
                  </span>
                )}
              </div>
              <ol className="phone__loop-sent-list">
                {mine.queueSentTexts.map((s, i) => (
                  <li key={i} className="phone__loop-sent-row">{s}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      );
    }
    if (selected === 'recipe') {
      const armedRecipeLoop = armedKind === 'recipe'
        ? detail.loops?.find((l) => l.repoId === repoId) : null;
      const text = armedRecipeLoop?.prompt
        ?? detail.recipes?.find((r) => r.id === chosenRecipe?.id)?.prompt;
      return (
        <div className="phone__loop-inspect">
          <div className="phone__loop-inspect-k">{t('dashboard.loopPromptLabel')}</div>
          <pre className="phone__loop-inspect-pre">{text || '—'}</pre>
        </div>
      );
    }
    // goal: the armed loop's STORED prompts if one is armed, else a live
    // preview composed from the server's templates and the typed goal.
    const armedGoalLoop = armedKind === 'goal'
      ? detail.loops?.find((l) => l.repoId === repoId) : null;
    const g = armedGoalLoop?.goal ?? (goal.trim() || t('dashboard.loopGoalPlaceholderShort'));
    const work = armedGoalLoop?.prompt ?? detail.goalTemplates?.work?.replace('{0}', g);
    const verify = armedGoalLoop?.verifyPrompt ?? detail.goalTemplates?.verify?.replace('{0}', g);
    return (
      <div className="phone__loop-inspect">
        <div className="phone__loop-inspect-k">{t('dashboard.loopWorkPromptLabel')}</div>
        <pre className="phone__loop-inspect-pre">{work || '—'}</pre>
        <div className="phone__loop-inspect-k">{t('dashboard.loopVerifyPromptLabel')}</div>
        <pre className="phone__loop-inspect-pre">{verify || '—'}</pre>
      </div>
    );
  }
}
