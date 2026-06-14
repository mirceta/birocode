// Formats a /api/git/status payload into one-line sync summaries, using the
// same explicit wording as the Git tab. Shared by the Agents tab and the Agent
// dashboard so the two stay in sync. `t` is the i18n translator; `s` is the
// git status payload. Returns [{ key, text, warn? }].
export function syncLines(t, s) {
  const lines = [];
  if (s.baseBranch) {
    const parts = [];
    if (s.baseAhead > 0)
      parts.push(t(s.baseAhead === 1 ? 'git.baseAheadOne' : 'git.baseAhead', { n: s.baseAhead, base: s.baseBranch }));
    if (s.baseBehind > 0)
      parts.push(t(s.baseBehind === 1 ? 'git.baseBehindOne' : 'git.baseBehind', { n: s.baseBehind, base: s.baseBranch }));
    if (parts.length === 0) parts.push(t('git.baseInSync', { base: s.baseBranch }));
    lines.push({ key: 'base', text: parts.join(' · ') });
  }
  if (!s.upstream) {
    lines.push({ key: 'origin', text: t('git.noUpstream'), warn: true });
  } else {
    const parts = [];
    if (s.ahead > 0)
      parts.push(t(s.ahead === 1 ? 'git.aheadOne' : 'git.ahead', { n: s.ahead }));
    if (s.behind > 0)
      parts.push(t(s.behind === 1 ? 'git.behindOne' : 'git.behind', { n: s.behind }));
    if (parts.length === 0) parts.push(t('git.inSync'));
    lines.push({ key: 'origin', text: parts.join(' · ') });
  }
  return lines;
}
