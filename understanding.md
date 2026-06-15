# Understanding — Local app on the agent dock

## Goal

Make a Repo's **Local tab app** (the per-project product on its `localPort`,
see `plans/local-app-tab.md`) **renderable inside the agent dock** (`PinnedAgent`,
the "phone" in the Agent Dashboard) that hosts that agent.

## First step (this slice)

Before rendering the app, **pin whether the agent serves a local app**. On each
dock, add a dedicated **space above the git section** stating whether a Local-tab
app was determined to be served in this agent — e.g. its port / serving state, or
"no local app" when none is configured/listening.

## Concrete things I'll do (slice 1)

- In `PinnedAgent.jsx`, add a `phone__localapp` block **above** the existing
  `phone__git` block.
- Feed each dock its repo's `localPort` from `Dashboard.jsx` (the `repos` list
  already carries it, like `repoPath`).
- Show the local-app status row: serving on `:PORT` vs. not configured / not
  listening.

## Later slices (the larger feature)

- Actually iframe/proxy the local product inside the dock (reuse `ProductFrame`
  / `/api/localview/{repoId}/`), toggleable with the chat view.

## Assumptions

- "Served" is derived from the repo's `localPort` (config), with a liveness
  probe as the refinement that turns "configured" into "determined to be served".
- Advanced-mode dock only, consistent with the Local tab's `localAppTab` gating.
