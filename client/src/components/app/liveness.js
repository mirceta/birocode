// Liveness of an embedded local app (openspec local-app-liveness-hysteresis), pure.
//
// The old rule was one fetch every 4 s with a 3 s abort, and ONE bad sample hid the
// app: a probe that waited behind the page's other requests (long git calls, chat
// streams — the browser allows ~6 connections per origin), a slow first byte, or an
// app answering the probe with any non-2xx, flipped the frame to "Nothing is running
// yet" while the iframe itself was fine (board task d1ce7236). The rules here:
//
//   - an app that answered at all is UP — only the harness's OWN verdict counts as
//     down: its proxy says the port is unreachable (502 + X-ClaudeWeb-Localview:
//     unreachable) or the app is not registered (404 + no-app);
//   - a probe that timed out or could not be sent is UNKNOWN: it changes nothing;
//   - a live app is hidden only after OFFLINE_AFTER_MISSES consecutive down samples
//     spanning at least OFFLINE_AFTER_MS since the last good one; an app that was
//     never seen up goes offline on the first down (a dead port shows the empty
//     state at once, as before).

export const PROBE_INTERVAL_MS = 4000;
export const PROBE_TIMEOUT_MS = 8000;
export const OFFLINE_AFTER_MISSES = 3;
export const OFFLINE_AFTER_MS = 10000;
export const HARNESS_VERDICT_HEADER = 'x-claudeweb-localview';

export const UP = 'up';
export const DOWN = 'down';
export const UNKNOWN = 'unknown';

/** The initial liveness state; `online` null = not known yet (empty state shows). */
export function initial(online = null) {
  return { online, misses: 0, lastUp: online === true ? Date.now() : 0 };
}

/**
 * Classify one probe result. `res` is `{ status, headers }` (headers: a getter or a
 * plain object) for a same-origin response, or null when the fetch threw.
 * `error` is the thrown error's name ('AbortError' for a timeout). `sameOrigin`
 * distinguishes the proxied path (statuses readable) from a cross-origin no-cors
 * probe (opaque: any answer is up).
 */
export function classify({ res = null, error = null, sameOrigin = true }) {
  if (res) {
    if (!sameOrigin) return UP;
    const verdict = headerOf(res.headers, HARNESS_VERDICT_HEADER);
    if (verdict === 'unreachable' || verdict === 'no-app') return DOWN;
    return UP; // the app itself answered — 401/404/500 from the app is still a live app
  }
  if (error === 'AbortError') return UNKNOWN; // timed out (queued behind other requests, slow first byte)
  // Could not be sent at all: same-origin means the harness itself is unreachable
  // (nothing to conclude about the app); cross-origin means the port refused.
  return sameOrigin ? UNKNOWN : DOWN;
}

function headerOf(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
}

/** The next state after one sample at time `now`. */
export function next(state, sample, now) {
  if (sample === UP) return { online: true, misses: 0, lastUp: now };
  if (sample === UNKNOWN) return state;
  const misses = state.misses + 1;
  if (state.online !== true) return { online: false, misses, lastUp: state.lastUp };
  const longEnough = misses >= OFFLINE_AFTER_MISSES && now - state.lastUp >= OFFLINE_AFTER_MS;
  return longEnough ? { online: false, misses, lastUp: state.lastUp } : { ...state, misses };
}
