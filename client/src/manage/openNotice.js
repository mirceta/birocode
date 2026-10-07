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
    default:
      return { text: `Could not open ${who}.`, sticky: true, link: true };
  }
}
