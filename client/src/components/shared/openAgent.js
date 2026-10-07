// ONE way to open a repo agent's harness from any management surface (openspec open-agent-everywhere,
// fleet task 720b3e0c): the Status tab's chips and button, the Kanban card's chips and "Open harness",
// the Task graph's nodes, the Recurring tab's agent chip, the Repo Agent Requests rows. All of them hand
// `{ sourceId, repoId, label }` here; this module resolves the machine from the fleet status, builds the
// deep link, and either opens it (workerWindow's opener, which reads the tab it finds and announces the
// outcome) or ANNOUNCES why it could not — never a silent no-op. The latest fleet status any surface
// fetched is remembered here, so a caller that has none (a graph node) still resolves.
import { focusAgentTab } from './workerWindow.js';
import { OPEN_AGENT_EVENT } from './agentLink.js';
import { agentWorkerHref, harnessRootFromLocation } from '../../manage/harnessLink.js';

let remembered = null;
/** Any surface that polls /api/arch/fleet/status hands it here; the opener resolves machines from it. */
export function rememberFleet(fleet) { if (fleet && Array.isArray(fleet.machines)) remembered = fleet; }
export function lastFleet() { return remembered; }

/** The assignee key everything agrees on: '' (not 'self') for this machine, then '|repoId'. */
export const agentKeyOf = (sourceId, repoId) => `${!sourceId || sourceId === 'self' ? '' : sourceId}|${repoId}`;

/** The fleet machine an assignee lives on: this machine for a blank / 'self' sourceId, else by sourceId. */
export function machineOf(fleet, sourceId) {
  const list = fleet?.machines || [];
  return (!sourceId || sourceId === 'self') ? list.find((m) => m.self) || null : list.find((m) => m.sourceId === sourceId) || null;
}

/**
 * What opening an agent would do (pure): `{ key, url, machine, agent, reason }`. `reason` is null when
 * the agent can be opened; otherwise one of
 *   no-fleet         — the fleet status has not arrived yet (try again in a moment);
 *   unknown-machine  — no fleet machine has this sourceId (re-registered / removed);
 *   no-address       — the machine is known but its address is not derivable;
 *   unknown-agent    — the machine does not list this repo (unregistered or unmanaged there);
 *   unreachable      — the machine did not answer the hub's last probe (opened anyway, with a warning).
 */
export function resolveAgentTarget(fleet, sourceId, repoId, root = harnessRootFromLocation()) {
  const key = agentKeyOf(sourceId, repoId);
  if (!fleet || !Array.isArray(fleet.machines)) return { key, url: null, machine: null, agent: null, reason: 'no-fleet' };
  const machine = machineOf(fleet, sourceId);
  if (!machine) return { key, url: null, machine: null, agent: null, reason: 'unknown-machine' };
  const url = agentWorkerHref(machine, root, repoId);
  if (!url) return { key, url: null, machine, agent: null, reason: 'no-address' };
  const agent = (machine.agents || []).find((a) => a.repoId === repoId) || null;
  if (!agent && machine.reachable !== false) return { key, url, machine, agent: null, reason: 'unknown-agent' };
  if (machine.reachable === false) return { key, url, machine, agent, reason: 'unreachable' };
  return { key, url, machine, agent, reason: null };
}

function announce(win, detail) {
  try { win.dispatchEvent(new CustomEvent(OPEN_AGENT_EVENT, { detail })); } catch { /* no CustomEvent */ }
}

/**
 * Open the agent's harness tab — or say why not. Returns true when an open was attempted.
 * `fleet` defaults to the last one any surface remembered.
 */
export function openAgentHarness({ sourceId, repoId, label }, fleet = remembered, win = (typeof window !== 'undefined' ? window : null)) {
  if (!win || !repoId) return false;
  const t = resolveAgentTarget(fleet, sourceId, repoId);
  const who = label || t.agent?.handle || t.agent?.name || `${t.machine?.machine || sourceId || 'this machine'}/${String(repoId).slice(0, 8)}`;
  if (t.reason && t.reason !== 'unreachable') {
    announce(win, { key: t.key, label: who, url: t.url, result: t.reason, machine: t.machine?.machine || null });
    return false;
  }
  if (t.reason === 'unreachable') announce(win, { key: t.key, label: who, url: t.url, result: 'unreachable', machine: t.machine?.machine || null });
  return focusAgentTab(t.key, t.url, who, win);
}
