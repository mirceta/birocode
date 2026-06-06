import { useEffect, useRef, useState } from 'react';

// "Save your work" dialog. Asks for an optional short note ("What changed?")
// then saves. Matches the UX-experience.md save-flow mockup. No git jargon.
export default function NoteModal({ saving, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    onConfirm(note.trim());
  }

  return (
    <div
      className="hist-modal__backdrop"
      role="presentation"
      onClick={saving ? undefined : onCancel}
    >
      <div
        className="hist-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <h2 id="save-modal-title" className="hist-modal__title">
            Save your work
          </h2>

          <label className="hist-modal__label" htmlFor="save-note">
            What changed? (optional)
          </label>
          <textarea
            id="save-note"
            ref={inputRef}
            className="hist-modal__input"
            rows={3}
            maxLength={140}
            placeholder="e.g. Updated revenue to 500k"
            value={note}
            disabled={saving}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="hist-modal__actions">
            <button
              type="button"
              className="hist-btn hist-btn--ghost"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hist-btn hist-btn--primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
