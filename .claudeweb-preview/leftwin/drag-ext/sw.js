// Test-only: leftwin-drag.mjs evaluates self.dragTab(urlPart, intoUrlPart) here — move the first tab whose URL
// contains urlPart into the window holding a tab whose URL contains intoUrlPart (the Operator's tab drag).
self.dragTab = async (urlPart, intoUrlPart) => {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => (t.url || '').includes(urlPart));
  const into = tabs.find((t) => (t.url || '').includes(intoUrlPart) && t.windowId !== tab?.windowId);
  if (!tab || !into) return { ok: false, tabs: tabs.map((t) => t.url) };
  await chrome.tabs.move(tab.id, { windowId: into.windowId, index: -1 });
  await chrome.tabs.update(tab.id, { active: true });
  return { ok: true, from: tab.windowId, to: into.windowId };
};
// The active tab of every window — ground truth for "raised" (a page cannot report this about itself
// under automation).
self.activeTabs = async () => (await chrome.tabs.query({ active: true })).map((t) => ({ windowId: t.windowId, url: t.url }));
