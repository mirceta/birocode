// The contract between a management surface and a harness tab for "open this agent"
// (openspec status-open-agent-anywhere, fleet task 608f281a). Pure; shared by the opener
// (workerWindow.js) and the receiver (DockContext.jsx), node-tested.

/** A management page asks a harness tab it holds a handle to: show this agent. */
export const OPEN_AGENT_MESSAGE = 'birocode:open-agent';
/** The harness tab's answer: it found (or not) the agent and switched to it. */
export const OPEN_AGENT_ACK = 'birocode:open-agent-ack';
/** The opener's report to its own page (a DOM CustomEvent) — what happened, for a visible notice. */
export const OPEN_AGENT_EVENT = 'birocode:agent-open';

/** The repo a `?agent=` / open-agent request names: repoId exactly, else this harness's own
 * handle or name (case-insensitive). A link built elsewhere sends the TARGET machine's repoId. */
export function findRepoForAgent(repos, want) {
  const w = (want || '').trim();
  if (!w) return null;
  const norm = (s) => (s || '').toLowerCase();
  const list = repos || [];
  return list.find((r) => r.id === w)
    || list.find((r) => norm(r.handle) === norm(w))
    || list.find((r) => norm(r.name) === norm(w))
    || null;
}

/** The agent a studio deep link names (`…/studio?agent=<id>`), or null. */
export function agentOfUrl(url) {
  try { return new URL(url, 'http://placeholder.invalid').searchParams.get('agent') || null; } catch { return null; }
}

/** An open-agent message as received: `{ agent }` when well-formed, else null. */
export function parseOpenAgentMessage(data) {
  return data && data.type === OPEN_AGENT_MESSAGE && typeof data.agent === 'string' && data.agent.trim() ? { agent: data.agent.trim() } : null;
}
