// Browser mode (Claude in Chrome) as a PER-AGENT choice (openspec chrome-per-agent-mode).
//
// The 🌐 toggle belongs to the agent it is flipped on: a dock tab, or the main chat's
// repo. Its state is a small map { agentKey: true } in localStorage; only the agent
// whose key is on sends `browser: true`. The old DEVICE-GLOBAL flag
// ('claude-web.browser-mode', one bit that every dock attached to every send — which is
// how one agent's browser run came to block prompts to all the others) is retired on
// first load: removed, never copied onto every agent.
//
// Pure: takes a Storage-like object so node tests can pass a fake. Run: `npm --prefix client test`.

export const LEGACY_KEY = 'claude-web.browser-mode';
export const STORE_KEY = 'claude-web.browser-mode.agents';

/** The agent an 🌐 toggle belongs to: the dock tab when there is one, else the repo. */
export function agentKeyFor({ tabId, repoId } = {}) {
  if (tabId) return `tab:${tabId}`;
  if (repoId) return `repo:${repoId}`;
  return null;
}

/** Retires the old device-global flag. Returns true when one was found (and dropped). */
export function retireLegacyFlag(storage) {
  try {
    if (storage.getItem(LEGACY_KEY) === null) return false;
    storage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Reads the per-agent map ({ agentKey: true }); an unreadable store reads as empty. */
export function loadBrowserAgents(storage) {
  try {
    const raw = storage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) if (v === true && typeof k === 'string' && k) out[k] = true;
    return out;
  } catch {
    return {};
  }
}

/** Pure update: the map with one agent's toggle set. Off entries are dropped, not kept as false. */
export function withBrowserOn(map, agentKey, on) {
  if (!agentKey) return map;
  const next = { ...map };
  if (on) next[agentKey] = true; else delete next[agentKey];
  return next;
}

export function saveBrowserAgents(storage, map) {
  try {
    const keys = Object.keys(map || {});
    if (keys.length === 0) storage.removeItem(STORE_KEY);
    else storage.setItem(STORE_KEY, JSON.stringify(map));
  } catch { /* private mode — the toggle still works for this page's lifetime */ }
}

/** Whether this agent's toggle is on. Unknown agent → off. */
export function isBrowserOn(map, agentKey) {
  return !!(agentKey && map && map[agentKey] === true);
}

/** Whether a send for this agent carries the browser request: its own toggle, the
 *  builder lane and the Claude engine — never another agent's toggle. */
export function sendCarriesBrowser({ map, agentKey, lane = 'builder', provider = 'claude' }) {
  return isBrowserOn(map, agentKey) && lane !== 'ask' && provider === 'claude';
}

/** First-load bootstrap: retire the legacy flag, then read the per-agent map. */
export function bootstrapBrowserAgents(storage) {
  const retired = retireLegacyFlag(storage);
  return { map: loadBrowserAgents(storage), retiredLegacy: retired };
}
