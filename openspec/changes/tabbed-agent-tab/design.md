# Design — tabbed-agent-tab

## D1 · Embed = the Dashboard in solo mode

The phone's props (live status, recency, git info and refresh, loops, flags, depends-on
candidates, content zoom, the handlers) are composed in one place, `Dashboard.jsx`. Rendering
`PinnedAgent` directly would mean copying that composition. So the Agent tab renders the
Dashboard itself with `solo={tabId}`: `tabs` becomes that one tab (ignoring the "show on
dashboard" toggle — the Operator named the agent), `view` is forced to phones, and the JSX
takes an early branch that calls the wall's own `renderDock(tab, { tag: 'div' })` and nothing
else. Everything the wall will ever add to a phone appears here for free.

## D2 · Full screen is the shell's rule, not the page's

`Layout.StudioShell` decides the content branch. For `/studio/agent` it renders the plain
content area even when `useMultiPane` would otherwise be active, adds `app-frame--agent`
(no phone-column cap) and `app-content--agent` (no padding, no scroll — the phone scrolls
inside). `useMultiPane` drops the Agent tab from its tab list and returns "not multi" when the
Agent route is active, so no pane ever shows the phone beside other tabs and no span setting
can shrink it. Other tabs keep their strip.

## D3 · Landing is the deep link's job

The `?agent=` handler in `DockContext` already activates the agent once per page load; it now
also navigates to the Agent tab (`landingPathForAgentLink`), replacing the entry so back /
refresh do not re-steer. Only a link with `?agent=` lands there; opening `/studio` by hand
behaves as before — the Operator asked for that unless one default were clearly better, and
the Chat default is fine for a direct open.

## D4 · The nav slot

`sortTabs` (pure, `layout/tabOrder.js`) keeps the registry's rule — saved order first,
unmentioned tabs in default order — with one exception: an unplaced Agent tab sits right
after Chat. Once the Operator places it, the saved order wins.
