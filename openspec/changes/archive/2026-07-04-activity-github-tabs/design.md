# Design: activity-github-tabs

## Layout — attention pinned, two tabs below (operator decision)

```
┌ header (status stats · display toggle · sound controls) ─────────┐
├ #attnWrap  "Needs me"  — the attention queue, ALWAYS visible ─────┤
├ .tabbar   [ Activity ] [ GitHub ] ───────────────────────────────┤
├ .tabpanel[activity]  — Sources + add-harness + merged feed ───────┤
└ .tabpanel[github]    — GitHub tiles + in-app PR browser ──────────┘
```

The attention queue sits **above** the tab bar, outside both panels — it is the "needs me now" signal and must never be a tab-switch away (operator decision). Exactly one `.tabpanel` shows at a time in interactive mode.

## Decision 1 — pure client-side tab shell, one board poll

No new markup arrives from the server and no endpoint changes. The existing sections are wrapped in two `.tabpanel` divs; a `.tabbar` toggles which is visible. The single `board` poll already paints attention + sources + github every cycle regardless of which tab is on-screen — a hidden panel is `display:none`, still updated in the DOM — so switching tabs is instant with zero round-trips and no re-fetch. This mirrors how the page already renders all sections from one poll.

## Decision 2 — tab state is device-local and URL-addressable

Same pattern as the Simple/Advanced toggle and `?display=1`: the active tab persists in `localStorage` (so a device reopens where it left off) and is reflected in a `?tab=github` query param (so a tab is linkable/bookmarkable). Precedence on load: explicit `?tab=` in the URL wins; else `localStorage`; else default **Activity**. Selecting a tab updates both `localStorage` and the URL (via `history.replaceState`, no reload). `?tab=` and `?display=1` compose — but see Decision 3.

## Decision 3 — display mode is tabless, unchanged

Display mode's contract (status-monitor *Display mode* requirement) is untouched: the wallboard shows the attention queue, fleet, and GitHub tiles enlarged in one glance. So in display mode the **tab bar is hidden and both panels render** (the `?tab=` value is ignored). CSS does this without JS branching:

```css
body:not(.display)[data-tab="activity"] .tabpanel[data-tab="github"]   { display:none }
body:not(.display)[data-tab="github"]   .tabpanel[data-tab="activity"] { display:none }
body.display .tabbar { display:none }
/* display mode already hides addform/acts/feed/sound via existing rules */
```

The merged feed and add-harness form are still hidden in display mode by the existing `body.display` rules — those live inside the Activity panel and stay suppressed, so the wallboard looks exactly as it does today.

## Decision 4 — accessibility & keyboardability

The tab bar is a real `role="tablist"` with `role="tab"` buttons (`aria-selected`, `aria-controls`); each panel is `role="tabpanel"`. Left/Right arrow keys move between tabs, matching the WAI-ARIA tabs pattern — cheap to add in a build-less page and it keeps the surface navigable without a mouse.

## Alternatives rejected

- **Two separate pages / bring back `board.html`** — reintroduces the "second page to visit" the operator withdrew on 2026-07-03; also would need a second poll. Tabs keep one page/one poll.
- **Tabs in display mode too** — the wallboard is zero-interaction by definition; a tab you cannot click is pointless, and it would drop half the fleet glance off the third monitor.
- **Attention inside the Activity tab** — an alert would be invisible while on GitHub. Rejected per operator decision to pin it on top.
