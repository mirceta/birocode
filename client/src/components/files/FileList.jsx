import { useT } from '../../i18n/LanguageContext';

function formatSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileList({ entries, onOpenDir, onOpenFile }) {
  const { t } = useT();

  if (!entries || entries.length === 0) {
    return (
      <div className="files-empty">
        <div className="files-empty__emoji" aria-hidden="true">
          {'\u{1F4C2}'}
        </div>
        <p className="files-empty__title">{t('files.empty')}</p>
        <p>{t('files.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="file-list">
      {entries.map((entry) => {
        const isDir = entry.type === 'dir';
        return (
          <button
            key={entry.name}
            type="button"
            className="file-row"
            onClick={() => (isDir ? onOpenDir(entry.name) : onOpenFile(entry.name))}
          >
            <span className="file-row__icon" aria-hidden="true">
              {isDir ? '\u{1F4C1}' : '\u{1F4C4}'}
            </span>
            <span className="file-row__name">
              {entry.name}
              {isDir ? '/' : ''}
            </span>
            {!isDir && <span className="file-row__size">{formatSize(entry.size)}</span>}
          </button>
        );
      })}
    </div>
  );
}
