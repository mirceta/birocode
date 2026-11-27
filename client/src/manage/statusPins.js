// The Status tab's pinned agents (fleet task 61a0d521, openspec status-pinned-agents): pure helpers over the hub's
// GET /api/settings/status-pins and the fleet status poll. A pin is keyed by the machine's sourceId ("self" for this
// harness) + repoId; it names the machine and agent it was pinned as, so a pin whose machine is not answering (or
// whose agent is not listed right now) still shows, greyed — it is never dropped. Node-tested.

export const pinKey = (sourceId, repoId) => `${sourceId}|${repoId}`;

/** Is this agent of this machine pinned? */
export function isPinned(pins, sourceId, repoId) {
  const k = pinKey(sourceId, repoId);
  return (pins || []).some((p) => pinKey(p.sourceId, p.repoId) === k);
}

/**
 * Each pin, in pin order, with the live machine and agent when the poll knows them:
 *   { key, pin, machine, agent, live, why }
 * live = the machine answers and lists the agent; otherwise `why` says what is missing (greyed in the bar) — or, before
 * the first poll answered (loaded = false), that the fleet is still loading.
 */
export function resolvePins(pins, machines, { loaded = true } = {}) {
  return (pins || []).map((pin) => {
    const machine = (machines || []).find((m) => m.sourceId === pin.sourceId) || null;
    const agent = machine ? (machine.agents || []).find((a) => a.repoId === pin.repoId) || null : null;
    // Before the first fleet poll answered nothing is known yet: say so, never "no longer in the fleet".
    const why = !loaded ? 'loading the fleet…'
      : !machine ? 'this machine is no longer in the fleet'
      : !machine.reachable ? `${machine.machine} is not answering`
        : !agent ? 'this agent is not listed on that machine right now' : null;
    return { key: pinKey(pin.sourceId, pin.repoId), pin, machine, agent, live: !why, why };
  });
}

/** The bar's label: "machine / agent" (the list's own label for the agent part when it is live). */
export function pinLabel(r, agentLabel) {
  const machine = r.machine?.machine || r.pin.machine || r.pin.sourceId;
  const agent = (r.agent && agentLabel) ? agentLabel : (r.agent?.name || r.pin.name || r.pin.repoId);
  return `${machine} / ${agent}`;
}

/** The POST body for pin / unpin. */
export function pinBody(machine, agent, pinned) {
  return { sourceId: machine.sourceId, repoId: agent.repoId, pinned: !!pinned, machine: machine.machine, name: agent.name };
}
