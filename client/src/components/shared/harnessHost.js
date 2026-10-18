import { OPEN_AGENT_MESSAGE, agentOfUrl, appOfUrl } from './agentLink.js';
// Harness tabs land in the OTHER Chrome window (openspec harness-tabs-left-window, fleet task d3af3b9b).
//
// What a web page can and cannot do (measured in real Chrome, .claudeweb-preview/playwright/
// check-left-window*.mjs): a tab a page opens ALWAYS lands in the window of the page that called
// window.open — no feature string, name or opener moves it to another window (a sized/positioned
// feature string makes a POPUP window, which cannot hold tabs). So the only way to put a tab into the
// left window is to have a page that LIVES in the left window open it: the HARNESS HOST tab.
//
// The earlier attempts reached that page through a window NAME (window.open('', name)) and a kept JS
// handle. A handle dies with every dashboard reload; the name lookup only works inside one browsing-
// context group, which Chrome replaces when the dashboard comes back from an error page (a harness
// restart / redeploy) or opens in a new tab, and which never contains a host the Operator opened by
// hand. Then the lookup made a fresh blank tab — in the dashboard's window — and the agent went there.
//
// This design does not depend on any of that: the dashboard and the host are the same origin, so they
// talk over a BroadcastChannel, which every same-origin page of this browser profile shares, whatever
// opened it and however often it reloaded. Per click:
//   1. the dashboard asks "which hosts are there?" (each host answers with its window rectangle);
//   2. a host whose window is NOT the dashboard's (tabs of one window share screenX/Y + outer size)
//      opens / raises the agent's named tab next to itself — focus-without-reload as before;
//   3. a host still in the dashboard's window (just created, not dragged yet) only QUEUES the agent and
//      shows "drag me into the left window"; it opens the queue the moment it sees itself moved;
//   4. no host at all: the dashboard opens one (a tab beside it, from the click) carrying the agent in
//      its URL — queued the same way. If an older host wakes up in another window (Chrome restores
//      background tabs lazily), the new one hands its queue over and closes itself.
// An agent is never opened in the dashboard's window on this path. The host opens tabs without a click
// of its own, so Chrome must allow pop-ups for the hub's site (once, remembered across restarts); when it
// does not, the host keeps the agent as a button to click there and the dashboard says why.

export const HOST_CHANNEL = 'birocode-harness-host';
export const HOST_TAB_NAME = 'birocode-harness-window';
export const HOST_QUERY = 'launcher';
export const ASK_MS = 350;
export const RESULT_MS = 1500;

/** The window's rectangle on screen; tabs of the same Chrome window report the same one. */
export function rectOf(win) {
  if (!win) return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
  return { x: n(win.screenX), y: n(win.screenY), w: n(win.outerWidth), h: n(win.outerHeight) };
}

/** True when two rectangles are the same Chrome window (a 2 px slack for DPI rounding). Unknown = false. */
export function sameWindow(a, b) {
  if (!a || !b) return false;
  const keys = ['x', 'y', 'w', 'h'];
  if (keys.some((k) => a[k] === null || b[k] === null || a[k] === undefined || b[k] === undefined)) return false;
  return keys.every((k) => Math.abs(a[k] - b[k]) <= 2);
}

/** Choose the host for a click: the newest one OUTSIDE the dashboard's window; else (only hosts in the
 * dashboard's window) the newest of those, to queue on. `{ host, inDashboard }`. Pure. */
export function pickHost(answers, dashRect) {
  const list = (answers || []).filter((a) => a && a.hostId).sort((a, b) => (b.since || 0) - (a.since || 0));
  const outside = list.filter((a) => !sameWindow(a.rect, dashRect));
  if (outside.length) return { host: outside[0], inDashboard: false };
  if (list.length) return { host: list[0], inDashboard: true };
  return { host: null, inDashboard: false };
}

/** The host page: this very page (same origin, same proxy prefix) with ?launcher=1; `pending` (an agent
 * to open + the dashboard's rectangle) rides in the hash so a brand-new host can queue it at once. */
export function hostUrl(win, pending = null) {
  if (!win?.location) return null;
  const base = `${win.location.origin}${win.location.pathname}?${HOST_QUERY}=1`;
  return pending ? `${base}#open=${encodeURIComponent(JSON.stringify(pending))}` : base;
}

export function isHostPage(win = typeof window !== 'undefined' ? window : null) {
  try { return new URLSearchParams(win?.location?.search || '').get(HOST_QUERY) === '1'; } catch { return false; }
}

/** The agent a new host was created for, from its hash; null when none / malformed. Pure. */
export function parsePending(hash) {
  const m = /(?:^#|&)open=([^&]*)/.exec(hash || '');
  if (!m) return null;
  try {
    const v = JSON.parse(decodeURIComponent(m[1]));
    return v && typeof v.name === 'string' && typeof v.url === 'string' ? { name: v.name, url: v.url, label: v.label || null, dash: v.dash || null } : null;
  } catch { return null; }
}

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const channelOf = (win) => (win && typeof win.BroadcastChannel === 'function' ? new win.BroadcastChannel(HOST_CHANNEL) : null);
const later = (win, f, ms) => (win.setTimeout || setTimeout)(f, ms);

/** Whether this browser can use the host route at all (every current Chrome can). */
export function hostRouteAvailable(win) { return !!win && typeof win.BroadcastChannel === 'function'; }

/** Ask every host on the channel who it is; resolves the answers heard within `waitMs`. */
export function askHosts(win, { waitMs = ASK_MS } = {}) {
  const ch = channelOf(win);
  if (!ch) return Promise.resolve([]);
  const reqId = rid();
  const answers = [];
  ch.onmessage = (e) => { const d = e.data; if (d && d.type === 'host' && d.reqId === reqId) answers.push(d); };
  ch.postMessage({ type: 'hello', reqId });
  return new Promise((resolve) => later(win, () => { try { ch.close(); } catch { /* closed */ } resolve(answers); }, waitMs));
}

/** Ask one host to open / raise (or, `queue`, only keep) an agent tab; resolves its answer
 * ('opened' | 'focused' | 'queued' | 'blocked') or null when it said nothing within `waitMs`. */
export function sendOpen(win, hostId, agent, { queue = false, waitMs = RESULT_MS } = {}) {
  const ch = channelOf(win);
  if (!ch) return Promise.resolve(null);
  const reqId = rid();
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; try { ch.close(); } catch { /* closed */ } resolve(r); };
    ch.onmessage = (e) => { const d = e.data; if (d && d.type === 'result' && d.reqId === reqId) finish(d.result); };
    ch.postMessage({ type: 'open', reqId, hostId, queue, dash: rectOf(win), ...agent });
    later(win, () => finish(null), waitMs);
  });
}

/**
 * The dashboard's side: put agent `{ name, url, label }` into the left window. Must start from a click
 * (a missing host is opened with the click's activation, which lasts a few seconds). Resolves
 *   'opened'                 — the host opened the agent's new tab in its (left) window (a new tab is the active one);
 *   'focused'                — the tab existed: the host switched it to the agent AND the dashboard brought it to
 *                              the front by name from this click;
 *   'steered'                — the tab existed and was switched to the agent, but Chrome would not let it be
 *                              brought to the front (see raiseByName);
 *   'blocked'                — the host is there but Chrome blocked its pop-up: the agent waits as a button in it;
 *   'queued'                 — the only host is still in the dashboard's window: drag it out, the agent follows;
 *   'host-created'           — there was no host: one was opened beside the dashboard with the agent queued;
 *   'host-blocked'           — there was no host and Chrome blocked opening one;
 *   'host-silent'            — a host answered the roll call but not the open (busy / closing).
 */
export async function openInLeftWindow(agent, win = typeof window !== 'undefined' ? window : null, opts = {}) {
  if (!win || !agent?.name || !agent?.url) return 'host-silent';
  const answers = await askHosts(win, opts);
  const { host, inDashboard } = pickHost(answers, rectOf(win));
  if (host) {
    const r = await sendOpen(win, host.hostId, agent, { queue: inDashboard, ...opts });
    if (r === 'focused') return raiseByName(win, agent.name, host.hostId) ? 'focused' : 'steered';
    return r || 'host-silent';
  }
  let w = null;
  try { w = win.open(hostUrl(win, { ...agent, dash: rectOf(win) }), HOST_TAB_NAME); } catch { w = null; }
  return w ? 'host-created' : 'host-blocked';
}

/**
 * Bring an EXISTING agent tab to the front from the dashboard's own click. Chrome raises another tab only for a
 * page holding the user's click — the host never holds one (the click was on the dashboard), so its focus() only
 * works when its window is already in front. What raises is window.open('', name) from the clicked page, and
 * that finds the tab only while the dashboard shares a browsing-context group with the host that opened it
 * (true for a host the dashboard created, also across F5; false for a host opened by hand, or after the
 * dashboard reloaded through an error page / opened in a new tab). A lookup that finds nothing creates a blank
 * tab HERE: it is closed at once, and this dashboard tab stops trying for that host (sessionStorage survives
 * its reloads) so the flash happens at most once. True when the tab was raised.
 */
export const NO_RAISE_KEY = 'birocode.harnessHost.noRaise';
export function raiseByName(win, name, hostId) {
  let store = null;
  try { store = win.sessionStorage || null; } catch { store = null; }
  try { if (store && store.getItem(NO_RAISE_KEY) === hostId) return false; } catch { /* no storage */ }
  let w = null;
  try { w = win.open('', name); } catch { w = null; }
  if (!w) return false;
  let blank = false;
  try { blank = w.location.href === 'about:blank'; } catch { /* cross-origin: the remote harness tab itself */ }
  if (blank) {
    try { w.close(); } catch { /* nothing more */ }
    try { store?.setItem(NO_RAISE_KEY, hostId); } catch { /* no storage */ }
    return false;
  }
  try { w.focus(); } catch { /* the open itself raised it */ }
  return true;
}

/** Open or raise one agent's named tab FROM the host (it lands in the host's window): a fresh tab is
 * navigated; an existing one is only asked to show the agent (never reloaded) and focused. */
export function openAgentTabHere(win, name, url) {
  let w = null;
  try { w = win.open('', name); } catch { w = null; }
  if (!w) return 'blocked';
  let fresh = false;
  try { fresh = w.location.href === 'about:blank'; } catch { /* cross-origin: another machine's harness, exists */ }
  if (fresh) { try { w.location.href = url; } catch { /* nothing more */ } }
  else { try { w.postMessage({ type: OPEN_AGENT_MESSAGE, agent: agentOfUrl(url), app: appOfUrl(url) }, '*'); } catch { /* best effort */ } }
  try { w.focus(); } catch { /* never guaranteed */ }
  return fresh ? 'opened' : 'focused';
}

/**
 * The host's side: answer roll calls, open what the dashboard asks, queue while in the dashboard's
 * window (or while pop-ups are blocked), hand the queue to an older host in another window. `onChange`
 * hears `{ hostId, inDashboard, queue, opened, last }` after every change. Returns `{ hostId, openNow, stop }`;
 * `openNow(name)` opens a queued agent from a click on the host page (that click's activation).
 */
export function installHost(win, onChange = null, { pollMs = 700 } = {}) {
  const ch = channelOf(win);
  if (!ch) return null;
  const hostId = rid();
  const since = Date.now();
  const queue = [];            // { name, url, label, dash, blocked }
  const opened = new Map();    // name -> { name, url, label, at, hits, last }
  let last = null;
  let lastDash = null;         // the dashboard rectangle we were created / asked from
  const inDashboard = () => !!lastDash && sameWindow(rectOf(win), lastDash);
  const emit = () => { try { onChange?.({ hostId, inDashboard: inDashboard(), queue: queue.slice(), opened: [...opened.values()], last }); } catch { /* listener */ } };
  const note = (a, result) => {
    last = { name: a.name, label: a.label || null, result, at: Date.now() };
    if (result === 'opened' || result === 'focused') {
      const rec = opened.get(a.name) || { name: a.name, url: a.url, label: a.label || null, at: Date.now(), hits: 0 };
      rec.hits += 1; rec.last = Date.now(); rec.url = a.url; if (result === 'opened') rec.at = Date.now();
      opened.set(a.name, rec);
    }
  };
  const enqueue = (a, blocked) => {
    const i = queue.findIndex((q) => q.name === a.name);
    const item = { name: a.name, url: a.url, label: a.label || null, dash: a.dash || null, blocked: !!blocked };
    if (i >= 0) queue[i] = item; else queue.push(item);
  };
  const tryOpen = (a) => {
    const r = openAgentTabHere(win, a.name, a.url);
    if (r === 'blocked') enqueue(a, true);
    else { const i = queue.findIndex((q) => q.name === a.name); if (i >= 0) queue.splice(i, 1); }
    note(a, r);
    return r;
  };

  const pending = parsePending(win.location?.hash);
  if (pending) { lastDash = pending.dash; enqueue(pending, false); try { win.history?.replaceState?.(null, '', win.location.pathname + win.location.search); } catch { /* keep the hash */ } }

  ch.onmessage = (e) => {
    const d = e.data || {};
    if (d.type === 'hello') { ch.postMessage({ type: 'host', reqId: d.reqId, hostId, rect: rectOf(win), since }); return; }
    if (d.type !== 'open' || d.hostId !== hostId || !d.name || !d.url) return;
    if (d.dash) lastDash = d.dash;
    let result;
    if (d.queue || inDashboard()) { enqueue(d, false); result = 'queued'; last = { name: d.name, label: d.label || null, result, at: Date.now() }; }
    else result = tryOpen(d);
    ch.postMessage({ type: 'result', reqId: d.reqId, result });
    emit();
  };

  let stopped = false;
  // Moved out of the dashboard's window → open the queue. Still inside → is there an older host in
  // another window (restored lazily, just woken)? Hand it the queue and close this one.
  const poll = later(win, function tick() {
    if (queue.length && !inDashboard()) {
      const waiting = queue.filter((q) => !q.blocked);
      for (const q of waiting) tryOpen(q);
      if (waiting.length) emit();
    } else if (queue.length && inDashboard()) {
      askHosts(win, { waitMs: ASK_MS }).then(async (answers) => {
        const other = pickHost(answers.filter((a) => a.hostId !== hostId), lastDash);
        if (!other.host || other.inDashboard) return;
        for (const q of queue.splice(0)) await sendOpen(win, other.host.hostId, q);
        emit();
        try { win.close(); } catch { /* a tab the Operator opened by hand cannot close itself */ }
      });
    }
    if (!stopped) later(win, tick, pollMs);
  }, pollMs);
  emit();
  return {
    hostId,
    openNow(name) { const q = queue.find((x) => x.name === name); if (!q) return null; const r = tryOpen(q); emit(); return r; },
    stop() { stopped = true; try { ch.close(); } catch { /* closed */ } void poll; },
  };
}
