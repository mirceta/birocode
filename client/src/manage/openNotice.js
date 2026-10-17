// What the Status tab says after "open harness" (openspec status-open-agent-anywhere, fleet task
// 608f281a): one line per outcome of workerWindow's opener, with a plain link to a fresh tab
// whenever the agent's tab may not have come to the front. Pure; node-tested.

/** `{ text, sticky, link }` for an OPEN_AGENT_EVENT detail. `sticky` notices stay until dismissed
 * and carry the "open in a new tab" link; the rest fade after a few seconds. */
export function openNoticeText(d) {
  const who = (d && d.label) || 'the agent';
  switch (d && d.result) {
    case 'opened': return { text: `Opened ${who} in a new tab.`, sticky: false, link: false };
    case 'renavigated': return { text: `${who}'s tab was showing another page — it is back on the agent now.`, sticky: false, link: false };
    case 'self-reopened': return { text: `This dashboard was sitting in the tab reserved for ${who}; opened ${who} in a new tab beside it.`, sticky: false, link: false };
    case 'steered':
      return d.raised
        ? { text: `Switched ${who}'s tab to the agent.`, sticky: false, link: false }
        : { text: `${who}'s tab shows the agent now, but it did not come to the front (it is in another window). Switch to it, or`, sticky: true, link: true };
    case 'silent':
      return { text: `${who}'s tab did not answer — it shows another page, or an older harness build. Switch to it, or`, sticky: true, link: true };
    case 'blocked':
      return { text: `The browser blocked the pop-up for ${who}. Allow pop-ups for this site, or`, sticky: true, link: true };
    // The left-window route (openspec harness-tabs-left-window): the harness host tab in the other window
    // opens the agent; nothing ever opens in the dashboard's own window on this route.
    case 'left-opened': return { text: `Opened ${who} in the harness window.`, sticky: false, link: false };
    case 'left-focused': return { text: `Switched to ${who} in the harness window.`, sticky: false, link: false };
    case 'left-steered': return { text: `${who}'s tab in the harness window shows the agent now — Chrome did not let this click bring it to the front; it is the tab in your other window.`, sticky: false, link: false };
    case 'left-blocked':
      return { text: `Chrome blocked the harness window from opening ${who} — click ${who} in the 🪟 harness host tab there, and allow pop-ups for this site once (address-bar icon) so it opens by itself from now on.`, sticky: true, link: false };
    case 'left-queued':
      return { text: `The 🪟 harness host tab is still in THIS window — drag it into your other (left) window; ${who} opens there as soon as it is moved.`, sticky: true, link: false };
    case 'host-created':
      return { text: `One-time setup: opened the 🪟 harness host tab beside this one. Drag it into your other (left) window — ${who} opens there, and so will every agent from now on, also after a refresh. (Already had one there asleep? Click it once; this new one hands over and closes.)`, sticky: true, link: false };
    case 'host-blocked':
      return { text: `Chrome blocked opening the 🪟 harness host tab. Allow pop-ups for this site (address-bar icon), then click ${who} again.`, sticky: true, link: false };
    case 'host-silent':
      return { text: `The 🪟 harness host tab did not answer for ${who} — click it once in the other window (Chrome may have put it to sleep), then click again. Or`, sticky: true, link: true };
    // The target itself (openspec open-agent-everywhere): the opener never ran — here is why.
    case 'no-fleet':
      return { text: `Cannot open ${who} yet: the fleet status has not arrived — try again in a moment.`, sticky: true, link: false };
    case 'unknown-machine':
      return { text: `Cannot open ${who}: its machine is not in the fleet status (removed or re-registered) — fix the card's assignee.`, sticky: true, link: false };
    case 'no-address':
      return { text: `Cannot open ${who}: the machine ${d.machine ? `"${d.machine}" ` : ''}has no address the hub can link to.`, sticky: true, link: false };
    case 'unknown-agent':
      return { text: `Cannot open ${who}: ${d.machine ? `"${d.machine}" ` : 'the machine '}does not list that repo agent (unregistered or unmanaged there). Open the harness itself instead:`, sticky: true, link: true };
    case 'app-missing':
      return { text: `app ${d.app || '?'} not found on ${who} — opened the agent without it.`, sticky: true, link: false };
    case 'unreachable':
      return { text: `${d.machine ? `"${d.machine}" ` : 'The machine '}did not answer the hub's last probe — opening ${who} anyway; the tab may not load.`, sticky: true, link: true };
    default:
      return { text: `Could not open ${who}.`, sticky: true, link: true };
  }
}

/** The same outcome as a TOAST payload (openspec manage-toast-overlay): text + stickiness
 * from `openNoticeText`, the "open in a new tab" link only when the outcome carries a URL,
 * and the data-* hooks the old banner exposed. Pure; node-tested. */
export function openToastOf(d) {
  const v = openNoticeText(d);
  return {
    text: v.text,
    sticky: v.sticky,
    link: v.link && d?.url ? { href: d.url, text: `open ${(d && d.label) || 'the agent'} in a new tab ↗` } : null,
    data: { 'open-notice': (d && d.result) || '', 'open-notice-agent': (d && d.key) || '' },
  };
}
