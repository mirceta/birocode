import { useState } from 'react';
import { useT } from '../../i18n/LanguageContext';

// Add/edit/delete UI for custom composer prompts (plans/custom-prompts.md),
// shown as a popover above the chat composer. Each preset is an emoji + label +
// prompt text; the emoji is picked from the grid below.
const EMOJIS = [
  '🚀', '📝', '🐛', '✅', '🔧', '🧪', '📦', '🎨', '💡', '🔍',
  '🗑️', '♻️', '⚡', '🔒', '📋', '📌', '🧹', '🚧', '🏁', '🎯',
  '🔥', '✨', '📄', '💬', '🤖', '⚙️', '🧩', '📊', '🌐', '🛠️',
  '❓', '❗', '➕', '✏️', '🔁', '🟢', '🔴', '🟡', '🧠', '👀',
  '🙌', '💾', '📥', '📤', '🔗', '🪲', '🧱', '🎁', '⏰', '🏷️',
];

export default function PromptManager({ prompts, onAdd, onUpdate, onDelete, onClose }) {
  const { t } = useT();
  const [editingId, setEditingId] = useState(null);
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    <div className="prompt-mgr" role="dialog" aria-label={t('prompts.title')}>
      <div className="prompt-mgr__head">
        <span className="prompt-mgr__title">{t('prompts.title')}</span>
        <button type="button" className="prompt-mgr__close" onClick={onClose} aria-label={t('common.close')}>
          &times;
        </button>
      </div>

      {prompts.length === 0 ? (
        <p className="prompt-mgr__empty">{t('prompts.empty')}</p>
      ) : (
        <ul className="prompt-mgr__list">
          {prompts.map((p) => (
            <li key={p.id} className="prompt-mgr__item">
              <span className="prompt-mgr__item-emoji" aria-hidden="true">{p.emoji}</span>
              <span className="prompt-mgr__item-label" title={p.text}>{p.label || p.text}</span>
              <button type="button" className="prompt-mgr__item-btn" onClick={() => startEdit(p)}>
                {t('prompts.edit')}
              </button>
              <button type="button" className="prompt-mgr__item-btn" onClick={() => remove(p.id)}>
                {t('prompts.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

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
    </div>
  );
}
