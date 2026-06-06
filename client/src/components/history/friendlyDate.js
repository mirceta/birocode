// Formats an ISO timestamp into a warm, non-technical label such as
// "Today, 2:30 PM", "Yesterday, 4:00 PM", or "Jun 4, 2026, 11:15 AM".
// The user is non-technical and on her phone -- never show raw ISO strings.

function timePart(date) {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function friendlyDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / dayMs);

  if (diffDays === 0) return `Today, ${timePart(date)}`;
  if (diffDays === 1) return `Yesterday, ${timePart(date)}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  const datePart = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${datePart}, ${timePart(date)}`;
}
