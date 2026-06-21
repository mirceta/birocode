import { useState } from 'react';
import { useT } from '../../i18n/LanguageContext';

// The "Plans" tab of the ⚙ modal (plans/prompt-plans.md). A PLAN is a named,
// ordered list of prompt STEPS; each step has a name, a details body, and an
// expected result. Steps are reorderable (order = the send sequence) and "Use"
// on a step composes its details + expected result into the composer.
//
// Every mutation persists the WHOLE plan (name + full step array) via onUpdatePlan
// — the backend replaces the step list with what we send, so reorder/edit/delete
// are all just "send the new array". Plans are global + backend-synced (parent
// passes them in from PromptPlansContext), exactly like the prompts tab.

// Compose the text a step drops into the composer: the details, then the expected
// result under a labelled line (so what gets sent carries the expectation).
function composeStep(step, expectedLabel) {
  const details = (step.details || '').trim();
  const expected = (step.expected || '').trim();
  if (!expected) return details;
  if (!details) return `${expectedLabel}\n${expected}`;
  return `${details}\n\n${expectedLabel}\n${expected}`;
}

// Nice-to-have: split a pasted block into steps. Each step starts at a line
// beginning with "PROMPT:" (the step name); within a step, "DETAILS:" and
// "EXPECTED RESULT:" markers (case-insensitive) carve out the two bodies. Text
// before any marker after PROMPT falls into details. Forgiving: missing markers
// just leave those fields empty.
function parsePlanSteps(raw) {
  const lines = (raw || '').replace(/\r\n/g, '\n').split('\n');
  const steps = [];
  let cur = null;
  let section = null; // 'details' | 'expected' | null
  const push = () => { if (cur) steps.push(cur); };
  for (const line of lines) {
    const m = line.match(/^\s*(prompt|details|expected result|expected)\s*:\s*(.*)$/i);
    if (m) {
      const key = m[1].toLowerCase();
      const rest = m[2];
      if (key === 'prompt') {
        push();
        cur = { name: rest.trim(), details: '', expected: '' };
        section = null;
        continue;
      }
      if (!cur) cur = { name: '', details: '', expected: '' };
      if (key === 'details') { section = 'details'; cur.details = rest; continue; }
      // 'expected result' or 'expected'
      section = 'expected'; cur.expected = rest; continue;
    }
    if (!cur) continue; // skip preamble before the first marker
    if (section === 'expected') cur.expected += (cur.expected ? '\n' : '') + line;
    else { cur.details += (cur.details ? '\n' : '') + line; section = section || 'details'; }
  }
  push();
  // Trim and drop fully-empty steps.
  return steps
    .map((s) => ({ name: s.name.trim(), details: s.details.trim(), expected: s.expected.trim() }))
    .filter((s) => s.name || s.details || s.expected);
}

const EMPTY_STEP = { name: '', details: '', expected: '' };

export default function PromptPlansPanel({ plans, onAddPlan, onUpdatePlan, onDeletePlan, onUse }) {
  const { t } = useT();
  const expectedLabel = t('plans.expectedPrefix');

  const [selectedId, setSelectedId] = useState(null);
  const [newPlanName, setNewPlanName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Step add/edit form. stepIndex === null → form hidden; -1 → adding new.
  const [stepIndex, setStepIndex] = useState(null);
  const [step, setStep] = useState(EMPTY_STEP);

  // Paste-to-split box.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const selected = plans.find((p) => p.id === selectedId) || null;

  function resetStepForm() {
    setStepIndex(null);
    setStep(EMPTY_STEP);
    setError('');
  }

  async function persistSteps(steps) {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await onUpdatePlan(selected.id, selected.name, steps);
    } catch {
      setError(t('plans.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function createPlan(e) {
    e.preventDefault();
    const name = newPlanName.trim();
    if (!name) { setError(t('plans.nameRequired')); return; }
    setBusy(true);
    setError('');
    try {
      const p = await onAddPlan(name, []);
      setNewPlanName('');
      setSelectedId(p.id);
      resetStepForm();
    } catch {
      setError(t('plans.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function renamePlan(name) {
    if (!selected) return;
    const clean = name.trim();
    if (!clean) return; // ignore empty rename; keep the old name
    try {
      await onUpdatePlan(selected.id, clean, selected.steps || []);
    } catch {
      setError(t('plans.saveError'));
    }
  }

  async function removePlan(id) {
    try {
      await onDeletePlan(id);
      if (selectedId === id) { setSelectedId(null); resetStepForm(); }
    } catch {
      setError(t('plans.saveError'));
    }
  }

  function startAddStep() {
    setStepIndex(-1);
    setStep(EMPTY_STEP);
    setError('');
  }

  function startEditStep(i) {
    setStepIndex(i);
    setStep({ ...EMPTY_STEP, ...(selected.steps[i] || {}) });
    setError('');
  }

  async function saveStep(e) {
    e.preventDefault();
    const clean = {
      name: step.name.trim(),
      details: step.details.trim(),
      expected: step.expected.trim(),
    };
    if (!clean.name && !clean.details && !clean.expected) {
      setError(t('plans.stepEmpty'));
      return;
    }
    const steps = [...(selected.steps || [])];
    if (stepIndex === -1) steps.push(clean);
    else steps[stepIndex] = clean;
    await persistSteps(steps);
    resetStepForm();
  }

  async function deleteStep(i) {
    const steps = (selected.steps || []).filter((_, idx) => idx !== i);
    await persistSteps(steps);
    if (stepIndex === i) resetStepForm();
  }

  async function moveStep(i, dir) {
    const steps = [...(selected.steps || [])];
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    await persistSteps(steps);
  }

  async function applyPaste() {
    const parsed = parsePlanSteps(pasteText);
    if (!parsed.length) { setError(t('plans.pasteEmpty')); return; }
    const steps = [...(selected.steps || []), ...parsed];
    await persistSteps(steps);
    setPasteText('');
    setPasteOpen(false);
  }

  // ---- LIST VIEW (no plan selected) ----
  if (!selected) {
    return (
      <div className="plan-mgr">
        {plans.length === 0 && <p className="prompt-mgr__empty">{t('plans.empty')}</p>}
        <ul className="prompt-mgr__list">
          {plans.map((p) => (
            <li key={p.id} className="prompt-mgr__item plan-mgr__row">
              <button
                type="button"
                className="plan-mgr__open"
                onClick={() => { setSelectedId(p.id); resetStepForm(); }}
              >
                <span className="prompt-mgr__item-label">{p.name}</span>
                <span className="plan-mgr__count">{t('plans.stepCount', { n: (p.steps || []).length })}</span>
              </button>
              <div className="prompt-mgr__item-actions">
                <button type="button" className="prompt-mgr__item-btn" onClick={() => removePlan(p.id)}>
                  {t('plans.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <p className="prompt-mgr__formhint">{t('plans.newHint')}</p>
        <form className="prompt-mgr__form" onSubmit={createPlan}>
          <input
            className="prompt-mgr__label-input"
            type="text"
            placeholder={t('plans.namePlaceholder')}
            value={newPlanName}
            onChange={(e) => setNewPlanName(e.target.value)}
          />
          {error && <p className="prompt-mgr__error" role="alert">{error}</p>}
          <div className="prompt-mgr__actions">
            <button type="submit" className="prompt-mgr__save" disabled={busy || !newPlanName.trim()}>
              {t('plans.create')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---- PLAN EDITOR (a plan is selected) ----
  const steps = selected.steps || [];
  return (
    <div className="plan-mgr">
      <div className="plan-mgr__editor-head">
        <button type="button" className="plan-mgr__back" onClick={() => { setSelectedId(null); resetStepForm(); }}>
          &larr; {t('plans.back')}
        </button>
        <input
          className="plan-mgr__name-input"
          type="text"
          defaultValue={selected.name}
          aria-label={t('plans.namePlaceholder')}
          onBlur={(e) => renamePlan(e.target.value)}
        />
      </div>

      {steps.length === 0 && <p className="prompt-mgr__empty">{t('plans.noSteps')}</p>}
      <ol className="plan-mgr__steps">
        {steps.map((s, i) => (
          <li key={i} className="plan-mgr__step">
            <div className="plan-mgr__step-num">{i + 1}</div>
            <div className="plan-mgr__step-main">
              {s.name && <span className="prompt-mgr__item-label">{s.name}</span>}
              {s.details && <span className="prompt-mgr__item-text">{s.details}</span>}
              {s.expected && (
                <span className="plan-mgr__step-expected">
                  <em>{t('plans.expectedPrefix')}</em> {s.expected}
                </span>
              )}
            </div>
            <div className="prompt-mgr__item-actions">
              <button
                type="button"
                className="prompt-mgr__item-btn prompt-mgr__item-use"
                onClick={() => onUse(composeStep(s, expectedLabel))}
              >
                {t('plans.use')}
              </button>
              <div className="plan-mgr__reorder">
                <button type="button" className="prompt-mgr__item-btn" disabled={i === 0 || busy} onClick={() => moveStep(i, -1)} aria-label={t('plans.moveUp')}>↑</button>
                <button type="button" className="prompt-mgr__item-btn" disabled={i === steps.length - 1 || busy} onClick={() => moveStep(i, 1)} aria-label={t('plans.moveDown')}>↓</button>
              </div>
              <button type="button" className="prompt-mgr__item-btn" onClick={() => startEditStep(i)}>{t('plans.edit')}</button>
              <button type="button" className="prompt-mgr__item-btn" onClick={() => deleteStep(i)}>{t('plans.delete')}</button>
            </div>
          </li>
        ))}
      </ol>

      {stepIndex === null ? (
        <div className="plan-mgr__editor-actions">
          <button type="button" className="prompt-mgr__item-btn prompt-mgr__item-use" onClick={startAddStep}>
            + {t('plans.addStep')}
          </button>
          <button type="button" className="prompt-mgr__item-btn" onClick={() => { setPasteOpen((o) => !o); setError(''); }}>
            {t('plans.pasteToggle')}
          </button>
        </div>
      ) : (
        <form className="prompt-mgr__form" onSubmit={saveStep}>
          <p className="prompt-mgr__formhint">{stepIndex === -1 ? t('plans.addStep') : t('plans.editStep')}</p>
          <input
            className="prompt-mgr__label-input"
            type="text"
            placeholder={t('plans.stepNamePlaceholder')}
            value={step.name}
            onChange={(e) => setStep((s) => ({ ...s, name: e.target.value }))}
          />
          <textarea
            className="prompt-mgr__text-input"
            placeholder={t('plans.stepDetailsPlaceholder')}
            rows={3}
            value={step.details}
            onChange={(e) => setStep((s) => ({ ...s, details: e.target.value }))}
          />
          <textarea
            className="prompt-mgr__text-input"
            placeholder={t('plans.stepExpectedPlaceholder')}
            rows={2}
            value={step.expected}
            onChange={(e) => setStep((s) => ({ ...s, expected: e.target.value }))}
          />
          {error && <p className="prompt-mgr__error" role="alert">{error}</p>}
          <div className="prompt-mgr__actions">
            <button type="submit" className="prompt-mgr__save" disabled={busy}>
              {stepIndex === -1 ? t('plans.addStep') : t('plans.save')}
            </button>
            <button type="button" className="prompt-mgr__cancel" onClick={resetStepForm}>{t('plans.cancel')}</button>
          </div>
        </form>
      )}

      {pasteOpen && stepIndex === null && (
        <form className="prompt-mgr__form" onSubmit={(e) => { e.preventDefault(); applyPaste(); }}>
          <p className="prompt-mgr__formhint">{t('plans.pasteHint')}</p>
          <textarea
            className="prompt-mgr__text-input"
            placeholder={t('plans.pastePlaceholder')}
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          {error && <p className="prompt-mgr__error" role="alert">{error}</p>}
          <div className="prompt-mgr__actions">
            <button type="submit" className="prompt-mgr__save" disabled={busy || !pasteText.trim()}>{t('plans.pasteApply')}</button>
            <button type="button" className="prompt-mgr__cancel" onClick={() => { setPasteOpen(false); setPasteText(''); }}>{t('plans.cancel')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
