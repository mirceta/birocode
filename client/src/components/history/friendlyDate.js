// Formats an ISO timestamp into a warm, non-technical label such as
// "Today, 2:30 PM" / "Yesterday, 4:00 PM" / "Jun 4, 2026, 11:15 AM".
// Pass the translation function `t` so labels follow the active language.

function timePart(date) {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function friendlyDate(iso, t) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t('date.unknown');

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / dayMs);

  if (diffDays === 0) return t('date.today', { time: timePart(date) });
  if (diffDays === 1) return t('date.yesterdayWithTime', { time: timePart(date) });

  const sameYear = date.getFullYear() === now.getFullYear();
  const datePart = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${datePart}, ${timePart(date)}`;
}
