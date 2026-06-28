# Enable the Local app tab in Basic mode

## Why

The **Local tab** (`plans/local-app-tab.md`) is how a project shows its **running
product** to the person looking at the harness: it embeds the repo's local app(s)
through the same-origin `/api/localview/<repoId>/app/<appId>/` proxy (behind the
login), with an app switcher, a refresh, and an open-in-new-tab link. That is
exactly the surface an **End User** wants — "show me the thing Claude built."

Today it is hidden from them: `FEATURES.localAppTab = 'advanced'`
(`client/src/context/UiModeContext.jsx:42`), so the tab is gated out for Basic-mode
users (`client/src/layout/tabRegistry.jsx:37`, `:57`). A Basic user can chat, see
files/history, and switch projects, but cannot see the product running — they'd have
to flip to Advanced, which defeats the clean End-User view.

The catch is that the Local tab page is **not purely a viewer**. When a repo has no
real app yet it **auto-opens an authoring form** —
`setAdding(repoApps.length === 0)` (`client/src/pages/LocalApp.jsx:37`) — showing a
port-number input and a "how to make your app embeddable" developer walkthrough
(`LocalApp.jsx:157-200`). It also offers **remove (`×`)**, an **Expose-verify**
diagnostic, and an **"+ Add app"** button (`LocalApp.jsx:114-149`). Those are
**Operator/developer** actions, not End-User ones. Flipping the flag alone would
drop a port-config form and dev instructions in front of the End User — the opposite
of Basic mode's "clean messaging-app view" intent.

So this change does two things: **show the tab in Basic**, and **make the Basic
Local tab view-only** so the End User sees the product, not its plumbing.

## What Changes

- **Promote the Local tab to Basic.** `FEATURES.localAppTab` moves from `'advanced'`
  to `'basic'`, so the Local tab appears in the Basic bottom-nav. (Per CLAUDE.md's
  capability-map convention, promoting a feature to Basic is an explicit, one-line
  map change — recorded here.)
- **The Basic Local tab is view-only.** For a Basic-mode user the Local tab SHALL
  show only the **viewing** surface — the app switcher, the embedded product frame,
  Refresh, and the open-in-new-tab link — and SHALL hide every **authoring/operator**
  control: the add-app form and "+ Add app" button, the per-app remove (`×`), the
  Expose-verify button and its panel, and the "how to make embeddable" setup section.
- **No auto-opened authoring form in Basic.** The behavior that auto-opens the
  add-app form when a repo has no real app SHALL NOT trigger in Basic mode. Instead a
  Basic user with no repo app sees a friendly empty state (the always-on
  harness-provided **Understanding app** still renders as the fallback view).
- **Advanced is unchanged.** In Advanced mode the Local tab keeps every control it
  has today (add, remove, expose-verify, the setup walkthrough, the auto-open form).
- **Per-project, self-repo-safe by construction.** The Local tab follows the selected
  project. Basic users already cannot select the Self-Development repo (shipped in
  `project-visibility`), so the self repo's local apps stay Advanced-only with no
  extra work; opening any non-self project shows that project's local app(s).

## Impact

- **Affected specs:** `local-app-tab` (**new capability, seeded** by this change —
  `plans/local-app-tab.md` was never folded into `openspec/specs`; seed-and-grow per
  CLAUDE.md as we touch it).
- **Affected code (frontend):**
  - `client/src/context/UiModeContext.jsx:42` — `localAppTab: 'advanced'` →
    `'basic'`.
  - `client/src/pages/LocalApp.jsx` — gate the authoring surface behind
    `useFeature` of an Advanced-only capability (add form + "+ Add app", remove `×`,
    Expose-verify + `ExposeCheck`, the "how" section), suppress the auto-open-form
    effect in Basic, and render a Basic empty state when there is no repo app.
- **Mode is device-local / client-side** (`UiModeContext.jsx`, localStorage
  `claudeweb_ui_mode`); the backend has no notion of UI mode. As with existing
  per-mode gating, this is enforced on the client. The `/api/localview/...` proxy and
  `/repos/{id}/localapps` write endpoints remain reachable by any authed client that
  calls them directly — **out of scope:** server-side per-mode authorization of those
  endpoints (a separate change).
- **Dock switcher unaffected in Basic.** `PinnedAgent.jsx:67` reads
  `useFeature('localAppTab')`, which becomes true in Basic — but the agent dock /
  dashboard is itself `agentDock: 'advanced'`, so it never renders for a Basic user;
  no new dock surface appears.
- **`localAppDiscovery` stays Advanced** (the dock's "Discover local apps" agent-scan
  button, `UiModeContext.jsx:55`) — it is a developer tool, unrelated to viewing a
  product, and is not promoted by this change.
- **Bonus:** the harness-provided Understanding app becomes reachable by End Users
  via the Local tab (agent-authored explainers/diagrams), which is desirable.
- **Out of scope:** any change to the App tab (`appTab`, port 5200 preview), to how
  Advanced users author local apps, or to the localview proxy itself.
