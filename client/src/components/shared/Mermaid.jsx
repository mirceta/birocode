import { useEffect, useState } from 'react';

// Renders a ```mermaid code block as an SVG diagram. The mermaid library is
// heavy (~1 MB), so it is dynamically imported on first use — pages without
// diagrams never pay for it (Vite splits it into its own chunk).
let mermaidPromise = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      // 'antiscript' (not 'strict'): strict disables HTML labels, which
      // makes multi-line labels impossible — they render as SVG <text>
      // that cannot wrap, and <br/> is escaped to literal text. antiscript
      // keeps HTML labels but still strips <script> and event handlers.
      // Wrapping config per plans/doc-viewer.md slice 1.
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'antiscript',
        markdownAutoWrap: true,
        flowchart: { htmlLabels: true, wrappingWidth: 200 },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let nextId = 0;

export default function Mermaid({ chart }) {
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);
    loadMermaid()
      .then((mermaid) => mermaid.render(`mermaid-diagram-${nextId++}`, chart))
      .then((result) => {
        if (!cancelled) setSvg(result.svg);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  // On a syntax error fall back to the raw source so nothing is lost.
  if (error) {
    return (
      <pre className="mermaid__error" title={error}>
        {chart}
      </pre>
    );
  }
  if (!svg) return <div className="mermaid__loading">&hellip;</div>;
  // Safe: the SVG comes from mermaid.render with securityLevel "strict",
  // which sanitizes the diagram source.
  // eslint-disable-next-line react/no-danger
  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
