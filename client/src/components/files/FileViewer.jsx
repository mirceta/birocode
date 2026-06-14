import { useState } from 'react';
import Markdown from '../shared/Markdown';
import { useT } from '../../i18n/LanguageContext';

const MARKDOWN_RE = /\.(md|markdown|mdown|mkd|mkdn)$/i;
const HTML_RE = /\.(html?|xhtml)$/i;

// Renders one open file: markdown and HTML render (with a raw toggle), anything
// else as plain text. HTML renders in a fully-sandboxed iframe — file content
// is untrusted (plans/html-preview.md). When `onNavigate` is provided (docLinks
// feature, plans/doc-viewer.md slice 2) internal markdown links navigate the
// viewer to the target file and ◀ ▶ walk the visit history.
export default function FileViewer({
  name,
  content,
  imageUrl,
  onBack,
  onNavigate,
  canBack = false,
  canForward = false,
  onHistBack,
  onHistForward,
  pinned = false,
  onTogglePin,
}) {
  const { t } = useT();
  const isImage = !!imageUrl;
  const isMarkdown = MARKDOWN_RE.test(name || '');
  const isHtml = HTML_RE.test(name || '');
  // Images have no text source, so no raw toggle for them.
  const canRender = isMarkdown || isHtml;
  const [raw, setRaw] = useState(false);
  const showRendered = canRender && !raw;

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
        {onTogglePin && (
          <button
            type="button"
            className={`file-viewer__pin${pinned ? ' file-viewer__pin--on' : ''}`}
            onClick={onTogglePin}
            title={pinned ? t('files.unpin') : t('files.pin')}
            aria-label={pinned ? t('files.unpin') : t('files.pin')}
            aria-pressed={pinned}
          >
            📌
          </button>
        )}
        {canRender && (
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
      <div className={`file-viewer__body${showRendered && isMarkdown ? ' file-viewer__body--doc' : ''}${showRendered && isHtml ? ' file-viewer__body--html' : ''}${isImage ? ' file-viewer__body--img' : ''}`}>
        {isImage && (
          <img className="file-viewer__img" src={imageUrl} alt={name} />
        )}
        {!isImage && showRendered && isMarkdown && (
          <Markdown onLinkClick={onNavigate}>{content}</Markdown>
        )}
        {!isImage && showRendered && isHtml && (
          // sandbox="" = no scripts / same-origin / forms / popups / top-nav, so
          // untrusted file content can't run in the harness's origin. srcDoc (not
          // src) means there's no fetchable URL or real origin to abuse.
          <iframe
            className="file-viewer__html"
            title={name}
            srcDoc={content}
            sandbox=""
          />
        )}
        {!isImage && !showRendered && (
          <pre className="file-viewer__code">{content}</pre>
        )}
      </div>
    </div>
  );
}
