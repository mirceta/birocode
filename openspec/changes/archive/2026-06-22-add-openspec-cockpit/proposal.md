# Add an OpenSpec Cockpit tab to the Control Room — browse what's in flight, what shipped, and the living baseline

## Why

The Control Room's **Console** tab can *run* OpenSpec commands, but reading their raw
text output is how you'd *learn the CLI* — not how you'd *operate day to day*. The old
`plans/*` planning layer gave the operator four at-a-glance moves: see the **current
plan**, see **what's active**, **inspect old / closed plans**, and check a capability's
**status**. Every one of those moves still exists under OpenSpec — but only as a command
you must remember and parse by eye:

| Old `plans/*` move | OpenSpec primitive today |
|---|---|
| look at the current/active plans | `openspec list` (active changes) |
| inspect an old / closed plan | read `openspec/changes/archive/<id>/` by hand |
| "what does the system do today?" | `openspec spec list` + `openspec show <cap>` |
| a feature's completion status | `openspec list` task counts / `openspec status` |

There is no **visual** surface that answers *"what's in flight? what shipped? what does
the system do today?"* the way the old planning dashboard did. The Console shows you how
to *drive* OpenSpec; nothing yet shows you how to *read* it at a glance — or teaches, in
the UI itself, how the old moves map onto the new primitives. This change adds that
surface: the **inspect-twin** of the Console.

## What Changes

- **New "Cockpit" tab** in the Control Room (`openspec-port-app/`) — a read-only,
  good-looking dashboard of live OpenSpec state, grouped to mirror the lifecycle
  (in-flight → shipped → folded into the baseline):
  - **In flight** — active changes from `openspec list --json` as cards: a
    task-completion ring (`completedTasks/totalTasks`), `status`, and `lastModified`;
    click a card to drill into its deltas + task checklist (`openspec show <id> --json`).
  - **Shipped** — archived changes read from `openspec/changes/archive/`, newest first,
    each showing its ship date (folder date prefix) and proposal title — the queryable
    "what closed" the old `plans/*` archive never surfaced cleanly.
  - **Living baseline** — capabilities from `openspec spec list --json` with requirement
    counts; click to read a capability's requirements + scenarios (`openspec show <cap>
    --json`). This is the "what does the system do *today*?" view.
  - **Old → OpenSpec legend** — the mapping table above, rendered in-app, so the operator
    learns the translation while using it.
- **Read-only data API** in `serve.mjs` — one `GET ./api/cockpit` endpoint that aggregates
  the three sources in a single fetch: active changes (`openspec list --json`), specs
  (`openspec spec list --json`), and archived changes (server reads the `archive/`
  directory and each `proposal.md`'s H1 title — no CLI exposes shipped changes). Plus a
  `GET ./api/cockpit/show?id=<name>` passthrough to `openspec show <id> --json` for
  drill-in. **Read-only**: no new write verbs join the exec whitelist.

## Impact

- **Affected specs:** `openspec-cockpit` (new capability, seeded by this change's delta).
- **Affected artifacts (edited):**
  - `openspec-port-app/index.html` — a `Cockpit` nav button (in the **Understand** group)
    and its `<section>` scaffold.
  - `openspec-port-app/app.js` — fetch `./api/cockpit`, render the four sections + drill-in.
  - `openspec-port-app/styles.css` — cockpit cards, completion rings, lifecycle layout.
  - `openspec-port-app/serve.mjs` — the read-only `./api/cockpit` aggregation (shells the
    two `--json` reads, reads the `archive/` dir) and `./api/cockpit/show` passthrough.
  - `understanding-app/index.html` — overwritten with a lifecycle→cockpit companion visual.
- **Out of scope:**
  - No harness (`ClaudeWeb.App/`) changes — this is the standalone Local app on `:5310`.
  - **No new write actions** — proposing, archiving, validating still happen in the Console
    tab / CLI; the Cockpit only reads.
  - Browser-eyeball of the live tab render/animation on `:5310` (or the Local tab) — no
    sandbox browser; left as a verify task.
