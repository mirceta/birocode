import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Mermaid from './Mermaid';
import './markdown.css';

const isMermaidCode = (className) => /\blanguage-mermaid\b/.test(className || '');

// True when the <pre> wraps a ```mermaid code block (the code override below
// replaces it with a diagram, so the <pre> shell must be unwrapped).
const wrapsMermaid = (node) => {
  const child = node?.children?.[0];
  const cls = child?.properties?.className;
  return Array.isArray(cls) && cls.includes('language-mermaid');
};

// Reusable markdown renderer (GitHub-flavored). Links open in a new tab so the
// user never loses her place. ```mermaid code blocks render as diagrams. Used
// by the file viewer to render .md documents; the chat has its own scoped
// markdown styles.
export default function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          pre: ({ node, ...props }) => (wrapsMermaid(node) ? props.children : <pre {...props} />),
          code: ({ node, className, children: code, ...props }) =>
            isMermaidCode(className) ? (
              <Mermaid chart={String(code)} />
            ) : (
              <code className={className} {...props}>
                {code}
              </code>
            ),
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
