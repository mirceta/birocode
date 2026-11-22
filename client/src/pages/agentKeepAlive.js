// Agent pages kept alive like browser tabs (idea #33, openspec projector-agent-tabs): the Agent tab keeps
// the docks it has shown MOUNTED (hidden), so returning to an agent is a switch, not a reload — its chat,
// scroll position and local-app iframes are still there. The first visit loads it; the least recently
// shown one is dropped past MAX_KEPT so a long session does not keep every dock of the harness running.
// Pure, node-tested.

export const MAX_KEPT = 6;

/**
 * The docks to keep mounted after showing `activeId`, most recent first.
 * @param {string[]} kept   the current list (most recent first)
 * @param {string|null} activeId the dock shown now
 * @param {string[]} existing the dock tab ids that still exist (closed tabs are dropped)
 */
export function nextKept(kept, activeId, existing, max = MAX_KEPT) {
  const alive = new Set(existing || []);
  const rest = (kept || []).filter((id) => id !== activeId && alive.has(id));
  const head = activeId && alive.has(activeId) ? [activeId] : [];
  return [...head, ...rest].slice(0, Math.max(1, max));
}

/** Same list, same order? (avoids a state update — and a re-render — when nothing changed). */
export function sameKept(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
