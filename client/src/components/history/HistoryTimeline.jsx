import { friendlyDate } from './friendlyDate';
import { useT } from '../../i18n/LanguageContext';

export default function HistoryTimeline({ entries, onGoBack }) {
  const { t } = useT();
  return (
    <ul className="hist-timeline">
      {entries.map((entry) => (
        <li key={entry.hash} className="hist-entry">
          <p className="hist-entry__date">{friendlyDate(entry.date, t)}</p>
          <p
            className={
              entry.message
                ? 'hist-entry__note'
                : 'hist-entry__note hist-entry__note--empty'
            }
          >
            {entry.message ? `"${entry.message}"` : t('history.noDescription')}
          </p>
          <button
            type="button"
            className="hist-entry__goback"
            onClick={() => onGoBack(entry)}
          >
            {t('history.goBack')}
          </button>
        </li>
      ))}
    </ul>
  );
}
