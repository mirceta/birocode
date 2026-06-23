import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/LanguageContext';
import { useRepo } from '../../context/RepoContext';
import { getPromptSystem, setPromptSystem } from './promptSystem';
import { extractParams, fillParams } from './promptTemplate';
import PromptPlansPanel from './PromptPlansPanel';
import PromptNotesPanel from './PromptNotesPanel';

// The one-off composer prompts pop-up. It holds a FIXED, hard-coded built-in set
// (insert-only, text from i18n) AND the user's own editable custom prompts
// (openspec: add-prompt-templates — un-retiring the editable list). A custom
// prompt may be a TEMPLATE: its body can carry `{{name}}` placeholders, and "Use"
// then opens a fill-in form before the substituted text lands in the composer.
//   built-in kind 'sys' → planning-system-specific: base key is the OpenSpec
//                wording, `<key>.legacy` is the old plans/* wording; the per-repo
//                toggle picks which. kind 'gen' → identical under both systems.
// (Prompt PLANS and NOTES are separate tabs, untouched by this.)
const BUILTINS = [
  { id: 'understanding', emoji: '\u{1F4DD}', label: 'understanding.prefill', text: 'understanding.prefillPrompt', kind: 'sys' },
  { id: 'kickoff', emoji: '\u{1F680}', label: 'feature.kickoff', text: 'feature.kickoffPrompt', kind: 'sys' },
  { id: 'close', emoji: '\u{1F3C1}', label: 'prompts.builtin.close.label', text: 'prompts.builtin.close', kind: 'sys' },
  { id: 'evaluate', emoji: '\u{1F4A1}', label: 'prompts.builtin.evaluate.label', text: 'prompts.builtin.evaluate', kind: 'sys' },
  { id: 'docsimplify', emoji: '\u{1F4C4}', label: 'prompts.builtin.docsimplify.label', text: 'prompts.builtin.docsimplify', kind: 'gen' },
  { id: 'walloftext', emoji: '\u{1F4AC}', label: 'prompts.builtin.walloftext.label', text: 'prompts.builtin.walloftext', kind: 'gen' },
  { id: 'understandingapp', emoji: '\u{1F916}', label: 'prompts.builtin.understandingapp.label', text: 'prompts.builtin.understandingapp', kind: 'gen' },
];

// Emoji palette for the custom-prompt add/edit form (revived with the editable list).
const EMOJIS = [
  '🚀', '📝', '🐛', '✅', '🔧', '🧪', '📦', '🎨', '💡', '🔍',
  '🗑️', '♻️', '⚡', '🔒', '📋', '📌', '🧹', '🚧', '🏁', '🎯',
  '🔥', '✨', '📄', '💬', '🤖', '⚙️', '🧩', '📊', '🌐', '🛠️',
  '❓', '❗', '➕', '✏️', '🔁', '🟢', '🔴', '🟡', '🧠', '👀',
  '🙌', '💾', '📥', '📤', '🔗', '🪲', '🧱', '🎁', '⏰', '🏷️',
];

export default function PromptManager({
  prompts, onAdd, onUpdate, onDelete,
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

  // Built-ins resolve their i18n text (sys ones honour the toggle). Custom prompts
  // come straight from the backend-synced list. Built-ins are insert-only; custom
  // ones also offer edit/delete.
  const builtinItems = BUILTINS.map((b) => ({
    id: b.id,
    emoji: b.emoji,
    label: t(b.label),
    text: t(b.kind === 'sys' && legacy ? `${b.text}.legacy` : b.text),
    builtin: true,
  }));
  const customItems = (prompts || []).map((p) => ({ ...p, builtin: false }));
  const items = [...builtinItems, ...customItems];

  // Add/edit form state for custom prompts.
  const [editingId, setEditingId] = useState(null);
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Parameter-fill form: set when Use is chosen on a template that has parameters.
  // { text, params:[name], values:{name:value} }. null = no fill form open.
  const [fill, setFill] = useState(null);

  // Parameters the body currently being authored would ask for (live preview).
  const detected = extractParams(text);

  function reset() {
    setEditingId(null);
    setEmoji(EMOJIS[0]);
    setLabel('');
    setText('');
    setError('');
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEmoji(p.emoji || EMOJIS[0]);
    setLabel(p.label || '');
    setText(p.text || '');
    setError('');
  }

  // Single Use path for built-ins and custom prompts alike. No placeholders →
  // insert verbatim immediately (today's behaviour). One or more → open the
  // fill-in form first; nothing is inserted until the user confirms it.
  function use(promptText) {
    const params = extractParams(promptText);
    if (params.length === 0) { onInsert(promptText); onClose(); return; }
    setFill({ text: promptText, params, values: Object.fromEntries(params.map((n) => [n, ''])) });
  }

  function confirmFill() {
    onInsert(fillParams(fill.text, fill.values));
    onClose();
  }

  async function save(e) {
    e.preventDefault();
    if (!text.trim()) { setError(t('prompts.textRequired')); return; }
    setBusy(true);
    setError('');
    try {
      if (editingId) await onUpdate(editingId, emoji, label.trim(), text.trim());
      else await onAdd(emoji, label.trim(), text.trim());
      reset();
    } catch {
      setError(t('prompts.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await onDelete(id);
      if (editingId === id) reset();
    } catch {
      setError(t('prompts.saveError'));
    }
  }

  return (
    <>
    {createPortal(
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
          onUse={(stepText) => { onInsert(stepText); onClose(); }}
        />
      ) : tab === 'notes' ? (
        <PromptNotesPanel
          text={notesText}
          loaded={notesLoaded}
          onSave={onSaveNotes}
        />
      ) : (
      <>
      <ul className="prompt-mgr__list">
        {items.map((p) => {
          const params = p.builtin ? [] : extractParams(p.text);
          return (
          <li key={p.builtin ? `b:${p.id}` : p.id} className="prompt-mgr__item">
            <span className="prompt-mgr__item-emoji" aria-hidden="true">{p.emoji}</span>
            <div className="prompt-mgr__item-main">
              {p.label && <span className="prompt-mgr__item-label">{p.label}</span>}
              <span className="prompt-mgr__item-text">{p.text}</span>
              {params.length > 0 && (
                <span className="prompt-mgr__item-params">
                  {t('prompts.params')}: {params.join(', ')}
                </span>
              )}
            </div>
            <div className="prompt-mgr__item-actions">
              <button
                type="button"
                className="prompt-mgr__item-btn prompt-mgr__item-use"
                onClick={() => use(p.text)}
              >
                {t('prompts.use')}
              </button>
              {!p.builtin && (
                <button type="button" className="prompt-mgr__item-btn" onClick={() => startEdit(p)}>
                  {t('prompts.edit')}
                </button>
              )}
              {!p.builtin && (
                <button type="button" className="prompt-mgr__item-btn" onClick={() => remove(p.id)}>
                  {t('prompts.delete')}
                </button>
              )}
            </div>
          </li>
          );
        })}
      </ul>

      <p className="prompt-mgr__formhint">{t('prompts.addHint')}</p>

      <form className="prompt-mgr__form" onSubmit={save}>
        <div className="prompt-mgr__emoji-grid" role="group" aria-label={t('prompts.emoji')}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`prompt-mgr__emoji${emoji === e ? ' prompt-mgr__emoji--on' : ''}`}
              onClick={() => setEmoji(e)}
              aria-pressed={emoji === e}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          className="prompt-mgr__label-input"
          type="text"
          placeholder={t('prompts.labelPlaceholder')}
          value={label}
          onChange={(ev) => setLabel(ev.target.value)}
        />
        <textarea
          className="prompt-mgr__text-input"
          placeholder={t('prompts.textPlaceholder')}
          rows={3}
          value={text}
          onChange={(ev) => setText(ev.target.value)}
        />
        <p className="prompt-mgr__params-hint">
          {detected.length > 0
            ? `${t('prompts.paramsDetected')}: ${detected.join(', ')}`
            : t('prompts.paramsNone')}
        </p>
        {error && <p className="prompt-mgr__error" role="alert">{error}</p>}
        <div className="prompt-mgr__actions">
          <button type="submit" className="prompt-mgr__save" disabled={busy || !text.trim()}>
            {editingId ? t('prompts.save') : t('prompts.add')}
          </button>
          {editingId && (
            <button type="button" className="prompt-mgr__cancel" onClick={reset}>
              {t('prompts.cancel')}
            </button>
          )}
        </div>
      </form>
      </>
      )}
    </div>
    </div>,
    document.body,
    )}

    {fill && createPortal(
      <div className="prompt-mgr-backdrop prompt-mgr-backdrop--stack" onClick={() => setFill(null)}>
        <div className="prompt-mgr prompt-mgr--fill" role="dialog" aria-modal="true" aria-label={t('prompts.fillTitle')} onClick={(e) => e.stopPropagation()}>
          <div className="prompt-mgr__head">
            <span className="prompt-mgr__title">{t('prompts.fillTitle')}</span>
            <button type="button" className="prompt-mgr__close" onClick={() => setFill(null)} aria-label={t('common.close')}>
              &times;
            </button>
          </div>
          <p className="prompt-mgr__formhint">{t('prompts.fillHint')}</p>
          <form
            className="prompt-mgr__form"
            onSubmit={(e) => { e.preventDefault(); confirmFill(); }}
          >
            {fill.params.map((name, i) => (
              <label key={name} className="prompt-mgr__fill-field">
                <span className="prompt-mgr__fill-name">{name}</span>
                <textarea
                  className="prompt-mgr__text-input"
                  rows={2}
                  autoFocus={i === 0}
                  aria-label={t('prompts.fillFieldAria', { name })}
                  value={fill.values[name]}
                  onChange={(ev) => setFill((f) => ({ ...f, values: { ...f.values, [name]: ev.target.value } }))}
                />
              </label>
            ))}
            <div className="prompt-mgr__actions">
              <button type="submit" className="prompt-mgr__save">{t('prompts.fillInsert')}</button>
              <button type="button" className="prompt-mgr__cancel" onClick={() => setFill(null)}>
                {t('prompts.cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
