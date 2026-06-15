# Agent "waiting on" toggle

> **Status:** SHIPPED — browser-verified on an isolated :5210 instance
> (`verify-agent-waiting.mjs` 13/13: toggle, amber ring, "waiting on" text
> persists across reload, coexists with important, toggle-off restores);
> **deployed to live :5099 & confirmed 2026-06-15, merged to main.** On
> `feature/agent-waiting`, branched from `main` @ `7ea7b28` (2026-06-15). Direct
> sibling of [important agents](important-agents.md) — same backend-synced
> dock-flag path.

## Goal

Let the user mark an agent's **dashboard dock** as **waiting for another agent to
finish**, with the **option to write which agent** it's waiting on. Like
[important](important-agents.md), it's a **toggle** (settable back to normal),
scoped to the dashboard "wall of phones," Advanced-mode (the dashboard is already
Advanced-gated).

## Behaviour

- A **toggle button in the dock header** (sibling of the ⭐ `ImportantStar`, e.g.
  an ⏳ hourglass) marks the agent **waiting**.
- When waiting, a **small inline text field** lets the user type **which agent**
  it's waiting on (free text). Waiting with **no name** is valid — the marker can
  be on while the "on whom" text is blank.
- A waiting dock gets a **distinct visual cue** — an amber "blocked / waiting"
  badge (and/or a muted border), deliberately different from important's
  bright-red border so the two states read apart and can **coexist** (an agent
  can be both important and waiting).
- Toggling off clears the waiting state (and its text) → the dock returns to
  normal.
- **Multiple** agents may be waiting at once.

## Data model — settle first

Two clean options; the plan leans toward **(A)**:

- **(A) `bool Waiting` + `string WaitingOn`** — explicit "is waiting" flag plus an
  optional free-text agent name. Keeps "waiting but unnamed" unambiguous. PATCH
  carries both.
- (B) A single nullable `string WaitingOn` where `null` = not waiting, `""` =
  waiting/unspecified, value = waiting on that agent. Fewer fields but conflates
  "blank name" with "not waiting" unless null vs empty-string is preserved
  end-to-end (JSON null handling is fiddly).

Either way it defaults to **not waiting**, so old `dock.json` entries are
unaffected.

## Where it plugs in (grounded in the current code — mirrors important-agents)

Persisted, backend-synced per-dock flag — the exact path `color` / `dashboard` /
`important` already take.

| Concern | File | Note |
|---|---|---|
| Flag on the model | `ClaudeWeb.App/Services/Dock/DockRegistry.cs` | add `bool Waiting` + `string? WaitingOn` to `DockTab` (defaults: false / null); carry in `Update()` + `Clone()` |
| API in/out | `ClaudeWeb.App/Controllers/DockController.cs` | add `bool? Waiting` + `string? WaitingOn` to the PATCH request + `waiting`/`waitingOn` to `ToDto` |
| Client sync | `client/src/context/DockContext.jsx` | include `waiting` + `waitingOn` in `toServerPatch()`; read `tab.waiting`/`tab.waitingOn` |
| Toggle + text + handler | `client/src/components/dashboard/PinnedAgent.jsx` | add a `WaitingBadge` next to `ImportantStar` in the header; `updateTab(id, { waiting: !tab.waiting })` and an inline input → `updateTab(id, { waitingOn: text })` |
| New component | `client/src/components/dashboard/WaitingBadge.jsx` | modeled on `ImportantStar.jsx` — a `role="button"` span inside the open-agent `<button>` that `stopPropagation`s; plus the inline name field |
| Visual cue | `client/src/pages/dashboard.css` | `.phone--waiting` amber badge / muted border (distinct from `.phone--important`) |
| i18n | `client/src/i18n/en.json` + `tr.json` | `dashboard.markWaiting` / `unmarkWaiting` / `waitingOnPlaceholder` etc. |

The unique key per agent is `tab.id` (stable across devices).

## Scope

One focused slice — dashboard only:

1. Backend `Waiting` (+ `WaitingOn`) flag (model + PATCH + DTO + persistence).
2. ⏳ toggle + inline "which agent" field on the dashboard dock header.
3. `.phone--waiting` visual cue (amber, coexists with `.phone--important`).

Out of scope (possible later): reordering the dashboard by waiting state (e.g.
sink waiting agents to the bottom); a **dropdown** of the other dock agents
instead of free text (would link the "waiting on" to a real agent); mirroring
onto the Agents-tab cards.

## Open questions (defaults chosen; tell me to change)

- Which-agent input: **free text** (default, you said "writing which agent") vs a
  dropdown of the other docks.
- Ordering: **none** (default) vs sink waiting docks to the bottom.
- Icon/cue: ⏳ + amber badge (default).

## Verification

Browser-verified on an isolated harness instance per
`docs/claude-web/browser-testing.md` (curl can't see React state) — assert the
badge appears on toggle, the typed "waiting on" text persists across a reload,
that it coexists with important, and that toggling off restores normal. Dock
tests must POST their own `/api/dock` tab and clean it up (the :520x preview
shares `%APPDATA%\ClaudeWeb\dock.json` with the live agent tabs — see the
dock-sync test gotchas).
