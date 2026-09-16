// Fleet Status "open harness" link (task e5cddb1e): each machine panel links to
// THAT machine's own harness in a new tab. The URL is derived from data the hub
// already holds — the peer registry's normalized address (an absolute
// http(s):// base URL, exactly what the fleet client dials) — never guessed.

/**
 * The href for a machine's harness, or null when it is not derivable.
 * - self/hub row: this harness's own base ('<root>/', a relative URL — correct
 *   under any host/proxy the operator reached the Management App through);
 * - remote: the peer registry's address verbatim (already scheme-qualified and
 *   trailing-slash-trimmed by the collector's NormalizeAddress);
 * - unknown/malformed address: null — the caller renders a disabled affordance,
 *   never a broken href.
 */
export function harnessHref(machine, root = '') {
  if (!machine) return null;
  if (machine.self) return `${root || ''}/`;
  const a = (machine.address || '').trim();
  return /^https?:\/\//i.test(a) ? a : null;
}

/**
 * Deep link into ONE agent's dock on a machine's harness (board task afed9d6d):
 * `<harness base>/studio?agent=<repoId|handle>` — the query the dock consumes on
 * load (DockContext) to activate/open that repo agent. Built on harnessHref, so
 * the base is the same never-guessed peer-registry address (self: this
 * harness's root under any proxy prefix); null when either half is unknown —
 * the caller renders a disabled affordance, never a broken href.
 */
export function agentWorkerHref(machine, root, agent) {
  const base = harnessHref(machine, root);
  const a = (agent || '').trim();
  if (!base || !a) return null;
  return `${base.replace(/\/$/, '')}/studio?agent=${encodeURIComponent(a)}`;
}

/** This harness's root as seen from the current page: '' at the origin, the
 * prefix when the page is served through the localview proxy (the same
 * heuristic ManageApp's harnessRoot uses). Pure over a pathname for tests. */
export function harnessRootFromLocation(pathname) {
  const p = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const m = (p || '').match(/^(.*?)\/api\/localview\//);
  return m ? m[1] : '';
}
