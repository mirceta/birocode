// The user's saved tab order applied to the visible tab list (plans/settings-tab.md), pure
// so it unit-tests under `node --test`. Tabs the saved order does not mention follow in
// default order — new tabs ship without migrations. ONE exception (openspec
// tabbed-agent-tab): the Agent tab, when the saved order has never placed it, sits right
// after the Chat tab instead of at the end, so the tab the Operator lands on from the
// Management board is also next to Chat in the bottom nav on every device.
export const AGENT_TAB_KEY = 'agent';
export const CLAUDE_TAB_KEY = 'claude';

export function sortTabs(tabs, tabOrder) {
  const idx = new Map((tabOrder || []).map((k, i) => [k, i]));
  const claudeSort = idx.has(CLAUDE_TAB_KEY) ? idx.get(CLAUDE_TAB_KEY) : null;
  return tabs
    .map((t, i) => {
      let sort;
      if (idx.has(t.key)) sort = idx.get(t.key);
      else if (t.key === AGENT_TAB_KEY && tabs.some((x) => x.key === CLAUDE_TAB_KEY)) sort = (claudeSort ?? 1000 + tabs.findIndex((x) => x.key === CLAUDE_TAB_KEY)) + 0.5;
      else sort = 1000 + i;
      return { t, sort };
    })
    .sort((a, b) => a.sort - b.sort)
    .map((x) => x.t);
}

/** Where the tabbed view lands when opened with ?agent= (the Management board's "open
 * harness"): the Agent tab when the feature is on, else the Chat tab as before. */
export function landingPathForAgentLink(agentTabEnabled) {
  return agentTabEnabled ? '/studio/agent' : '/studio';
}

/** The Agent tab never shares the screen: it is left out of the pane strip's tab list, and
 * when it is the active route the strip is not used at all. */
export function paneTabsWithoutAgent(tabs) {
  return (tabs || []).filter((t) => t.key !== AGENT_TAB_KEY);
}

export const isAgentPath = (pathname) => (pathname || '').replace(/\/+$/, '') === '/studio/agent';
