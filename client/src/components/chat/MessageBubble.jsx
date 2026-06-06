import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Turn bare URLs in plain text into clickable links that open in a new tab
// (so the user never loses her chat) -- the way they behave in user messages,
// which aren't markdown. Assistant messages get this for free via markdown.
function linkify(text) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    // Don't swallow trailing sentence punctuation into the link target.
    const url = part.replace(/[.,!?;:)\]]+$/, '');
    const trailing = part.slice(url.length);
    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noreferrer">{url}</a>
        {trailing}
      </span>
    );
  });
}

// A single chat message. User messages are right-aligned plain text (with bare
// URLs linkified); assistant messages are left-aligned and rendered as markdown
// so headers, lists, bold, code blocks, and links display properly.
export default function MessageBubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <div className={`msg msg--${isUser ? 'user' : 'assistant'}`}>
      <div className="msg__bubble">
        {isUser ? (
          <span className="msg__text">{linkify(text)}</span>
        ) : (
          <div className="msg__markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Render links in a new tab so the user never loses her chat.
                a: ({ node, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer" />
                ),
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
