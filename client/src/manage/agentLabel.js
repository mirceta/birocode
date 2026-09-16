// Fleet Status agent chip label (fleet task 1dc2812c): the chip shows ONLY the repo
// agent's own handle — the `<handle>` part of the fleet's `<machine>/<handle>` label
// (openspec stable-handles). The machine is already the section header the chip sits
// under, so repeating it in every chip only ate the label on long machine names and
// truncated the part that tells agents apart. Presentation only: the full handle stays
// on the chip's data-handle / title and is what every tool and the board still use.
//
// Pure, so it is unit-tested without a DOM.

/**
 * @param {string|null|undefined} handle the fleet label, e.g. "DESKTOP-POAPPP3/prg#2"
 * @param {string|null|undefined} name   the repo name, the fallback when there is no handle
 * @param {string|null|undefined} machine this section's machine label, when known
 * @returns {string} the repo-agent part: "prg#2"
 */
export function repoAgentLabel(handle, name, machine) {
  const h = typeof handle === 'string' ? handle.trim() : '';
  if (!h) return (name || '').trim();
  // Exact machine prefix first: a machine label may itself contain "/" and a repo
  // slug never does (Handles.Slug keeps [a-z0-9-] only), so strip the known prefix
  // whole rather than cutting at the first slash.
  if (machine && h.toLowerCase().startsWith(`${String(machine).toLowerCase()}/`)) {
    const rest = h.slice(String(machine).length + 1).trim();
    return rest || h;
  }
  const slash = h.lastIndexOf('/');
  if (slash > 0 && slash < h.length - 1) return h.slice(slash + 1).trim();
  return h;
}
