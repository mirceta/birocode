## Why

Each agent dock on the dashboard already lets the operator flip between four lanes —
Builder, Ask, Files, Console — to inspect an agent's repo without leaving the dock. The
harness now has a first-class OpenSpec **Cockpit** view (in-flight · shipped · baseline),
but it is only reachable from the global Studio tab, scoped to the *globally selected*
repo. When you are watching several agents at once, there is no way to glance at *this*
agent's OpenSpec state from its dock — you must leave the dashboard and re-point the global
repo selector. A fifth lane closes that gap and makes the dock a complete per-agent inspect
surface.

## What Changes

- Add a fifth lane button — **OpenSpec** — to the agent dock's lane switcher in
  `PinnedAgent.jsx`, a sibling of the existing Builder / Ask / Files / Console tabs.
- Selecting it renders the OpenSpec Cockpit **over the chat** (composer stays below), the
  same overlay pattern Files and Console already use; selecting any other lane or a local
  app swaps back, with no extra bookkeeping.
- The Cockpit shown is scoped to **this dock's repo**, not the global repo selector — so two
  docks for two different repos each show their own OpenSpec state.
- Behind a new Advanced-default feature flag (`openspecDock`), matching how the Files
  (`filesDock`) and Console (`eventConsole`) lanes are gated, so Basic mode is unchanged
  unless the operator opts in.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `agent-dock`: the lane switcher gains a fifth lane (OpenSpec) as a sibling of
  Builder/Ask/Files/Console, rendering a repo-scoped OpenSpec Cockpit over the chat under an
  Advanced-default feature gate.

## Impact

- **Frontend:** `client/src/components/dashboard/PinnedAgent.jsx` (new lane button + a
  `showOpenspec` view state, mirroring `showFiles`/`showConsole`); a Cockpit view usable
  inside the dock — either by lifting `client/src/pages/Cockpit.jsx` to accept an explicit
  `repoId` prop (today it reads the global `RepoContext`) or a thin dock wrapper that passes
  `X-Repo-Id` for the dock's repo; `client/src/context/UiModeContext.jsx` (register
  `openspecDock` in the capability map, default `advanced`); i18n strings for the lane label
  + hint.
- **Backend:** none expected — the existing `GET /api/openspec/cockpit` is already
  repo-scoped via the `X-Repo-Id` header; the dock lane simply supplies this dock's repo id.
  (If the endpoint turns out to hard-depend on the global selection, a small scoping tweak
  in `OpenspecController` is in scope; design.md decides.)
- **Design trade-off to resolve in design.md:** reuse `Cockpit.jsx` (repo-prop refactor)
  vs. a dock-local wrapper — the crux is that Cockpit currently sources its repo from the
  global selector, which must not leak into the per-dock view.
