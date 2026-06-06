// Friendly, non-technical date formatting for the conversation list.
// "Today, 2:30 PM" / "Yesterday" / "Jun 4" -- never an ISO timestamp.
export function friendlyDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (isSameDay(date, now)) return `Today, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
