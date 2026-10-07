// Pure helpers for the Arch examples tab (openspec arch-examples-tab, fleet task 7914195c):
// filtering the catalogue, the bar chart's scale, the timeline, dates. Node-tested.

/** Categories matching a keyword query (name, description, template, examples, tools, tip); empty query = all. */
export function filterCategories(categories, query) {
  const q = (query || '').trim().toLowerCase();
  const list = categories || [];
  if (!q) return list;
  const words = q.split(/\s+/).filter(Boolean);
  const hay = (c) => [c.name, c.description, c.template, c.tip, ...(c.tools || []), ...(c.examples || []).map((e) => e.text)].join(' \n ').toLowerCase();
  return list.filter((c) => { const h = hay(c); return words.every((w) => h.includes(w)); });
}

/** Bars for the frequency chart: widest = the largest count; `other` last. */
export function chartBars(categories) {
  const list = (categories || []).filter((c) => c.count > 0);
  const max = Math.max(1, ...list.map((c) => c.count));
  return list.map((c) => ({ id: c.id, name: c.name, count: c.count, pct: Math.round((c.count / max) * 100), endsInGoal: !!c.endsInGoal }));
}

/** Points for the requests-over-time sparkline from `{ week: 'YYYY-Www', count }` buckets: x spread evenly, y from the top. */
export function sparkline(buckets, width = 260, height = 36) {
  const b = buckets || [];
  if (b.length === 0) return { points: '', max: 0, first: null, last: null, total: 0 };
  const max = Math.max(1, ...b.map((x) => x.count));
  const step = b.length > 1 ? width / (b.length - 1) : 0;
  const points = b.map((x, i) => `${Math.round(i * step)},${Math.round(height - (x.count / max) * (height - 2) - 1)}`).join(' ');
  return { points, max, first: b[0].week, last: b[b.length - 1].week, total: b.reduce((s, x) => s + x.count, 0) };
}

/** "2026-09-05" for a unix-ms timestamp; '' when unknown. */
export const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

/** Where the data came from, in words. */
export function sourceLine(d) {
  if (!d) return '';
  const when = d.minedAt ? new Date(d.minedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '?';
  const where = d.machine || 'the hub';
  return d.source === 'snapshot'
    ? `Snapshot committed with the harness, mined on ${where} at ${when} — this machine has no arch conversations of its own.`
    : `Mined on ${where} at ${when} from ${d.sources?.messages ?? '?'} Operator messages in ${d.sources?.transcripts ?? '?'} arch transcripts, ${d.sources?.goals ?? '?'} goal conversations and ${d.sources?.requests ?? '?'} repo-agent requests.`;
}

/** The template with the placeholders left as they are — what the Copy button puts on the clipboard. */
export const copyText = (c) => (c && c.template ? c.template : '');
