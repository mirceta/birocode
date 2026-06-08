import { useState } from 'react';
import { useChat } from '../../context/ChatContext';

// Renders an AskUserQuestion tool call as a card with clickable option buttons,
// similar to the VS Code Claude extension. Parses the tool's input JSON and
// displays each question with its options. Clicking an option auto-sends the
// answer as the next chat message.
export default function AskQuestionCard({ step }) {
  const { send, streaming } = useChat();
  const [answered, setAnswered] = useState(null); // { qIdx, optIdx }

  let questions = [];
  try {
    const input = JSON.parse(step.detail || '{}');
    questions = input.questions || [];
  } catch {
    return null;
  }

  if (questions.length === 0) return null;

  function handlePick(qIdx, optIdx, label) {
    if (answered || streaming) return;
    setAnswered({ qIdx, optIdx });
    send(label);
  }

  return (
    <div className="ask-card">
      {questions.map((q, qIdx) => (
        <div key={qIdx} className="ask-card__question">
          <div className="ask-card__header">
            {q.header && <span className="ask-card__tag">{q.header}</span>}
            <span className="ask-card__text">{q.question}</span>
          </div>
          <div className="ask-card__options">
            {(q.options || []).map((opt, optIdx) => {
              const isChosen = answered?.qIdx === qIdx && answered?.optIdx === optIdx;
              const isDisabled = !!answered || streaming;
              return (
                <button
                  key={optIdx}
                  type="button"
                  className={`ask-card__opt ${isChosen ? 'is-chosen' : ''}`}
                  disabled={isDisabled}
                  onClick={() => handlePick(qIdx, optIdx, opt.label)}
                >
                  <span className="ask-card__opt-label">{opt.label}</span>
                  {opt.description && (
                    <span className="ask-card__opt-desc">{opt.description}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
