// Reusable error display. Shows a friendly message with an optional retry.
// Keep copy plain and non-technical -- no stack traces or jargon in the UI.
export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner__icon" aria-hidden="true">
        !
      </span>
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="error-banner__retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
