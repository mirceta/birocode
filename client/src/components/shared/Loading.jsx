// Reusable loading spinner. Used across all pages while data is in flight,
// so the user always sees instant feedback instead of a silent wait.
export default function Loading({ label = 'Just a moment...' }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
