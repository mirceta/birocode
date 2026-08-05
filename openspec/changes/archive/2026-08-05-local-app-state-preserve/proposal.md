# Proposal: local-app-state-preserve

## Why

Every time the user navigates away from an embedded local app and back — switching studio tabs, switching a dock between its app view and Builder/Ask/Files/Console, or flipping between two local apps — the app reloads from scratch and loses all its frontend state (scroll position, form input, in-app navigation, in-memory data). For stateful products this makes the Local tab and dock app views frustrating to actually *use*: any glance at the chat costs you your place in the app. Embedded apps should behave like Chrome tabs in one specific sense: leave and come back, and the app is exactly where you left it — with reload as an explicit, user-triggered action instead of an accident of navigation.

Both reload paths are confirmed in code. The iframe lives in the shared `ProductFrame` component; leaving a surface unmounts it (react-router `Outlet` swap for the Local tab at `client/src/pages/LocalApp.jsx`, conditional render for the dock at `client/src/components/dashboard/PinnedAgent.jsx:761-767`, pane-window eviction in `PaneStrip`), and switching apps *within* a surface reassigns `src` on the same iframe — both destroy the embedded document.

## What Changes

- **Keep-alive for embedded local-app frames.** Once a local app has been opened in a surface (Local tab or a dock), its iframe stays mounted-but-hidden when the user navigates away — to another studio tab, another dock view, or another local app — and is re-shown as-is on return. The embedded document is never reloaded by navigation alone.
- **Per-app frames instead of one reused frame.** Switching between two local apps within the same surface shows/hides two live frames rather than reassigning `src` on one, so *each* app keeps its state.
- **Explicit per-frame refresh button.** A refresh control on the frame itself (alongside the existing zoom pill in `ProductFrame`) reloads that one app on demand. This also gives the dock a refresh affordance it currently lacks; the Local tab's existing toolbar refresh keeps working.
- **Bounded lifetime.** Kept-alive frames are ephemeral client state: a full page reload starts clean, and frames are released on clear teardown events (e.g. the repo/dock they belong to is closed or removed, or the app is removed from the repo's app list). An eviction cap for pathological many-app cases is a design.md decision.
- Not in scope: preserving state across browser reloads or harness restarts, and any change to how the apps are proxied/served (`/api/localview/...` is untouched).

## Capabilities

### New Capabilities
- `local-app-frame-persistence`: lifecycle of embedded local-app frames across navigation — keep-alive/hide-don't-unmount behavior on both surfaces (Local tab and agent docks), per-app frame identity, the explicit per-frame refresh control, and when kept-alive frames are released.

### Modified Capabilities

_None — `local-app-tab`'s existing requirements (view-only controls incl. its refresh action, app switcher, proxy embedding) and `agent-dock`'s requirements remain true as written; the new behavior is additive and lives in the new capability's spec._

## Impact

- **Frontend only.** No backend/proxy/API changes.
  - `client/src/components/app/ProductFrame.jsx` — refresh button beside the zoom cluster; participates in show/hide instead of remount.
  - A new keep-alive host layer for frames that must survive router/conditional unmounts (the main design question — React unmounting is what destroys the iframe today, so frames need to live above the `Outlet`/dock-view conditionals).
  - `client/src/pages/LocalApp.jsx`, `client/src/components/dashboard/PinnedAgent.jsx`, `client/src/components/dashboard/PaneStrip.jsx` (call sites), `client/src/components/app/product.css`.
- **Memory/resource tradeoff:** hidden live iframes keep their documents (JS timers, websockets) running; bounded by the teardown/eviction rules above.
- **UI mode:** per repo convention, new controls default to Advanced — but the frames themselves render on surfaces already gated per-surface (Local tab is Basic-visible, docks are Advanced). The refresh button's mode gating is settled in design.md.
- **Zoom feature interplay:** per-frame zoom (PR #22) state naturally survives too, since the frame no longer remounts.
