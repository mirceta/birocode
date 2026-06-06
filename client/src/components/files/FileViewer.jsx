import { useState } from 'react';
import Markdown from '../shared/Markdown';
import { useT } from '../../i18n/LanguageContext';

const MARKDOWN_RE = /\.(md|markdown|mdown|mkd|mkdn)$/i;

export default function FileViewer({ name, content, onBack }) {
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
          <Markdown>{content}</Markdown>
        ) : (
          <pre className="file-viewer__code">{content}</pre>
        )}
      </div>
    </div>
  );
}
