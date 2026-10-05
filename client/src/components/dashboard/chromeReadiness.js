// Pure helpers of the Claude-for-Chrome readiness tile (openspec chrome-readiness-preflight).
// Run: `npm --prefix client test`.

/** Header dot + label key for the overall state the server computed. */
export function overallUi(overall, { loading = false, loadError = false } = {}) {
  if (loading) return { dot: 'loading', labelKey: 'chromeReady.checking' };
  if (loadError && !overall) return { dot: 'off', labelKey: 'chromeReady.state.unreachable' };
  switch (overall) {
    case 'checking': return { dot: 'loading', labelKey: 'chromeReady.checking' };
    case 'ready': return { dot: 'ok', labelKey: 'chromeReady.state.ready' };
    case 'degraded': return { dot: 'pending', labelKey: 'chromeReady.state.degraded' };
    case 'not-ready': return { dot: 'err', labelKey: 'chromeReady.state.notReady' };
    default: return { dot: 'off', labelKey: 'chromeReady.state.unknown' };
  }
}

/** One check's mark. "unknown" is its own mark — never a green tick. */
export function checkMark(state) {
  switch (state) {
    case 'pass': return { mark: '✓', mod: 'pass' };
    case 'fail': return { mark: '✗', mod: 'fail' };
    case 'warn': return { mark: '!', mod: 'warn' };
    case 'info': return { mark: '·', mod: 'info' };
    default: return { mark: '?', mod: 'unknown' };
  }
}

/** Failures first, then warnings, then what could not be checked, then the passes — the
 * order the Operator needs to read them in. Stable inside each group. */
export function orderChecks(checks) {
  const rank = { fail: 0, warn: 1, unknown: 2, pass: 3, info: 4 };
  return (checks || []).map((c, i) => ({ c, i }))
    .sort((a, b) => (rank[a.c.state] ?? 2) - (rank[b.c.state] ?? 2) || a.i - b.i)
    .map((x) => x.c);
}

/** "2 failed · 1 warning · 2 not checkable" — the collapsed header's second half. */
export function countsLine(counts) {
  if (!counts) return '';
  const parts = [];
  if (counts.fail) parts.push(`${counts.fail} failed`);
  if (counts.warn) parts.push(`${counts.warn} warning${counts.warn === 1 ? '' : 's'}`);
  if (counts.unknown) parts.push(`${counts.unknown} not checkable`);
  return parts.join(' · ');
}

/** How many agents on THIS device have the 🌐 toggle on (the per-agent map of browserMode.js). */
export function browserAgentCount(map) {
  return Object.values(map || {}).filter((v) => v === true).length;
}

/** "open:extensions" → "extensions": the page a check's Open button asks the harness for. */
export function openTargetOf(repair) {
  return typeof repair === 'string' && repair.startsWith('open:') ? repair.slice(5) : null;
}

/** "12 s ago" / "4 min ago" / "3 h ago" for the repair log. */
export function agoWords(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/**
 * The hint beside an agent's 🌐 toggle, from the same preflight the status strip shows:
 *  - blocked: a check failed that only the Operator can fix — say which and what to do;
 *  - repair: something is down that the harness fixes by itself when the prompt is sent;
 *  - null: nothing to say (ready, or only unproven).
 */
export function toggleHint(preflight) {
  const checks = preflight?.checks || [];
  const blocker = checks.find((c) => c.state === 'fail' && c.repair !== 'auto' && c.id !== 'lastTurn' && c.id !== 'live');
  if (blocker) return { kind: 'blocked', text: `${blocker.label}: ${blocker.detail}${blocker.fix ? ` Do: ${blocker.fix}` : ''}`, short: blocker.label };
  const fixable = checks.find((c) => c.repair === 'auto');
  if (fixable) return { kind: 'repair', text: `${fixable.label}: ${fixable.detail}`, short: fixable.label };
  return null;
}
