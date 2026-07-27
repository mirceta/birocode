import { useEffect, useState } from 'react';
import { apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';

// Loop control on the agent dock card (openspec adopt-autopilot-loops +
// align-dock-loop-model): the one-tap way to drive an agent with autopilot from
// where the work is. The popover mirrors the console's loop-type mental model as
// two labeled sections — 💡 Suggestion-based loop (arm/disarm THIS agent for the
// idle-watcher that suggests/auto-sends routine prompts) and 🎯 Goal-based loop
// (arm a fixed goal prompt from a named RECIPE, cap tweakable, or stop the active
// one) — so a recipe name like "Drive the feature" is never shown without its
// loop type. The queue-based loop has no section: it doesn't exist yet.
//
// The badge row is typed the same way: 🎯 for the goal loop (looping n/cap ·
// done · escalated · capped · error · stopped — escalated carrying the agent's
// NEEDS_HUMAN question) and a 💡 marker while the agent is suggestion-armed.
//
// All badge/state data comes from the read-only, non-operator-gated
// GET /api/autopilot/loops (polled by the Dashboard and passed down), so it
// stays honest after the gate closes. ACTIONS still go through the fully gated
// endpoints (/autopilot/loop, /autopilot/config) — a 403 renders the explicit
// "operator gate is closed" hint instead of failing mutely.
export default function DockLoopControl({ repoId, loop, recipes = [], suggestion, onChanged }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState(recipes[0]?.id || '');
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);
  const [gateHint, setGateHint] = useState(false);
  const [err, setErr] = useState('');

  const active = !!loop?.active;
  const chosen = recipes.find((r) => r.id === recipeId) || recipes[0] || null;
  const suggArmed = !!suggestion?.armed;

  // Close the popover when the goal loop's live state visibly flips
  // (armed/stopped) — the action's own setOpen can lose a race with the poll
  // re-render because the arm POST's response is slow (it rebuilds the full
  // autopilot state).
  useEffect(() => { setOpen(false); }, [active]);

  // `close` distinguishes the goal-loop arm/stop (popover done, close it) from
  // the suggestion toggle (leave it open so the state flip is visible in place).
  const act = async (path, body, { close = true } = {}) => {
    setBusy(true);
    setGateHint(false);
    setErr('');
    try {
      await apiPost(path, body);
      if (close) setOpen(false);
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

  const armGoal = () => {
    if (!chosen) return;
    const capNum = Number(cap);
    act('/autopilot/loop', {
      repoId,
      action: 'start',
      recipeId: chosen.id,
      maxIterations: capNum >= 1 ? capNum : undefined,
    });
  };

  const stopGoal = () => act('/autopilot/loop', { repoId, action: 'stop' });

  // Suggestion arming is the console Control subtab's per-agent switch, reached
  // from the dock: the same gated config mutation.
  const toggleSuggest = () =>
    act('/autopilot/config', { repoId, armed: !suggArmed }, { close: false });

  // Suggestion state, one line: not armed / suggest-only / auto-advance.
  const suggState = suggArmed
    ? (suggestion?.autoAdvance ? t('dashboard.loopSuggestOnAuto') : t('dashboard.loopSuggestOnSuggest'))
    : t('dashboard.loopSuggestOff');

  // Badge row: each loop type carries its own marker. Goal loop shows iteration
  // progress while looping, the terminal state afterwards; an escalated loop
  // carries the stop detail (the NEEDS_HUMAN question / deny hit) as its
  // tooltip so the glance answers "what does it want".
  const goalBadge = loop && (
    <span
      className={`loop-badge loop-badge--${loop.status}`}
      title={[loop.recipeName, loop.stopDetail].filter(Boolean).join(' — ')}
    >
      {active
        ? `🎯 ${loop.iterationsDone}/${loop.maxIterations}`
        : `🎯 ${t(`dashboard.loopStatus.${loop.status}`) || loop.status}`}
    </span>
  );
  const suggBadge = suggArmed && (
    <span className="loop-badge loop-badge--sugg" title={suggState}>
      💡
    </span>
  );

  return (
    <div className="phone__loop">
      <div className="phone__loop-row">
        {suggBadge}
        {goalBadge}
        {loop?.status === 'escalate' && loop.stopDetail && (
          <span className="phone__loop-question" title={loop.stopDetail}>
            {loop.stopDetail}
          </span>
        )}
        <button
          type="button"
          className={`phone__loop-btn${open ? ' phone__loop-btn--on' : ''}`}
          onClick={() => setOpen((v) => !v)}
          title={t('dashboard.loopHint')}
        >
          {loop || suggArmed ? '⟳' : `⟳ ${t('dashboard.loop')}`}
        </button>
      </div>
      {open && (
        <div className="phone__loop-pop">
          {/* 💡 Suggestion-based loop — same grouping + emoji as the console nav */}
          <section className="phone__loop-section">
            <h4 className="phone__loop-sect-head">💡 {t('dashboard.loopSuggestTitle')}</h4>
            <p className="phone__loop-sect-desc">{t('dashboard.loopSuggestDesc')}</p>
            <div className="phone__loop-armrow">
              <span className={`phone__loop-sugg-state${suggArmed ? ' phone__loop-sugg-state--on' : ''}`}>
                {suggState}
              </span>
              <button
                type="button"
                className={suggArmed ? 'phone__loop-stop' : 'phone__loop-arm'}
                onClick={toggleSuggest}
                disabled={busy}
              >
                {busy
                  ? t('dashboard.loopArming')
                  : suggArmed ? t('dashboard.loopSuggestDisarm') : t('dashboard.loopSuggestArm')}
              </button>
            </div>
          </section>

          {/* 🎯 Goal-based loop — the recipe picker, framed by its loop type */}
          <section className="phone__loop-section">
            <h4 className="phone__loop-sect-head">🎯 {t('dashboard.loopGoalTitle')}</h4>
            <p className="phone__loop-sect-desc">{t('dashboard.loopGoalDesc')}</p>
            {active ? (
              <button type="button" className="phone__loop-stop" onClick={stopGoal} disabled={busy}>
                ■ {t('dashboard.loopStop')}
              </button>
            ) : recipes.length === 0 ? (
              <div className="phone__loop-msg">{t('dashboard.loopNoRecipes')}</div>
            ) : (
              <>
                <div className="phone__loop-recipes-label">{t('dashboard.loopRecipesLabel')}</div>
                <div className="phone__loop-recipes" role="radiogroup" aria-label={t('dashboard.loopRecipe')}>
                  {recipes.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={chosen?.id === r.id}
                      className={`phone__loop-recipe${chosen?.id === r.id ? ' phone__loop-recipe--on' : ''}`}
                      onClick={() => setRecipeId(r.id)}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
                <div className="phone__loop-armrow">
                  <label className="phone__loop-cap">
                    {t('dashboard.loopCap')}
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={cap}
                      placeholder={chosen ? String(chosen.maxIterations) : ''}
                      onChange={(e) => setCap(e.target.value)}
                    />
                  </label>
                  <button type="button" className="phone__loop-arm" onClick={armGoal} disabled={busy || !chosen}>
                    {busy ? t('dashboard.loopArming') : t('dashboard.loopArm')}
                  </button>
                </div>
              </>
            )}
          </section>

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
}
