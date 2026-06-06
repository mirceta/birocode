import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// A single chat message. User messages are right-aligned plain text;
// assistant messages are left-aligned and rendered as markdown so headers,
// lists, bold, code blocks, and links display properly.
export default function MessageBubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <div className={`msg msg--${isUser ? 'user' : 'assistant'}`}>
      <div className="msg__bubble">
        {isUser ? (
          <span className="msg__text">{text}</span>
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
