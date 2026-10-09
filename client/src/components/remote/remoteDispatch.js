// Sofa mode (openspec sofa-mode, design D2): the ONE dispatch table a big screen executes remote
// commands with, reachable two ways — the polling listener (useBigScreen) in a Chrome tab with the
// "big screen" pill on, and the `window.claudewebRemote(cmd)` hook an embedding host (the living-room
// WebView2 presenter) calls directly. A command is `{ type, args }`, the shape daljinski already uses.
// Everything here either navigates the tab (open-agent, open-view) or acts on the page (scroll, zoom,
// lane, stop) with the code the UI already has — nothing new is rendered. Pure parts are node-tested.
import { OPEN_AGENT_MESSAGE } from '../shared/agentLink.js';

export const REMOTE_TYPES = ['open-agent', 'open-view', 'scroll', 'zoom', 'lane', 'stop', 'layout', 'push-app'];

/** Sofa view (openspec sofa-mode, the Operator's second evening): `layout {mode: sofa|normal}` flips
 * the shown dock's own switches — the chat toolbar's ⤢ (maximize) on, and split 30 / 70 when an app
 * is pushed; `normal` restores. `push-app {app}` pushes one of the repo's local apps on that dock
 * (by id, by name, or `first`) — while sofa view is on, that splits the dock at once. Both are DOM
 * events the dock (PinnedAgent) listens to; the dock reports its layout back for the heartbeat. */
export const LAYOUT_EVENT = 'claudeweb:remote-layout';
export const PUSH_APP_EVENT = 'claudeweb:remote-push-app';
export const DOCK_LAYOUT_EVENT = 'claudeweb:dock-layout';
export const SOFA_CHAT_PCT = 30;

/** What sofa view does to a dock (pure): maximize always; split only when an app is pushed. */
export function sofaLayout(mode, hasApp) {
  if ((mode || '').toLowerCase() === 'normal') return { maximize: false, split: false, ratio: null };
  return { maximize: true, split: !!hasApp, ratio: hasApp ? SOFA_CHAT_PCT : null };
}

/** The local app a `push-app` names, among a repo's apps (pure): by id, by name (case-insensitive), or `first`. */
export function pickApp(apps, want) {
  const list = Array.isArray(apps) ? apps : [];
  const w = String(want || 'first').trim().toLowerCase();
  if (!list.length) return null;
  if (w === 'first') return list[0];
  return list.find((a) => String(a.id).toLowerCase() === w) || list.find((a) => String(a.name || '').toLowerCase() === w) || null;
}

/** localStorage: '' = off, else the screen's name ("projector"). Remembered per browser profile. */
export const BIG_SCREEN_KEY = 'claudeweb_big_screen';
/** sessionStorage: the last command seq this TAB handled — survives the navigation a command caused,
 * so the page that loads next does not re-execute the command that brought it there. */
export const SEQ_KEY = 'claudeweb_big_screen_seq';
/** sessionStorage: this tab's screen id for the heartbeat. */
export const SCREEN_ID_KEY = 'claudeweb_big_screen_id';
/** localStorage: the page zoom the remote set last. */
export const ZOOM_KEY = 'claudeweb_big_screen_zoom';
/** The DOM event the `lane` command raises; the dock's lane toggle listens (PinnedAgent). */
export const LANE_EVENT = 'claudeweb:remote-lane';

export const ZOOM_STEPS = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];

/** Where each named view lives: the studio SPA (a path), the Management App (a tab), or both. */
export const VIEWS = {
  agent: { studio: '/studio/agent' },
  agents: { studio: '/studio/agents' },
  arch: { studio: '/studio/arch', manage: 'arch' },
  tasks: { studio: '/studio/tasks', manage: 'tasks' },
  settings: { studio: '/studio/settings', manage: 'settings' },
  kanban: { manage: 'kanban' },
  status: { manage: 'status' },
  fleet: { manage: 'status' },
  graph: { manage: 'graph' },
  ideas: { manage: 'ideas' },
  recurring: { manage: 'recurring' },
  events: { manage: 'events' },
  files: { manage: 'files' },
  requests: { manage: 'requests' },
  examples: { manage: 'examples' },
  subagents: { manage: 'subagents' },
};

/** 'manage' when the page is the Management App bundle (served under the localview proxy), else 'studio'. */
export function detectBundle(pathname) {
  return /\/app\/events-feed\/manage\//.test(pathname || '') ? 'manage' : 'studio';
}

/** The Management App's URL for a tab, carrying the screen name so the listener stays on after the hop. */
export function manageUrl(root, selfRepoId, tab, screenName) {
  if (!selfRepoId) return null;
  const q = new URLSearchParams({ tab });
  if (screenName) q.set('screen', screenName);
  return `${root || ''}/api/localview/${encodeURIComponent(selfRepoId)}/app/events-feed/manage/index.html?${q}`;
}

/** A studio URL (a path like /studio/arch, or /studio with ?agent=), carrying the screen name. */
export function studioUrl(root, path, screenName, agent) {
  const q = new URLSearchParams();
  if (agent) q.set('agent', agent);
  if (screenName) q.set('screen', screenName);
  const qs = q.toString();
  return `${root || ''}${path}${qs ? `?${qs}` : ''}`;
}

/**
 * Where an `open-view` goes from here (pure): stay in the current bundle when the view exists there,
 * else hop to the other one; null for an unknown view.
 *   → { kind: 'studio', path } | { kind: 'manage', tab } | null
 */
export function resolveView(view, bundle) {
  const v = VIEWS[(view || '').trim().toLowerCase()];
  if (!v) return null;
  if (bundle === 'manage' && v.manage) return { kind: 'manage', tab: v.manage };
  if (bundle !== 'manage' && v.studio) return { kind: 'studio', path: v.studio };
  if (v.manage) return { kind: 'manage', tab: v.manage };
  return { kind: 'studio', path: v.studio };
}

/** The next zoom step for `in` / `out`, 1 for `reset`; unknown dirs leave the zoom alone. */
export function nextZoom(current, dir) {
  const cur = Number(current) || 1;
  if (dir === 'reset') return 1;
  const i = ZOOM_STEPS.reduce((best, z, idx) => (Math.abs(z - cur) < Math.abs(ZOOM_STEPS[best] - cur) ? idx : best), 0);
  if (dir === 'in') return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, i + 1)];
  if (dir === 'out') return ZOOM_STEPS[Math.max(0, i - 1)];
  return cur;
}

/**
 * Is this tab a big screen, and under what name? `?screen=<name>` in the URL forces it on and is
 * remembered; `?screen=0` / `off` switches it off. Otherwise the remembered value decides.
 *   → { on, name }
 */
export function readBigScreen(storage, search) {
  let fromUrl = null;
  try { fromUrl = new URLSearchParams(search || '').get('screen'); } catch { /* no URL */ }
  if (fromUrl !== null) {
    const v = fromUrl.trim();
    const off = v === '0' || v.toLowerCase() === 'off' || v.toLowerCase() === 'false';
    const name = off ? '' : (v === '' || v === '1' || v.toLowerCase() === 'true' ? 'big screen' : v);
    try { storage.setItem(BIG_SCREEN_KEY, name); } catch { /* private mode */ }
    return { on: !off, name };
  }
  let saved = '';
  try { saved = storage.getItem(BIG_SCREEN_KEY) || ''; } catch { /* private mode */ }
  return { on: saved !== '', name: saved };
}

/** The message list to scroll: the largest visible `.chat__scroll` (the active dock's), else nothing. */
export function pickScroller(doc) {
  const all = [...doc.querySelectorAll('.chat__scroll')].filter((el) => el.clientHeight > 0 && el.clientWidth > 0);
  if (!all.length) return null;
  return all.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
}

/** One page up / down, or jump to the latest message. */
export function applyScroll(el, dir) {
  if (!el) return false;
  if (dir === 'latest') el.scrollTop = el.scrollHeight;
  else if (dir === 'up') el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight * 0.9);
  else if (dir === 'down') el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + el.clientHeight * 0.9);
  else return false;
  return true;
}

/**
 * The seq a listener continues from after a poll (pure). Normally the highest seq of the commands it
 * just ran, else the server's current seq when that is ahead (a fresh listener catching up). When the
 * server's seq is BEHIND the listener's — the harness restarted and its in-memory ring began again —
 * the listener must adopt the server's seq, or it stays deaf forever: every new command would have a
 * seq below its stale watermark. Nothing is replayed in that case either.
 */
export function reconcileSeq(local, serverSeq, ranSeqs = []) {
  if (ranSeqs.length) return Math.max(...ranSeqs);
  if (typeof serverSeq !== 'number' || !Number.isFinite(serverSeq)) return local;
  if (serverSeq > local) return serverSeq;      // catch up
  if (serverSeq < local) return serverSeq;      // the server restarted: adopt, do not wait for seq > local
  return local;
}

/** The outcome line a dispatch reports (pure). */
export function describeOutcome(cmd, result) {
  const t = cmd?.type || '?';
  return result ? `${t}: ${result}` : `${t}: ignored`;
}

/**
 * The dispatcher. `env` supplies the page: `win`, `doc`, `root` (the harness root under a proxy, ''
 * at the origin), `bundle`, `screenName`, `selfRepoId()` (the Management App needs it for its URL),
 * `activeRepoId()` (the dock shown, for stop), `navigate(path)` (the SPA's own router when staying
 * in the studio), `post(path, body, opts)` (the API client). Returns a one-line outcome.
 */
export function createDispatcher(env) {
  const { win, doc } = env;
  const go = (url) => { try { win.location.assign(url); } catch { /* no location */ } };
  return async function dispatch(cmd) {
    const type = (cmd?.type || '').toLowerCase();
    const args = cmd?.args || {};
    switch (type) {
      case 'open-agent': {
        const agent = (args.repoId || args.handle || args.agent || '').trim();
        if (!agent) return describeOutcome(cmd, 'no agent named');
        if (env.bundle === 'studio') {
          // The same act the ?agent= deep link and the Kanban chip's named-tab message perform:
          // DockContext steers to the dock and the shell lands on the Agent tab (no reload).
          try { win.postMessage({ type: OPEN_AGENT_MESSAGE, agent }, win.location.origin); } catch { return describeOutcome(cmd, 'could not post'); }
          return describeOutcome(cmd, `steering to ${agent}`);
        }
        go(studioUrl(env.root, '/studio', env.screenName, agent));
        return describeOutcome(cmd, `opening ${agent} in the studio`);
      }
      case 'open-view': {
        const target = resolveView(args.view, env.bundle);
        if (!target) return describeOutcome(cmd, `unknown view ${args.view || ''}`.trim());
        if (target.kind === 'studio') {
          if (env.bundle === 'studio' && env.navigate) { env.navigate(target.path); return describeOutcome(cmd, `showing ${target.path}`); }
          go(studioUrl(env.root, target.path, env.screenName));
          return describeOutcome(cmd, `opening ${target.path}`);
        }
        const url = manageUrl(env.root, env.selfRepoId?.(), target.tab, env.screenName);
        if (!url) return describeOutcome(cmd, 'this harness has no self repo registered');
        go(url);
        return describeOutcome(cmd, `opening management · ${target.tab}`);
      }
      case 'scroll': {
        const ok = applyScroll(pickScroller(doc), (args.dir || '').toLowerCase());
        return describeOutcome(cmd, ok ? `scrolled ${args.dir}` : 'nothing to scroll');
      }
      case 'zoom': {
        const z = nextZoom(doc.body.style.zoom || 1, (args.dir || '').toLowerCase());
        doc.body.style.zoom = String(z);
        try { win.localStorage.setItem(ZOOM_KEY, String(z)); } catch { /* private mode */ }
        return describeOutcome(cmd, `zoom ${Math.round(z * 100)}%`);
      }
      case 'lane': {
        const lane = (args.lane || '').toLowerCase() === 'ask' ? 'ask' : 'builder';
        try { win.dispatchEvent(new CustomEvent(LANE_EVENT, { detail: { lane } })); } catch { return describeOutcome(cmd, 'no CustomEvent'); }
        return describeOutcome(cmd, `lane ${lane}`);
      }
      case 'layout': {
        const mode = (args.mode || '').toLowerCase() === 'normal' ? 'normal' : 'sofa';
        try { win.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: { mode, agent: args.agent || args.repoId || null } })); } catch { return describeOutcome(cmd, 'no CustomEvent'); }
        return describeOutcome(cmd, `layout ${mode}`);
      }
      case 'push-app': {
        const app = (args.app || args.appId || args.name || 'first').toString();
        try { win.dispatchEvent(new CustomEvent(PUSH_APP_EVENT, { detail: { app, agent: args.agent || args.repoId || null } })); } catch { return describeOutcome(cmd, 'no CustomEvent'); }
        return describeOutcome(cmd, `push app ${app}`);
      }
      case 'stop': {
        const repoId = env.activeRepoId?.();
        if (!repoId) return describeOutcome(cmd, 'no agent shown');
        const lane = (args.lane || '').toLowerCase() === 'ask' ? 'ask' : 'builder';
        try { await env.post(`/chat/stop?lane=${lane}`, undefined, { repoId }); } catch (e) { return describeOutcome(cmd, `stop failed (${e?.status || 'network'})`); }
        return describeOutcome(cmd, `stopped ${lane}`);
      }
      default:
        return describeOutcome(cmd, null);
    }
  };
}

/** Restore the zoom the remote set last (called once at page load by the listener). */
export function restoreZoom(win, doc) {
  try {
    const z = Number(win.localStorage.getItem(ZOOM_KEY));
    if (z && z !== 1) doc.body.style.zoom = String(z);
  } catch { /* private mode */ }
}
