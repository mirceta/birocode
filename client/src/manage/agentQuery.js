// The Status tab's as-you-type agent filter (fleet task 9be69c00, openspec
// status-filter-agent-name): which agents survive what the Operator typed.
//
// The must-have is the agent's NAME — and "name" means what the user can see:
// the chip's visible label (the handle-derived "prg#2") and the full handle
// ("spacex/prg#2"), not just the underlying repo name. Before this module the
// box matched name/branch/URL/machine only, so typing the label printed on the
// chip could filter that very chip out. Branch, remote URL and machine stay in
// the haystack (they were already searchable and the task allows more than the
// name).
//
// Case-insensitive substring; several words AND together ("spacex prg" = both
// must appear somewhere). Pure, so it is unit-tested without a DOM. The caller
// composes this with the machine chips and the state chips — every constraint
// applies at once.

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

/** True when every whitespace-separated word of `q` appears in the agent's haystack. */
export function matchesAgentQuery(a, machineLabel, q) {
  const query = (q || '').trim().toLowerCase();
  if (!query) return true;
  const hay = agentQueryHay(a, machineLabel);
  return query.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
