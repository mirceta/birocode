// Read-only viewer for a single file's contents. Shown in monospace.
// A Back button returns to the directory listing. The file is fetched by the
// parent (Files.jsx); this component just renders what it is given.

export default function FileViewer({ name, content, onBack }) {
  return (
    <div className="file-viewer">
      <div className="file-viewer__bar">
        <button type="button" className="file-viewer__back" onClick={onBack}>
          <span aria-hidden="true">&larr;</span> Back
        </button>
        <span className="file-viewer__name" title={name}>
          {name}
        </span>
      </div>
      <div className="file-viewer__body">
        <pre className="file-viewer__code">{content}</pre>
      </div>
    </div>
  );
}
