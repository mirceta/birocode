// The Status tab's as-you-type agent filter (fleet task 9be69c00, openspec
// status-filter-agent-name; OR patterns since fleet task ca7d22b8, openspec
// status-filter-or): which agents survive what the Operator typed.
//
// The must-have is the agent's NAME — and "name" means what the user can see:
// the chip's visible label (the handle-derived "prg#2") and the full handle
// ("spacex/prg#2"), not just the underlying repo name. Branch, remote URL and
// machine stay in the haystack.
//
// THE SYNTAX (documented in the box's placeholder and hint):
//   - several PATTERNS joined by "|" or "," are alternatives — an agent matching ANY
//     of them survives ("prg | webflow", "prg, webflow"); whitespace around the
//     separators is ignored; an empty alternative (a trailing "|") is simply absent;
//   - inside one pattern, whitespace-separated words AND together, as before
//     ("spacex prg" = both must appear somewhere);
//   - each word is a case-insensitive substring; "*" inside a word is a wildcard
//     ("web*dev"; "*prg*" means the same as "prg");
//   - a word typed without separators still finds the separated name: "webflow"
//     matches "web-flow-autodev1" (hyphens, underscores, dots and spaces are ignored
//     on both sides when the plain substring misses).
// A single plain pattern therefore behaves exactly as before. Pure, unit-tested
// without a DOM; the caller composes this with the machine chips and the state chips.

import { repoAgentLabel } from './agentLabel.js';

/** Everything one agent can be found by, lowercased into one string. */
export function agentQueryHay(a, machineLabel) {
  return [
    a?.name || '',
    a?.handle || '',
    repoAgentLabel(a?.handle, a?.name, machineLabel),
    a?.branch || '',
    a?.remoteUrl || '',
    machineLabel || '',
  ].join(' ').toLowerCase();
}

/** The query as alternatives of AND-words: "prg | web flow, docs" → [["prg"], ["web", "flow"], ["docs"]].
 * Empty alternatives are dropped; an empty result means "no filter". */
export function parseAgentQuery(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[|,]/)
    .map((alt) => alt.trim().split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);
}

const SEPARATORS = /[-_.\s]/g;
const compact = (s) => s.replace(SEPARATORS, '');
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One word against the haystack: substring, "*" as a wildcard, separator-insensitive fallback. */
export function patternMatches(hay, word) {
  const h = String(hay || '').toLowerCase();
  const w = String(word || '').toLowerCase();
  if (!w) return true;
  if (w.includes('*')) {
    const rx = new RegExp(escapeRx(w).replace(/\\\*/g, '.*'));
    return rx.test(h) || rx.test(compact(h));
  }
  if (h.includes(w)) return true;
  const cw = compact(w);
  return cw.length > 0 && compact(h).includes(cw);
}

/** True when the agent matches ANY alternative, i.e. every word of at least one pattern. */
export function matchesAgentQuery(a, machineLabel, q) {
  const alternatives = parseAgentQuery(q);
  if (alternatives.length === 0) return true;
  const hay = agentQueryHay(a, machineLabel);
  return alternatives.some((words) => words.every((w) => patternMatches(hay, w)));
}
