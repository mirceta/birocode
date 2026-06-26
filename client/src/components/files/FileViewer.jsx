import { useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import csharp from 'highlight.js/lib/languages/csharp';
import Markdown from '../shared/Markdown';
import { useT } from '../../i18n/LanguageContext';
import { useFeature } from '../../context/UiModeContext';

// Only the C# grammar is registered — keeps the bundle to hljs core + one
// language instead of the full ~190-language pack (openspec:
// add-cs-syntax-highlighting).
hljs.registerLanguage('csharp', csharp);

const MARKDOWN_RE = /\.(md|markdown|mdown|mkd|mkdn)$/i;
const HTML_RE = /\.(html?|xhtml)$/i;
const CS_RE = /\.cs$/i;

// Code view with an IDE-style line-number gutter. C# files are tokenized by
// hljs (its output is HTML-escaped, so injecting it is safe); everything else
// renders as plain text. The gutter is aria-hidden and unselectable so copy
// excludes the numbers, and the code column is non-wrapping (white-space: pre)
// so each logical line stays one row and the numbers line up 1:1.
function CodeView({ name, content }) {
  const isCs = CS_RE.test(name || '');
  const html = useMemo(() => {
    if (!isCs) return null;
    try {
      return hljs.highlight(content, { language: 'csharp' }).value;
    } catch {
      return null; // unsupported / failed — fall back to plain text
    }
  }, [isCs, content]);

  const lineCount = content.split('\n').length;
  const gutter = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

  return (
    <div className="file-viewer__code-wrap">
      <pre className="file-viewer__gutter" aria-hidden="true">{gutter}</pre>
      {html != null ? (
        <pre className="file-viewer__code file-viewer__code--nowrap">
          <code
            className="hljs language-csharp"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </pre>
      ) : (
        <pre className="file-viewer__code file-viewer__code--nowrap">{content}</pre>
      )}
    </div>
  );
}

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
  const codeHighlight = useFeature('codeHighlight');
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
        {/* In IDE mode the tree is always present on the left, so there's no
            "back to tree" — onBack is omitted and the button is hidden. */}
        {onBack && (
          <button type="button" className="file-viewer__back" onClick={onBack}>
            <span aria-hidden="true">&larr;</span> {t('common.back')}
          </button>
        )}
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
        {!isImage && !showRendered && codeHighlight && (
          <CodeView name={name} content={content} />
        )}
        {!isImage && !showRendered && !codeHighlight && (
          <pre className="file-viewer__code">{content}</pre>
        )}
      </div>
    </div>
  );
}
