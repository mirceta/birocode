// Read-only viewer for a single file's contents. Markdown files (.md) render
// as a formatted document with a Raw/Rendered toggle; everything else shows as
// monospace text. A Back button returns to the directory listing. The file is
// fetched by the parent (Files.jsx); this component just renders what it gets.
import { useState } from 'react';
import Markdown from '../shared/Markdown';

const MARKDOWN_RE = /\.(md|markdown|mdown|mkd|mkdn)$/i;

export default function FileViewer({ name, content, onBack }) {
  const isMarkdown = MARKDOWN_RE.test(name || '');
  const [raw, setRaw] = useState(false);
  const showRendered = isMarkdown && !raw;

  return (
    <div className="file-viewer">
      <div className="file-viewer__bar">
        <button type="button" className="file-viewer__back" onClick={onBack}>
          <span aria-hidden="true">&larr;</span> Back
        </button>
        <span className="file-viewer__name" title={name}>
          {name}
        </span>
        {isMarkdown && (
          <button
            type="button"
            className="file-viewer__toggle"
            onClick={() => setRaw((r) => !r)}
            title={raw ? 'Show the formatted document' : 'Show the raw text'}
          >
            {raw ? 'Rendered' : 'Raw'}
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
