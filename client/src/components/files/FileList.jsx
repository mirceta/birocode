import { useT } from '../../i18n/LanguageContext';
import { useLongPress } from '../../hooks/useLongPress';

function formatSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// One row. Tap a folder to open it, tap a file to preview it. Press-and-hold a
// file to drop a reference to it into the chat message (onReferenceFile).
function FileRow({ entry, onOpenDir, onOpenFile, onReferenceFile }) {
  const isDir = entry.type === 'dir';
  const press = useLongPress(
    () => onReferenceFile(entry.name),
    () => (isDir ? onOpenDir(entry.name) : onOpenFile(entry.name)),
    { enabled: !isDir }, // long-press only references files, not folders
  );

  return (
    <button type="button" className="file-row" {...press}>
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
}

export default function FileList({ entries, onOpenDir, onOpenFile, onReferenceFile }) {
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
    <>
      <p className="files-hint">{t('files.longPressHint')}</p>
      <div className="file-list">
        {entries.map((entry) => (
          <FileRow
            key={entry.name}
            entry={entry}
            onOpenDir={onOpenDir}
            onOpenFile={onOpenFile}
            onReferenceFile={onReferenceFile}
          />
        ))}
      </div>
    </>
  );
}
