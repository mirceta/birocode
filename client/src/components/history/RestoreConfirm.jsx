import { friendlyDate } from './friendlyDate';

// Confirmation dialog shown before going back to an earlier save. Restoring is
// destructive (it undoes later changes), so we always confirm first. Matches
// the restore-confirm mockup in UX-experience.md. No git jargon -- "Go back".
export default function RestoreConfirm({ entry, restoring, onConfirm, onCancel }) {
  return (
    <div
      className="hist-modal__backdrop"
      role="presentation"
      onClick={restoring ? undefined : onCancel}
    >
      <div
        className="hist-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="restore-modal-title" className="hist-modal__title">
          Go back to this version?
        </h2>
        <p className="hist-modal__body">This will undo all changes made after:</p>

        <p className="hist-modal__quote">
          {entry.message ? `"${entry.message}"` : 'No description'}
        </p>
        <p className="hist-modal__meta">{friendlyDate(entry.date)}</p>

        <div className="hist-modal__actions">
          <button
            type="button"
            className="hist-btn hist-btn--ghost"
            onClick={onCancel}
            disabled={restoring}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hist-btn hist-btn--danger"
            onClick={onConfirm}
            disabled={restoring}
          >
            {restoring ? 'Going back...' : 'Go back'}
          </button>
        </div>
      </div>
    </div>
  );
}
