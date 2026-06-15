import { Fragment } from 'react';
import { useT } from '../../i18n/LanguageContext';
import { useLongPress } from '../../hooks/useLongPress';

const INDENT_BASE = 14; // .file-row horizontal padding (px)
const INDENT_STEP = 14; // extra indent per tree depth (px)
const OVERSIZE_LINES = 500; // files past this get a refactor warning (plans/file-size-warnings.md)

function formatSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function joinPath(dir, name) {
  if (dir === '/' || dir === '') return `/${name}`;
  return `${dir}/${name}`;
}

function indent(depth) {
  return { paddingLeft: `${INDENT_BASE + depth * INDENT_STEP}px` };
}

// One row. Tap a folder to expand/collapse it in place, tap a file to preview
// it. Press-and-hold a file to drop an @reference to it into the chat message.
function TreeRow({ entry, path, depth, isExpanded, onToggleDir, onOpenFile, onReferenceFile }) {
  const { t } = useT();
  const isDir = entry.type === 'dir';
  const press = useLongPress(
    () => onReferenceFile(path),
    () => (isDir ? onToggleDir(path) : onOpenFile(path)),
    { enabled: !isDir }, // long-press only references files, not folders
  );

  const lines = entry.lines;
  const hasLines = !isDir && lines != null;
  const oversize = hasLines && lines > OVERSIZE_LINES;

  return (
    <button
      type="button"
      className="file-row"
      style={indent(depth)}
      aria-expanded={isDir ? isExpanded : undefined}
      {...press}
    >
      <span className="file-row__chevron" aria-hidden="true">
        {isDir ? (isExpanded ? '\u25BE' : '\u25B8') : ''}
      </span>
      <span className="file-row__icon" aria-hidden="true">
        {isDir ? '\u{1F4C1}' : '\u{1F4C4}'}
      </span>
      <span className="file-row__name">
        {entry.name}
        {isDir ? '/' : ''}
      </span>
      {hasLines && (
        <span
          className={`file-row__lines${oversize ? ' file-row__lines--warn' : ''}`}
          title={oversize ? t('files.linesWarn', { n: lines, limit: OVERSIZE_LINES }) : t('files.lines', { n: lines })}
        >
          {oversize ? '\u26A0\uFE0F ' : ''}
          {t('files.linesShort', { n: lines })}
        </span>
      )}
      {!isDir && <span className="file-row__size">{formatSize(entry.size)}</span>}
    </button>
  );
}

// The children of one expanded folder: a loading / error / empty status row
// while there is nothing to show, otherwise the entries (recursing into any
// expanded subfolders). The root's loading/error is handled by the page with
// the full-size Loading/ErrorBanner instead.
function TreeChildren({ parentPath, depth, nodes, expanded, onToggleDir, onOpenFile, onReferenceFile, onRetryDir, t }) {
  const node = nodes[parentPath];

  if (!node || node.state === 'loading') {
    return (
      <div className="file-tree__status" style={indent(depth)}>
        {t('files.loadingFolder')}
      </div>
    );
  }
  if (node.state === 'error') {
    return (
      <div className="file-tree__status file-tree__status--error" style={indent(depth)}>
        <span>{t('files.loadError')}</span>
        <button type="button" className="file-tree__retry" onClick={() => onRetryDir(parentPath)}>
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }
  if (!node.entries || node.entries.length === 0) {
    return (
      <div className="file-tree__status" style={indent(depth)}>
        {t('files.empty')}
      </div>
    );
  }

  return node.entries.map((entry) => {
    const path = joinPath(parentPath, entry.name);
    const isExpanded = entry.type === 'dir' && expanded.has(path);
    return (
      <Fragment key={path}>
        <TreeRow
          entry={entry}
          path={path}
          depth={depth}
          isExpanded={isExpanded}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
          onReferenceFile={onReferenceFile}
        />
        {isExpanded && (
          <TreeChildren
            parentPath={path}
            depth={depth + 1}
            nodes={nodes}
            expanded={expanded}
            onToggleDir={onToggleDir}
            onOpenFile={onOpenFile}
            onReferenceFile={onReferenceFile}
            onRetryDir={onRetryDir}
            t={t}
          />
        )}
      </Fragment>
    );
  });
}

// VS Code-style explorer tree rooted at "/". The page guarantees the root
// node is loaded before rendering this (see Files.jsx).
export default function FileTree({ nodes, expanded, onToggleDir, onOpenFile, onReferenceFile, onRetryDir }) {
  const { t } = useT();
  const root = nodes['/'];

  if (!root?.entries || root.entries.length === 0) {
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
        <TreeChildren
          parentPath="/"
          depth={0}
          nodes={nodes}
          expanded={expanded}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
          onReferenceFile={onReferenceFile}
          onRetryDir={onRetryDir}
          t={t}
        />
      </div>
    </>
  );
}
