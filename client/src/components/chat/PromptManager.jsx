import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/LanguageContext';
import { useRepo } from '../../context/RepoContext';
import { getPromptSystem, setPromptSystem } from './promptSystem';
import PromptPlansPanel from './PromptPlansPanel';
import PromptNotesPanel from './PromptNotesPanel';

// The one-off composer prompts are a FIXED, hard-coded, version-controlled set
// (openspec/changes/prompt-system-toggle) — no add/edit/delete; the editable
// JSON-backed library was retired. Each entry is insert-only, text from i18n.
//   kind 'sys' → planning-system-specific: base key is the OpenSpec wording, and a
//                `<key>.legacy` sibling holds the old plans/* wording; the per-repo
//                toggle picks which. kind 'gen' → identical under both systems.
// (Prompt PLANS and NOTES are separate tabs and are untouched by this.)
const BUILTINS = [
  { id: 'understanding', emoji: '\u{1F4DD}', label: 'understanding.prefill', text: 'understanding.prefillPrompt', kind: 'sys' },
  { id: 'kickoff', emoji: '\u{1F680}', label: 'feature.kickoff', text: 'feature.kickoffPrompt', kind: 'sys' },
  { id: 'close', emoji: '\u{1F3C1}', label: 'prompts.builtin.close.label', text: 'prompts.builtin.close', kind: 'sys' },
  { id: 'evaluate', emoji: '\u{1F4A1}', label: 'prompts.builtin.evaluate.label', text: 'prompts.builtin.evaluate', kind: 'sys' },
  { id: 'docsimplify', emoji: '\u{1F4C4}', label: 'prompts.builtin.docsimplify.label', text: 'prompts.builtin.docsimplify', kind: 'gen' },
  { id: 'walloftext', emoji: '\u{1F4AC}', label: 'prompts.builtin.walloftext.label', text: 'prompts.builtin.walloftext', kind: 'gen' },
  { id: 'understandingapp', emoji: '\u{1F916}', label: 'prompts.builtin.understandingapp.label', text: 'prompts.builtin.understandingapp', kind: 'gen' },
];

export default function PromptManager({
  plans, onAddPlan, onUpdatePlan, onDeletePlan,
  notesText, notesLoaded, onSaveNotes,
  onInsert, onClose,
}) {
  const { t } = useT();
  const { currentRepoId } = useRepo();
  // Three tabs in one modal: one-off Prompts, ordered Plans (plans/prompt-plans.md),
  // and freeform Notes (openspec add-prompt-notes-tab). They live ALONGSIDE each
  // other; none replaces another.
  const [tab, setTab] = useState('prompts');
  // Per-repo planning system (openspec/changes/prompt-system-toggle): swaps the
  // system-specific built-ins between OpenSpec and legacy wording, so a repo still
  // on plans/* keeps the old prompts until it ports. Per repo, default OpenSpec.
  const [system, setSystem] = useState(() => getPromptSystem(currentRepoId));
  function changeSystem(s) { setSystem(s); setPromptSystem(currentRepoId, s); }
  const legacy = system === 'old';

  const items = BUILTINS.map((b) => ({
    id: b.id,
    emoji: b.emoji,
    label: t(b.label),
    text: t(b.kind === 'sys' && legacy ? `${b.text}.legacy` : b.text),
  }));

  return createPortal(
    <div className="prompt-mgr-backdrop" onClick={onClose}>
    <div className={`prompt-mgr${tab === 'notes' ? ' prompt-mgr--notes' : ''}`} role="dialog" aria-modal="true" aria-label={t('prompts.title')} onClick={(e) => e.stopPropagation()}>
      <div className="prompt-mgr__head">
        <div className="prompt-mgr__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'prompts'}
            className={`prompt-mgr__tab${tab === 'prompts' ? ' prompt-mgr__tab--on' : ''}`}
            onClick={() => setTab('prompts')}
          >
            {t('prompts.tab')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'plans'}
            className={`prompt-mgr__tab${tab === 'plans' ? ' prompt-mgr__tab--on' : ''}`}
            onClick={() => setTab('plans')}
          >
            {t('plans.title')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notes'}
            className={`prompt-mgr__tab${tab === 'notes' ? ' prompt-mgr__tab--on' : ''}`}
            onClick={() => setTab('notes')}
          >
            {t('notes.tab')}
          </button>
        </div>
        <button type="button" className="prompt-mgr__close" onClick={onClose} aria-label={t('common.close')}>
          &times;
        </button>
      </div>

      <div className="prompt-mgr__systembar" role="group" aria-label={t('prompts.system')}>
        <span className="prompt-mgr__systembar-lbl">{t('prompts.system')}</span>
        <button
          type="button"
          className={`prompt-mgr__sysbtn${system === 'openspec' ? ' prompt-mgr__sysbtn--on' : ''}`}
          aria-pressed={system === 'openspec'}
          onClick={() => changeSystem('openspec')}
        >
          {t('prompts.systemOpenspec')}
        </button>
        <button
          type="button"
          className={`prompt-mgr__sysbtn${system === 'old' ? ' prompt-mgr__sysbtn--on' : ''}`}
          aria-pressed={system === 'old'}
          onClick={() => changeSystem('old')}
        >
          {t('prompts.systemOld')}
        </button>
      </div>

      {tab === 'plans' ? (
        <PromptPlansPanel
          plans={plans}
          onAddPlan={onAddPlan}
          onUpdatePlan={onUpdatePlan}
          onDeletePlan={onDeletePlan}
          onUse={(text) => { onInsert(text); onClose(); }}
        />
      ) : tab === 'notes' ? (
        <PromptNotesPanel
          text={notesText}
          loaded={notesLoaded}
          onSave={onSaveNotes}
        />
      ) : (
        <ul className="prompt-mgr__list">
          {items.map((p) => (
            <li key={p.id} className="prompt-mgr__item">
              <span className="prompt-mgr__item-emoji" aria-hidden="true">{p.emoji}</span>
              <div className="prompt-mgr__item-main">
                <span className="prompt-mgr__item-label">{p.label}</span>
                <span className="prompt-mgr__item-text">{p.text}</span>
              </div>
              <div className="prompt-mgr__item-actions">
                <button
                  type="button"
                  className="prompt-mgr__item-btn prompt-mgr__item-use"
                  onClick={() => { onInsert(p.text); onClose(); }}
                >
                  {t('prompts.use')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
    </div>,
    document.body,
  );
}
