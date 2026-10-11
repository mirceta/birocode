// ONE way to open a repo agent's harness from any management surface (openspec open-agent-everywhere,
// fleet task 720b3e0c): the Status tab's chips and button, the Kanban card's chips and "Open harness",
// the Task graph's nodes, the Recurring tab's agent chip, the Repo Agent Requests rows. All of them hand
// `{ sourceId, repoId, label }` here; this module resolves the machine from the fleet status, builds the
// deep link, and either opens it (workerWindow's opener, which reads the tab it finds and announces the
// outcome) or ANNOUNCES why it could not — never a silent no-op. The latest fleet status any surface
// fetched is remembered here, so a caller that has none (a graph node) still resolves.
import { focusAgentTab } from './workerWindow.js';
import { OPEN_AGENT_EVENT, findApp } from './agentLink.js';
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
 * `app` (openspec recurring-open-local-app): one of the agent's local apps, by id or name — the link
 * carries it so the dock opens that app. `appMissing` is set when the fleet status lists the agent's
 * apps and this one is not among them: the agent still opens, without the app, and the caller says so.
 * A machine on an older build lists no apps — the app is passed as given and the dock checks it.
 */
export function resolveAgentTarget(fleet, sourceId, repoId, root = harnessRootFromLocation(), app = null) {
  const key = agentKeyOf(sourceId, repoId);
  if (!fleet || !Array.isArray(fleet.machines)) return { key, url: null, machine: null, agent: null, reason: 'no-fleet' };
  const machine = machineOf(fleet, sourceId);
  if (!machine) return { key, url: null, machine: null, agent: null, reason: 'unknown-machine' };
  const agent = (machine.agents || []).find((a) => a.repoId === repoId) || null;
  const wantApp = (app || '').trim();
  const listed = Array.isArray(agent?.apps) ? agent.apps : null;
  const hit = wantApp && listed ? findApp(listed, wantApp) : null;
  const appMissing = !!(wantApp && listed && !hit);
  const appId = wantApp ? (hit ? hit.id : appMissing ? null : wantApp) : null;
  const url = agentWorkerHref(machine, root, repoId, appId);
  if (!url) return { key, url: null, machine, agent: null, reason: 'no-address' };
  if (!agent && machine.reachable !== false) return { key, url, machine, agent: null, reason: 'unknown-agent', app: appId, appMissing };
  if (machine.reachable === false) return { key, url, machine, agent, reason: 'unreachable', app: appId, appMissing };
  return { key, url, machine, agent, reason: null, app: appId, appMissing };
}

function announce(win, detail) {
  try { win.dispatchEvent(new CustomEvent(OPEN_AGENT_EVENT, { detail })); } catch { /* no CustomEvent */ }
}

/**
 * Open the agent's harness tab — or say why not. Returns true when an open was attempted.
 * `fleet` defaults to the last one any surface remembered.
 */
export function openAgentHarness({ sourceId, repoId, label, app }, fleet = remembered, win = (typeof window !== 'undefined' ? window : null)) {
  if (!win || !repoId) return false;
  const t = resolveAgentTarget(fleet, sourceId, repoId, undefined, app);
  const who = label || t.agent?.handle || t.agent?.name || `${t.machine?.machine || sourceId || 'this machine'}/${String(repoId).slice(0, 8)}`;
  if (t.reason && t.reason !== 'unreachable') {
    announce(win, { key: t.key, label: who, url: t.url, result: t.reason, machine: t.machine?.machine || null });
    return false;
  }
  if (t.reason === 'unreachable') announce(win, { key: t.key, label: who, url: t.url, result: 'unreachable', machine: t.machine?.machine || null });
  if (t.appMissing) announce(win, { key: t.key, label: who, url: t.url, result: 'app-missing', app: String(app).trim(), machine: t.machine?.machine || null });
  return focusAgentTab(t.key, t.url, who, win);
}
