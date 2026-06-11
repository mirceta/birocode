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

// An href is "internal" when the caller can resolve it as a path inside the
// repo: no protocol, not protocol-relative, not anchor-only. Anchor-only
// (#section) keeps native in-page scroll; protocol/mailto/etc. open externally.
const isInternalHref = (href) => {
  if (!href) return false;
  if (href.startsWith('#')) return false;
  if (href.startsWith('//')) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(href);
};

// Reusable markdown renderer (GitHub-flavored). Links open in a new tab so the
// user never loses her place. ```mermaid code blocks render as diagrams. Used
// by the file viewer to render .md documents; the chat has its own scoped
// markdown styles.
//
// When `onLinkClick` is provided, internal (repo-relative) links are
// intercepted: the click is prevented and the handler receives (href, event).
// External links and anchor-only links keep their default behavior.
export default function Markdown({ children, onLinkClick }) {
  const handleAnchor = (e, href) => {
    if (!onLinkClick) return;
    if (!isInternalHref(href)) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onLinkClick(href, e);
  };
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, href, ...props }) => (
            <a
              {...props}
              href={href}
              target={onLinkClick && isInternalHref(href) ? undefined : '_blank'}
              rel="noreferrer"
              onClick={(e) => handleAnchor(e, href)}
            />
          ),
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
