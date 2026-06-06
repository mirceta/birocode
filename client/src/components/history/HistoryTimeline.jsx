import { friendlyDate } from './friendlyDate';

// Renders the list of previous saves, most recent first. Each entry shows a
// friendly date, the note (or "No description") and a "Go back to this
// version" button. Presentation only -- the page owns data and restore logic.
export default function HistoryTimeline({ entries, onGoBack }) {
  return (
    <ul className="hist-timeline">
      {entries.map((entry) => (
        <li key={entry.hash} className="hist-entry">
          <p className="hist-entry__date">{friendlyDate(entry.date)}</p>
          <p
            className={
              entry.message
                ? 'hist-entry__note'
                : 'hist-entry__note hist-entry__note--empty'
            }
          >
            {entry.message ? `"${entry.message}"` : 'No description'}
          </p>
          <button
            type="button"
            className="hist-entry__goback"
            onClick={() => onGoBack(entry)}
          >
            Go back to this version
          </button>
        </li>
      ))}
    </ul>
  );
}
