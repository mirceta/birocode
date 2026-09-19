import io, sys
p = 'client/src/components/shared/harnessWindow.js'
s = io.open(p, encoding='utf-8').read()

def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:60], s.count(old))
    s = s.replace(old, new)

# 1. header: the measured re-click rule
rep("""// The choice is device-local (this browser, this screen setup), like every Management
// App layout setting.""",
"""// Re-click rule (measured 2026-09-19 in check-harness-reclick.mjs after the Operator saw the
// LAUNCHER come to the front on a second click): window.focus() from the launcher never raises
// an agent tab that is not already the active one — what raises an existing tab is
// window.open('', name) from a page holding the click's activation. So the DASHBOARD raises
// the existing tab itself after the launcher says "focused", and it keeps the launcher's
// handle instead of looking it up by name on every click (that lookup is what raised the
// launcher tab). A stray blank tab from a lookup that found nothing is closed at once.
//
// The choice is device-local (this browser, this screen setup), like every Management
// App layout setting.""")

# 2. the relay: cached launcher handle + raise on 'focused'
rep("""export function openAgentViaLauncher(agentName, url, win = typeof window !== 'undefined' ? window : null, { waitMs = 4000, stepMs = 100 } = {}) {
  if (!win || !agentName || !url) return Promise.resolve('no-launcher');
  const h = win.open('', HARNESS_WINDOW_NAME);
  if (!h) return Promise.resolve('blocked');
  let fresh = false;
  try { fresh = h.location.href === 'about:blank'; } catch { /* another origin in the harness slot: replace it with our launcher */ fresh = true; }
  if (fresh) { try { h.location.href = launcherUrl(win); } catch { return Promise.resolve('no-launcher'); } }
  const ask = () => { try { return typeof h[LAUNCHER_HOOK] === 'function' ? h[LAUNCHER_HOOK](agentName, url) : null; } catch { return null; } };
  const first = ask();
  if (first) return Promise.resolve(first);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const r = ask();
      if (r) return resolve(r);
      if (Date.now() - t0 >= waitMs) return resolve('no-launcher');
      (win.setTimeout || setTimeout)(tick, stepMs);
    };
    (win.setTimeout || setTimeout)(tick, stepMs);
  });
}""",
"""export function openAgentViaLauncher(agentName, url, win = typeof window !== 'undefined' ? window : null, { waitMs = 4000, stepMs = 100 } = {}) {
  if (!win || !agentName || !url) return Promise.resolve('no-launcher');
  const h = launcherHandle(win);
  if (!h) return Promise.resolve('blocked');
  const ask = () => { try { return typeof h[LAUNCHER_HOOK] === 'function' ? h[LAUNCHER_HOOK](agentName, url) : null; } catch { return null; } };
  const done = (r) => { if (r === 'focused') raiseNamedTab(agentName, win); return r; };
  const first = ask();
  if (first) return Promise.resolve(done(first));
  // No hook yet: a fresh launcher is still loading; a launcher tab the Operator browsed away
  // from (same origin, another page) is sent back to the launcher URL.
  let href = null;
  try { href = h.location.href; } catch { href = null; /* another origin in the harness slot: replace it with our launcher */ }
  const wanted = launcherUrl(win);
  if (href === null || href === 'about:blank' || !(wanted && href.startsWith(wanted))) { try { h.location.href = wanted; } catch { return Promise.resolve('no-launcher'); } }
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const r = ask();
      if (r) return resolve(done(r));
      if (Date.now() - t0 >= waitMs) return resolve('no-launcher');
      (win.setTimeout || setTimeout)(tick, stepMs);
    };
    (win.setTimeout || setTimeout)(tick, stepMs);
  });
}

/** The launcher's handle for this dashboard window: kept from the first lookup and reused
 * while that tab lives, because window.open('', name) on an EXISTING name brings that tab
 * to the front — on a re-click that raised the launcher instead of the agent. Looked up
 * again only when there is no live handle (first click, launcher closed). */
const launchers = new WeakMap();
export function launcherHandle(win) {
  if (!win) return null;
  const kept = launchers.get(win);
  if (kept && !kept.closed) return kept;
  const h = win.open('', HARNESS_WINDOW_NAME);
  if (h) launchers.set(win, h);
  return h;
}

/** Bring an EXISTING named tab to the front from the caller's own click: window.open('', name)
 * finds it (the dashboard is familiar with every tab its launcher opened) and Chrome activates
 * it wherever it lives; focus() alone does not. Only ever called for a tab the launcher just
 * reported as existing — if the lookup still came back blank (unfamiliar), that stray tab is
 * closed so a click never leaves an empty tab behind. True when the tab was raised. */
export function raiseNamedTab(name, win = typeof window !== 'undefined' ? window : null) {
  if (!win || !name) return false;
  let w = null;
  try { w = win.open('', name); } catch { return false; }
  if (!w) return false;
  let blank = false;
  try { blank = w.location.href === 'about:blank'; } catch { /* cross-origin: an existing tab on another machine's harness */ }
  if (blank) { try { w.close(); } catch { /* nothing more */ } return false; }
  try { w.focus(); } catch { /* never guaranteed */ }
  return true;
}""")

io.open(p, 'w', encoding='utf-8', newline=chr(10)).write(s)
print('patched', p)
