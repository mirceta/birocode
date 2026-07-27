import { useEffect, useState } from 'react';
import { apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';

// Loop control on the agent dock card (openspec adopt-autopilot-loops): the
// one-tap way to arm an autopilot loop where the work is, instead of composing
// one in the Autopilot tab. Shows a live loop badge (looping n/cap · done ·
// escalated · capped · error · stopped — escalated visually distinct, carrying
// the agent's NEEDS_HUMAN question) and a popover that arms a loop from a named
// RECIPE (cap tweakable) or stops the active one.
//
// The badge data comes from the read-only, non-operator-gated
// GET /api/autopilot/loops (polled by the Dashboard and passed down), so a
// loop's terminal state stays visible after the gate closes. ACTIONS still go
// through the fully gated POST /api/autopilot/loop — a 403 renders the explicit
// "operator gate is closed" hint instead of failing mutely.
export default function DockLoopControl({ repoId, loop, recipes = [], onChanged }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState(recipes[0]?.id || '');
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);
  const [gateHint, setGateHint] = useState(false);
  const [err, setErr] = useState('');

  const active = !!loop?.active;
  const chosen = recipes.find((r) => r.id === recipeId) || recipes[0] || null;

  // Close the popover when the loop's live state visibly flips (armed/stopped)
  // — the action's own setOpen can lose a race with the poll re-render because
  // the arm POST's response is slow (it rebuilds the full autopilot state).
  useEffect(() => { setOpen(false); }, [active]);

  const act = async (body) => {
    setBusy(true);
    setGateHint(false);
    setErr('');
    try {
      await apiPost('/autopilot/loop', body);
      setOpen(false);
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

  const arm = () => {
    if (!chosen) return;
    const capNum = Number(cap);
    act({
      repoId,
      action: 'start',
      recipeId: chosen.id,
      maxIterations: capNum >= 1 ? capNum : undefined,
    });
  };

  const stop = () => act({ repoId, action: 'stop' });

  // Badge: iteration progress while looping, the terminal state afterwards. An
  // escalated loop carries the stop detail (the NEEDS_HUMAN question / deny hit)
  // as its tooltip so the glance answers "what does it want".
  const badge = loop && (
    <span
      className={`loop-badge loop-badge--${loop.status}`}
      title={[loop.recipeName, loop.stopDetail].filter(Boolean).join(' — ')}
    >
      {active
        ? `⟳ ${loop.iterationsDone}/${loop.maxIterations}`
        : t(`dashboard.loopStatus.${loop.status}`) || loop.status}
    </span>
  );

  return (
    <div className="phone__loop">
      <div className="phone__loop-row">
        {badge}
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
          {loop ? '⟳' : `⟳ ${t('dashboard.loop')}`}
        </button>
      </div>
      {open && (
        <div className="phone__loop-pop">
          {active ? (
            <button type="button" className="phone__loop-stop" onClick={stop} disabled={busy}>
              ■ {t('dashboard.loopStop')}
            </button>
          ) : recipes.length === 0 ? (
            <div className="phone__loop-msg">{t('dashboard.loopNoRecipes')}</div>
          ) : (
            <>
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
                <button type="button" className="phone__loop-arm" onClick={arm} disabled={busy || !chosen}>
                  {busy ? t('dashboard.loopArming') : t('dashboard.loopArm')}
                </button>
              </div>
            </>
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
}
