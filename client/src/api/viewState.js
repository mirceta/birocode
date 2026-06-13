// Per-tab view state — "which space is THIS browser tab looking at": the active
// agent tab, the chat surface, and the selected project.
//
// These used to live in localStorage, which every tab of the same browser
// shares, so opening a different agent in one tab leaked into another tab on its
// next refresh (two people on one machine clobbering each other — see
// plans/dock-sync.md "Active Tab"). sessionStorage is scoped to a single browser
// tab and survives a refresh, so each tab is independent.
//
// localStorage is still written as a *seed*: a brand-new tab (or a browser
// restart, which clears sessionStorage) reads it to restore the last-used
// selection. Once two tabs exist they each diverge in their own sessionStorage,
// so a refresh never inherits the other tab's choice.

export function readTabState(key) {
  try {
    const own = sessionStorage.getItem(key);
    if (own !== null) return own; // this tab already has a choice
    return localStorage.getItem(key); // fresh tab: seed from the last-used value
  } catch {
    return null; // private mode / storage disabled
  }
}

export function writeTabState(key, value) {
  try {
    if (value === null || value === undefined || value === '') {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value); // per-tab, authoritative
      localStorage.setItem(key, value); // seed for future tabs / restart
    }
  } catch {
    /* private mode / storage disabled */
  }
}
