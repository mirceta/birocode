// Pure helpers of the phone remote (openspec sofa-mode, design D3) — node-tested.

/** The views the phone's view row offers, in order. */
export const REMOTE_VIEWS = ['kanban', 'status', 'arch', 'fleet'];

/** A dock tab's badge for the agent list: busy | waiting | unseen | '' (one, by urgency). */
export function badgeOf(tab) {
  if (!tab) return '';
  if (tab.status === 'running') return 'busy';
  if (tab.waiting) return 'waiting';
  if (tab.unseenResult) return 'unseen';
  return '';
}

/** What the header says the projector shows, from the screens list: null when nothing listens. */
export function showingLine(screens) {
  const list = Array.isArray(screens) ? screens : [];
  if (!list.length) return null;
  const s = list[0];
  const sofa = s.layout === 'sofa' ? ' · sofa view' : '';
  return s.activeAgent ? `${s.name} · ${s.activeAgent}${sofa}` : s.view ? `${s.name} · ${s.view}` : s.name;
}

/** Is the first live screen's dock in sofa view? (drives the phone's 🛋 button state) */
export function sofaOn(screens) {
  const s = Array.isArray(screens) && screens.length ? screens[0] : null;
  return s?.layout === 'sofa';
}

/** The local apps of the opened agent's repo, from /api/repos, as the phone's Apps row shows them. */
export function appsOf(repos, repoId) {
  const r = (Array.isArray(repos) ? repos : []).find((x) => x.id === repoId);
  return Array.isArray(r?.localApps) ? r.localApps.map((a) => ({ id: a.id, name: a.name || `App :${a.port}` })) : [];
}

/** The last assistant message of a transcript, or null. */
export function lastReply(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if ((m.role || '').toLowerCase() === 'assistant' && (m.text || '').trim()) return m;
  }
  return null;
}

/**
 * The open question of a conversation, if its latest turn ended on an AskUserQuestion: the LAST
 * tool call of the session is an AskUserQuestion with no result yet, and the last message is the
 * assistant's. Returns { question, options: [{ label, description }] } or null.
 */
export function openQuestion(toolCalls, messages) {
  const tools = Array.isArray(toolCalls) ? toolCalls : [];
  const last = tools[tools.length - 1];
  if (!last || last.name !== 'AskUserQuestion') return null;
  if ((last.result || '').trim()) return null;
  const msgs = Array.isArray(messages) ? messages : [];
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg && (lastMsg.role || '').toLowerCase() === 'user') return null;
  let input = last.input;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return null; } }
  const q = input?.questions?.[0];
  if (!q) return null;
  const options = (q.options || []).map((o) => ({ label: o.label || String(o), description: o.description || '' })).filter((o) => o.label);
  return options.length ? { question: q.question || '', header: q.header || '', options } : null;
}

/** Body for POST /api/chat from the phone: the lane only when not builder, the session when known. */
export function chatBody(text, { lane, sessionId } = {}) {
  const body = { message: text };
  if (lane && lane !== 'builder') body.lane = lane;
  if (sessionId) body.sessionId = sessionId;
  return body;
}

/** The composer's target label: the agent's name, "the arch", or nothing. */
export function targetLabel(target, t = (k) => k) {
  if (!target) return '';
  if (target.kind === 'arch') return t('remote.theArch');
  return target.name || target.repoId || '';
}

/** Digits only, at most six — what the PIN field accepts. */
export function cleanPin(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 6);
}

// ---- fleet agents on the remote (openspec remote-fleet-agents) ------------------------------------

/** Where a call for an agent on `sourceId` goes: this harness's own API, or the relay to that peer. */
export function apiPathFor(sourceId, path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!sourceId || sourceId === 'self') return p;
  return `/remote/relay/${encodeURIComponent(sourceId)}${p}`;
}

/** A fleet agent's badge: the availability rule says busy; the unseen-result latch says unseen. */
export function badgeOfFleet(agent) {
  if (!agent) return '';
  if (agent.availability === 'busy' || agent.runningSince) return 'busy';
  if (agent.unseenResult) return 'unseen';
  return '';
}

/**
 * The agent list grouped by machine (pure): this harness first, from its DOCK (tabs carry the live
 * status, the session and the colour), then every peer the fleet status knows — its DOCKED agents,
 * with the fleet badges. A dark machine (unreachable) keeps its agents, greyed: the list says what
 * exists, never silently drops a machine. No fleet status at all → this harness alone.
 *   → [{ sourceId, machine, self, reachable, status, agents: [{ key, sourceId, repoId, name, tabId, sessionId, color, badge, status }] }]
 */
export function fleetGroups(fleet, tabs) {
  const dock = (Array.isArray(tabs) ? tabs : []).map((tab) => ({
    key: `self:${tab.id}`, sourceId: 'self', repoId: tab.repoId, name: tab.repoName, tabId: tab.id, sessionId: tab.sessionId || null,
    color: tab.color || null, badge: badgeOf(tab), status: tab.status || null,
  }));
  const machines = Array.isArray(fleet?.machines) ? fleet.machines : [];
  const selfM = machines.find((m) => m.self || m.sourceId === 'self');
  const groups = [{ sourceId: 'self', machine: selfM?.machine || '', self: true, reachable: true, status: 'ok', agents: dock }];
  for (const m of machines) {
    if (m.self || m.sourceId === 'self' || !m.sourceId) continue;
    const agents = (Array.isArray(m.agents) ? m.agents : []).filter((a) => a.docked !== false && a.exists !== false).map((a) => ({
      key: a.key || `${m.sourceId}:${a.repoId}`, sourceId: m.sourceId, repoId: a.repoId, name: a.name || a.repoId, tabId: null, sessionId: null,
      color: null, badge: badgeOfFleet(a), status: a.availability === 'busy' ? 'running' : null,
    }));
    groups.push({ sourceId: m.sourceId, machine: m.machine || m.sourceId, self: false, reachable: m.reachable !== false, status: m.status || '', agents });
  }
  return groups;
}

/** The dock tab of `repoId` in a (relayed) dock list, for its session id; null when not docked. */
export function dockTabFor(dock, repoId) {
  return (Array.isArray(dock) ? dock : []).find((t) => t.repoId === repoId) || null;
}

/** How long a just-sent screen may take to show up on the peer before "home and no peer" means it
 * came back: a harness keeps a screen's last heartbeat for 20 s after the tab left (RemoteCommandStore
 * .ScreenTtl), and the peer's page needs a few seconds to load and heartbeat. */
export const HOP_GRACE_MS = 30000;

/**
 * Where the big screen is, after this poll (pure): the phone remembers the harness it last sent the
 * screen to (`screenOn`: 'self' or a peer's sourceId). When that peer shows no screen any more and
 * this harness does, the screen came home — follow it. But right after a hop the home harness still
 * shows the STALE heartbeat of the tab that just left, and the peer none yet: until the peer has been
 * seen once (`seenThere`) or the grace has passed, that is not evidence of anything — keep believing.
 */
export function followScreen(screenOn, selfScreens, peerScreens, { seenThere = true, sinceHopMs = Infinity } = {}) {
  const here = Array.isArray(selfScreens) && selfScreens.length > 0;
  const there = Array.isArray(peerScreens) && peerScreens.length > 0;
  if (!screenOn || screenOn === 'self') return 'self';
  if (there) return screenOn;
  if (here && (seenThere || sinceHopMs >= HOP_GRACE_MS)) return 'self';
  return screenOn;
}

/**
 * The PIN hop a big screen arrives with (pure): `/remote?pin=123456&then=/studio?agent=…&screen=…` —
 * redeem the PIN here, then continue to `then`. `then` must be a path of THIS origin (starts with one
 * slash): anything else is dropped, so a crafted link cannot bounce the screen elsewhere.
 *   → { pin, then } | null when the URL carries no PIN hop
 */
export function pinHop(search) {
  let q;
  try { q = new URLSearchParams(search || ''); } catch { return null; }
  const pin = cleanPin(q.get('pin'));
  const rawThen = q.get('then') || '';
  const then = /^\/(?!\/)/.test(rawThen) ? rawThen : '';
  if (!pin && !then) return null;
  return { pin: pin.length === 6 ? pin : '', then: then || '/studio' };
}
