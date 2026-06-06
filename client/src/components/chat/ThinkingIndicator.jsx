// Animated three-dot indicator shown after the user sends a message and
// before the first response token arrives (and on `thinking` SSE events).
// Gives instant feedback so the user never faces a silent wait.
export default function ThinkingIndicator() {
  return (
    <div className="msg msg--assistant">
      <div className="msg__bubble msg__bubble--thinking" role="status" aria-label="Thinking">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    </div>
  );
}
