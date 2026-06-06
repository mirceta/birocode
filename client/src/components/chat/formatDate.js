// Friendly, non-technical date formatting for the conversation list.
// Pass the translation function `t` so the labels follow the active language.
export function friendlyDate(value, t) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (isSameDay(date, now)) return t('date.today', { time });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return t('date.yesterday');

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
