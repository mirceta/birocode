// The arch agent's CACHED PROMPTS, the pure half (openspec arch-custom-prompts, fleet task
// ebc91192): the same prompt library the repo agents' composer uses (/api/prompts), under
// owner "arch", grouped by category for the Arch agent tab's panel. Prompts carry
// PLACEHOLDERS — `{machine}`, `{agent}`, `{task}`, `{pr}`, `{url}`, `{branch}`, `{text}`…
// (single brace, lowercase name) and the repo agents' `{{name}}` form — rendered as fill-in
// chips in the composer; the chip's kind decides whether it offers a pick list (machines,
// agents, tasks, branches from the arch state) or free text. Framework-free, node-tested.

export const GROUPS = ['Deploy & fleet', 'Cards & board', 'Agents', 'Loops, goals & recurring', 'Files', 'Ask & nudge'];
export const OWNER = 'arch';

// `{{ Any name }}` (the repo agents' template form) or `{name}` (lowercase, letters/digits/_/-,
// so JSON and code braces never match: `{"a":1}` and `${VAR}` are left alone).
const RE = /\{\{\s*([A-Za-z][A-Za-z0-9_ -]*?)\s*\}\}|\{([a-z][a-z0-9_-]{0,30})\}/g;

/** Distinct placeholder names in first-appearance order. */
export function placeholdersOf(text) {
  const out = [];
  if (!text) return out;
  const seen = new Set();
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(text)) !== null) {
    const name = (m[1] || m[2] || '').trim();
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

export const hasPlaceholders = (text) => placeholdersOf(text).length > 0;

/** Replace EVERY occurrence of one placeholder (either form) with the value; other placeholders stay. */
export function fillPlaceholder(text, name, value) {
  if (!text) return text;
  return text.replace(RE, (full, a, b) => ((a || b || '').trim() === name ? value : full));
}

/** The chip's kind, from the placeholder's name. */
export function placeholderKind(name) {
  const n = (name || '').trim().toLowerCase();
  if (n === 'machine' || n === 'machine a' || n === 'machine b' || n === 'hub' || n === 'peer') return 'machine';
  if (n === 'agent' || n === 'repo' || n === 'agents') return 'agent';
  if (n === 'task' || n === 'card' || n === 'id' || n === 'task id') return 'task';
  if (n === 'branch') return 'branch';
  if (n === 'pr' || n === 'n' && false) return 'pr';
  if (n === 'url' || n === 'git url' || n === 'link') return 'url';
  if (n === 'n' || n === 'cap' || n === 'count' || n === 'interval') return 'number';
  if (n === 'file' || n === 'path') return 'file';
  return 'text';
}

/** The pick list for a chip kind from the arch state: [{ value, label }]; [] = free text. */
export function optionsFor(kind, ctx) {
  const c = ctx || {};
  switch (kind) {
    case 'machine': {
      const out = [];
      if (c.selfLabel) out.push({ value: c.selfLabel, label: `${c.selfLabel} (this hub)` });
      for (const s of c.sources || []) if (s?.label) out.push({ value: s.label, label: s.reachable === false ? `${s.label} (unreachable)` : s.label });
      return out;
    }
    case 'agent':
      return (c.agents || []).filter((a) => a?.handle).map((a) => ({ value: a.handle, label: `${a.handle}${a.availability ? ` · ${a.availability}` : ''}${a.branch ? ` · ${a.branch}` : ''}` }));
    case 'branch': {
      const seen = new Set();
      const out = [];
      for (const a of c.agents || []) if (a?.branch && !seen.has(a.branch)) { seen.add(a.branch); out.push({ value: a.branch, label: `${a.branch}${a.handle ? ` (${a.handle})` : ''}` }); }
      return out;
    }
    case 'task':
      return (c.tasks || []).filter((t) => t?.id).map((t) => ({ value: t.id.slice(0, 8), label: `${t.id.slice(0, 8)} · ${t.title || ''}${t.status ? ` · ${t.status}` : ''}` }));
    default:
      return [];
  }
}

/** The placeholder chip's hint words. */
export const kindHint = (kind) => ({
  machine: 'pick a machine', agent: 'pick an agent (handle)', task: 'pick a card (id)', branch: 'pick a branch',
  pr: 'PR number', url: 'a URL', number: 'a number', file: 'a hub path', text: 'free text',
}[kind] || 'free text');

/** Prompts grouped by category, the known groups first in their order, then any other
 * category in first-appearance order; empty groups are dropped. */
export function groupPrompts(prompts) {
  const list = prompts || [];
  const byCat = new Map();
  for (const p of list) {
    const cat = (p.category || '').trim() || 'Other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(p);
  }
  const out = [];
  for (const g of GROUPS) if (byCat.has(g)) { out.push({ name: g, items: byCat.get(g) }); byCat.delete(g); }
  for (const [name, items] of byCat) out.push({ name, items });
  return out;
}

/** Prompts matching every word of the query in label, text, category or hint; empty query = all. */
export function filterPrompts(prompts, query) {
  const q = (query || '').trim().toLowerCase();
  const list = prompts || [];
  if (!q) return list;
  const words = q.split(/\s+/).filter(Boolean);
  const hay = (p) => [p.label, p.text, p.category, p.hint].filter(Boolean).join(' \n ').toLowerCase();
  return list.filter((p) => { const h = hay(p); return words.every((w) => h.includes(w)); });
}

/** seeded (from the Arch examples, untouched) · edited (a seeded one the Operator changed) · custom. */
export const promptMark = (p) => (p?.seedId ? (p.edited ? 'edited' : 'seeded') : 'custom');

/** The id list with one id moved one place earlier (-1) or later (+1); unchanged at the ends. */
export function moveId(ids, id, dir) {
  const list = [...(ids || [])];
  const i = list.indexOf(id);
  const to = i + dir;
  if (i < 0 || to < 0 || to >= list.length) return list;
  list.splice(i, 1);
  list.splice(to, 0, id);
  return list;
}

/** The card's one-line preview. */
export function preview(text, max = 150) {
  const one = (text || '').replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max - 1).trimEnd() + '…' : one;
}

/** The composer append contract the repo agents use: nothing is lost, nothing auto-sends. */
export const appendToDraft = (draft, text) => {
  const cur = (draft || '').trim();
  return cur ? `${cur}\n\n${text}` : text;
};
