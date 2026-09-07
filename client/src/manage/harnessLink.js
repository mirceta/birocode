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
