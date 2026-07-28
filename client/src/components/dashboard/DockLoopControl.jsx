import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';

// THE loop section on the agent dock card (openspec: unify-loop-types, revision 2).
// One mental model, spoken plainly by the UI: this agent has (at most) ONE loop
// instance — kind 💡 suggestion / 📋 recipe / 🎯 goal — that is armed or not, and
// runs in one of two MODES: "suggest" (its decided next prompt only pre-fills the
// chat composer, as a pending suggestion) or "drive" (it actually sends, capped).
//
// The collapsed header names the instance's type + armed state + mode; expanding
// shows the type picker, the selected type's parameters, the common mode toggle,
// prompt inspection, the pending suggestion (with a put-in-textbox action via
// onUsePending), and Arm / one Disarm. Arming any type replaces the slot
// server-side (exclusive by construction), stated up front before the click.
//
// Two disclosure tiers feed it: badge/status data (kind, mode, phase, counts, and
// — only while the gate is open — the pending prompt) comes from the read-only,
// non-operator-gated GET /api/autopilot/loops (polled by the Dashboard and passed
// down) so terminal states stay honest after the gate closes; prompt INSPECTION
// fetches the gated GET /api/autopilot/loops/detail on open — a 403 renders the
// explicit gate-closed hint in place of prompt text. Actions go through the fully
// gated endpoints; a 403 there shows the same hint.
const KINDS = ['suggestion', 'recipe', 'goal'];
const EMOJI = { suggestion: '💡', recipe: '📋', goal: '🎯' };

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

export default function DockLoopControl({ repoId, sessionId, loop, recipes = [], onChanged, onUsePending }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const [pickedMode, setPickedMode] = useState(null);
  const [recipeId, setRecipeId] = useState(recipes[0]?.id || '');
  const [cap, setCap] = useState('');
  const [goal, setGoal] = useState('');
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
        const mine = d?.loops?.find((l) => l.repoId === repoId);
        if (!mine) return;
        if (mine.goal) setGoal((g) => g || mine.goal);
        if (mine.maxIterations > 0) setCap((c) => (c === '' ? String(mine.maxIterations) : c));
        if (!mine.active && mine.mode) setPickedMode((m) => m ?? mine.mode);
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
  const arm = () => {
    if (selected === 'suggestion') {
      return act('/autopilot/loop', { repoId, action: 'start', kind: 'suggestion', mode });
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
  const verifying = loop?.kind === 'goal' && loop?.phase === 'verify';
  const capText = loop?.maxIterations > 0 ? `${loop.iterationsDone}/${loop.maxIterations}` : `${loop?.iterationsDone ?? 0}`;
  const summary = loop
    ? (armed
      ? `${EMOJI[loop.kind]} ${kindName(loop.kind)} · ${t('dashboard.loopArmedWord')} · ${modeName(loop.mode)}${loop.kind === 'suggestion' ? '' : ` · ${capText}`}${verifying ? ` · ${t('dashboard.loopVerifying')}` : ''}`
      : `${EMOJI[loop.kind]} ${kindName(loop.kind)} · ${t(`dashboard.loopStatus.${loop.status}`) || loop.status}`)
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
      </div>
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
                  : `${modeName(loop.mode)} · ${capText} · ${verifying ? t('dashboard.loopVerifying') : t(`dashboard.loopStatus.${loop.status}`) || loop.status}`}
              </span>
              <button type="button" className="phone__loop-stop" onClick={disarm} disabled={busy}>
                ■ {t('dashboard.loopDisarm')}
              </button>
            </div>
          )}

          {/* Pending suggestion (suggest mode): the loop's decided next prompt,
              waiting for the human — one action puts it in the composer. */}
          {armed && loop.pendingPrompt && (
            <div className="phone__loop-pending">
              <div className="phone__loop-pending-k">{t('dashboard.loopPendingLabel')}</div>
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
          <p className="phone__loop-sect-desc">{t(`dashboard.loopDesc.${selected}`)}</p>

          {/* The common mode axis: suggest (pre-fill only) vs drive (send). Flips
              the live instance in place; otherwise it's part of the arm request. */}
          <div className="phone__loop-modes" role="radiogroup" aria-label={t('dashboard.loopModeAria')}>
            {['suggest', 'drive'].map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={busy}
                className={`phone__loop-mode${mode === m ? ' phone__loop-mode--on' : ''}`}
                onClick={() => (armedKind === selected ? setLiveMode(m) : setPickedMode(m))}
              >
                {modeName(m)}
              </button>
            ))}
          </div>
          <p className="phone__loop-sect-desc">{t(`dashboard.loopModeHint.${mode}`)}</p>

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
              {(selected === 'recipe' || selected === 'goal') && (
                <label className="phone__loop-cap">
                  {t('dashboard.loopCap')}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={cap}
                    placeholder={selected === 'recipe' && chosenRecipe ? String(chosenRecipe.maxIterations) : '10'}
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
                  || (selected === 'goal' && !goal.trim())}
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
        </div>
      )}
    </div>
  );

  // ---- inspection pane content for the selected type ----
  function renderInspection() {
    if (detail === 'gate-closed' || detail === null) {
      return <div className="phone__loop-msg phone__loop-msg--gate">{t('dashboard.loopGateClosed')}</div>;
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
