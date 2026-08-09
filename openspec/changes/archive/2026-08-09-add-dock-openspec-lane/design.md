## Context

See proposal.md — Why. The dock lane switcher in `PinnedAgent.jsx` renders Builder/Ask as
chat "lanes" and Files/Console as overlay views (`showFiles`, `showConsole`) that mount
`<FilesBrowser repoId=… />` / `<EventConsole repoId=… />` over `.phone__main` while the
composer stays below. Both overlays are Advanced-gated (`filesDock`, `eventConsole` in
`UiModeContext.jsx`). The OpenSpec view lives in `client/src/pages/Cockpit.jsx`, but it
currently sources its repo from the **global** selector: it calls `useRepo()` for
`currentRepoId`/`current` and fetches `apiGet('/openspec/cockpit')` with no per-call repo
override. The backend `GET /api/openspec/cockpit` is already scoped by the `X-Repo-Id`
header, and the API client already supports a per-call override — `apiGet(path, { repoId })`
sets `X-Repo-Id` to that id (`client/src/api/client.js`).

## Goals / Non-Goals

**Goals:**
- A fifth dock lane, OpenSpec, that mirrors the Files/Console overlay mechanics exactly.
- The overlay shows the Cockpit for **this dock's** repo, unaffected by the global selector.
- No backend change; reuse the existing repo-scoped endpoint.

**Non-Goals:**
- No new OpenSpec actions from the dock (the Cockpit stays read-only, as in Studio).
- No change to the routed Studio Cockpit tab's behavior.
- No redesign of the lane switcher layout beyond adding one sibling button.

## Decisions

**1. Reuse `Cockpit.jsx` via an optional `repoId` prop — not a fork, not a wrapper that
re-implements it.**
Make `Cockpit` accept an optional `repoId` (and `repoName`) prop. When present, it fetches
with `apiGet(path, { repoId })` and renders that repo's name, bypassing `useRepo()`'s global
`currentRepoId`; when absent, it behaves exactly as today (global selector) so the Studio tab
is untouched. The dock renders `<Cockpit repoId={tab.repoId} repoName={tab.repoName} />`.
- *Alternative — dock-local wrapper that calls the endpoint itself and re-renders the
  blocks:* rejected, duplicates the Cockpit's non-trivial rendering (rings, legend,
  cross-links) and would drift.
- *Alternative — set the global selector to the dock's repo on open:* rejected, it would
  hijack the global selection and break the "two docks, two repos, at once" requirement.

**2. Gate behind a new `openspecDock` capability, Advanced by default.**
Register `openspecDock: 'advanced'` in the `UiModeContext.jsx` capability map and add a
`const openspecOn = useFeature('openspecDock')` guard, exactly parallel to `filesDock` /
`eventConsole`. Keeps Basic mode unchanged unless opted in.

**3. Model the view as a third overlay boolean `showOpenspec`, symmetric with
`showFiles`/`showConsole`.**
Every place that currently reads/sets `showFiles && showConsole` (the `chatShowing`
computation, the lane `aria-selected`/reset handlers, the git/discover "chat furniture"
hide conditions, and the `.phone__main` render switch) gains the `showOpenspec` term. This
is mechanical but must be applied at *every* site or the overlays will fight — see Risks.

## Risks / Trade-offs

- **Missing one `show*` toggle site leaves overlays able to co-render or the git block
  visible under the Cockpit.** → Enumerate the sites from the existing `showFiles`/
  `showConsole` usages (lane buttons, `chatShowing`, discover/understanding/git guards, the
  `phone__main` ternary) and add `showOpenspec` to each; verify in the browser that lanes are
  mutually exclusive.
- **`Cockpit` reads `useRepo()` for the repo display name.** → When a `repoId` prop is
  supplied, resolve the name from the passed `repoName` prop (the dock has it on `tab`) rather
  than the global `current`, so the header labels the right repo.
- **The endpoint hard-depends on the global selection after all.** → Low risk (it reads
  `X-Repo-Id`); if so, a one-line scoping check in `OpenspecController` is in scope. Verify
  with a direct `X-Repo-Id` request during implementation before touching the backend.

## Migration Plan

Pure additive frontend change behind an Advanced-default flag; no data or API migration. Ship
with the normal `swap.ps1` deploy. Rollback is the standard dead-man switch — the lane simply
disappears on revert with no residual state.
