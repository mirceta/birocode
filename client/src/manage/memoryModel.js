// The Memory tab's pure model (openspec arch-memory-store, fleet task 0953472c): filtering, grouping, badges and
// the editor's validation. The server is the authority (it refuses secrets and a missing kind / reason); this
// mirrors the rules so the tab can say so before the round trip. Node-tested.

export const KINDS = ['principle', 'rule', 'fleet-fact', 'repo-note', 'goal-note', 'other'];
export const KIND_LABEL = {
  principle: 'Principles', rule: 'Rules', 'fleet-fact': 'Fleet facts', 'repo-note': 'Repo notes', 'goal-note': 'Goal notes', other: 'Other',
};
export const KIND_ICON = { principle: '🧭', rule: '📏', 'fleet-fact': '🛰', 'repo-note': '📦', 'goal-note': '🎯', other: '📝' };

/** "operator" | "arch" | "goal" | "agent" | "import" — the author's family, for the filter. */
export function authorFamily(author) {
  const a = String(author || '').trim().toLowerCase();
  if (a.startsWith('goal')) return 'goal';
  if (a.startsWith('agent')) return 'agent';
  return a || 'arch';
}

/** Every tag across the entries, with counts, most used first. */
export function tagCounts(entries) {
  const m = new Map();
  for (const e of entries || []) for (const t of e.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, n]) => ({ tag, n }));
}

/**
 * Filter: `{ kind, tag, author, status, query, only }` — status 'active' (default) | 'retired' | 'all';
 * only 'stale' | 'review' | 'used' | 'pinned' | ''. The query matches every word in title, body or tags.
 */
export function filterEntries(entries, f = {}) {
  const words = String(f.query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const status = f.status || 'active';
  return (entries || []).filter((e) => {
    if (status !== 'all' && e.status !== status) return false;
    if (f.kind && e.kind !== f.kind) return false;
    if (f.tag && !(e.tags || []).includes(f.tag)) return false;
    if (f.author && authorFamily(e.author) !== f.author) return false;
    if (f.only === 'stale' && !e.stale) return false;
    if (f.only === 'review' && !e.needsReview) return false;
    if (f.only === 'used' && !e.usedRecently) return false;
    if (f.only === 'pinned' && !e.pinned) return false;
    if (words.length) {
      const hay = `${e.title}\n${e.body}\n${(e.tags || []).join(' ')}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Groups by kind in KINDS order; inside a group pinned first, then most recently updated. Empty groups dropped. */
export function groupByKind(entries) {
  const groups = KINDS.map((kind) => ({ kind, label: KIND_LABEL[kind], icon: KIND_ICON[kind], entries: [] }));
  const byKind = Object.fromEntries(groups.map((g) => [g.kind, g]));
  for (const e of entries || []) (byKind[e.kind] || byKind.other).entries.push(e);
  for (const g of groups) g.entries.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));
  return groups.filter((g) => g.entries.length);
}

/** The badges a card shows, in order. */
export function badgesOf(e) {
  const b = [];
  if (e.pinned) b.push({ key: 'pinned', label: '📌 pinned', tone: 'info' });
  if (e.kind === 'principle' || e.pinned) b.push({ key: 'always', label: 'always loaded', tone: 'ok' });
  if (e.usedRecently) b.push({ key: 'used', label: '● used recently', tone: 'ok' });
  if (e.stale) b.push({ key: 'stale', label: 'STALE', tone: 'warn' });
  if (e.needsReview) b.push({ key: 'review', label: 'review', tone: 'warn' });
  if (e.status === 'retired') b.push({ key: 'retired', label: 'retired', tone: 'dim' });
  return b;
}

/** Counts for the header strip. */
export function summary(entries) {
  const active = (entries || []).filter((e) => e.status === 'active');
  return {
    total: (entries || []).length,
    active: active.length,
    always: active.filter((e) => e.kind === 'principle' || e.pinned).length,
    stale: active.filter((e) => e.stale).length,
    review: active.filter((e) => e.needsReview).length,
    used: active.filter((e) => e.usedRecently).length,
    retired: (entries || []).length - active.length,
  };
}

// The same shapes the server refuses (MemoryStore.SecretPatterns) — a client-side early warning only.
const SECRET = [
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/, 'a GitHub token'],
  [/\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}/, 'an API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\b(server|data source|host)\s*=[^;\n]+;[^\n]*\b(password|pwd)\s*=\s*[^;\s]+/i, 'a connection string with a password'],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i, 'a URL with credentials'],
  [/\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["']?(?!\*+|<|\{|\$\{)[^\s"',;]{6,}/i, 'a password / secret assignment'],
];

export function secretFinding(text) {
  for (const [re, name] of SECRET) if (re.test(String(text || ''))) return name;
  return null;
}

/** The editor's problems, empty when it may be saved. */
export function editorProblems(d) {
  const p = [];
  if (!String(d.title || '').trim()) p.push('a title');
  if (!KINDS.includes(d.kind)) p.push('a kind');
  if (!String(d.reason || '').trim()) p.push('a one-line reason');
  const s = secretFinding(d.title) || secretFinding(d.body) || secretFinding(d.reason);
  if (s) p.push(`no secrets (this looks like ${s})`);
  return p;
}

/** "3 d ago" / "5 h ago" / "just now". */
export function ago(ms, now = Date.now()) {
  if (!ms) return 'never';
  const d = Math.max(0, now - ms);
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.round(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)} h ago`;
  return `${Math.round(d / 86_400_000)} d ago`;
}

/** Tags typed as "repo:prg, machine:HUB" → a clean array. */
export function parseTags(s) {
  return [...new Set(String(s || '').split(',').map((t) => t.trim()).filter(Boolean))];
}
