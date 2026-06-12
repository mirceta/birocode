import { useState } from 'react';
import Markdown from '../shared/Markdown';
import { useT } from '../../i18n/LanguageContext';

const MARKDOWN_RE = /\.(md|markdown|mdown|mkd|mkdn)$/i;

// Renders one open file: markdown rendered (with raw toggle), anything else
// as plain text. When `onNavigate` is provided (docLinks feature,
// plans/doc-viewer.md slice 2) internal markdown links navigate the viewer
// to the target file and ◀ ▶ walk the visit history.
export default function FileViewer({
  name,
  content,
  onBack,
  onNavigate,
  canBack = false,
  canForward = false,
  onHistBack,
  onHistForward,
}) {
  const { t } = useT();
  const isMarkdown = MARKDOWN_RE.test(name || '');
  const [raw, setRaw] = useState(false);
  const showRendered = isMarkdown && !raw;

  return (
    <div className="file-viewer">
      <div className="file-viewer__bar">
        <button type="button" className="file-viewer__back" onClick={onBack}>
          <span aria-hidden="true">&larr;</span> {t('common.back')}
        </button>
        {onNavigate && (
          <span className="file-viewer__hist">
            <button
              type="button"
              className="file-viewer__hist-btn"
              onClick={onHistBack}
              disabled={!canBack}
              title={t('files.histBack')}
              aria-label={t('files.histBack')}
            >
              &#9664;
            </button>
            <button
              type="button"
              className="file-viewer__hist-btn"
              onClick={onHistForward}
              disabled={!canForward}
              title={t('files.histForward')}
              aria-label={t('files.histForward')}
            >
              &#9654;
            </button>
          </span>
        )}
        <span className="file-viewer__name" title={name}>
          {name}
        </span>
        {isMarkdown && (
          <button
            type="button"
            className="file-viewer__toggle"
            onClick={() => setRaw((r) => !r)}
            title={raw ? t('files.showRendered') : t('files.showRaw')}
          >
            {raw ? t('files.rendered') : t('files.raw')}
          </button>
        )}
      </div>
      <div className={`file-viewer__body${showRendered ? ' file-viewer__body--doc' : ''}`}>
        {showRendered ? (
          <Markdown onLinkClick={onNavigate}>{content}</Markdown>
        ) : (
          <pre className="file-viewer__code">{content}</pre>
        )}
      </div>
    </div>
  );
}
