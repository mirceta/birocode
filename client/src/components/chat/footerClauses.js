// Footer-clause builder (openspec prompt-footer-clauses). The delimiter is a
// SHARED constant: the agent uses it to tell standing instructions from the
// actual ask, and a future bubble-marker feature can detect it to collapse the
// repeated footer (the loop-briefing pattern). Change it here or nowhere.
export const FOOTER_DELIMITER = '--- standing instructions ---';

// Append the active clauses (list order) as a delimited footer. No active
// clauses -> the text goes out untouched, byte for byte.
export function appendFooterClauses(text, clauses) {
  const active = (clauses || []).filter((c) => c && c.active && (c.text || '').trim());
  if (active.length === 0) return text;
  const footer = `${FOOTER_DELIMITER}\n${active.map((c) => c.text.trim()).join('\n\n')}`;
  return text ? `${text}\n\n${footer}` : footer;
}
