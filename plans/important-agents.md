# Important agents

> **Status:** BUILT + browser-verified on an isolated :5210 instance
> (`verify-important-agents.mjs` 16/16 cards, `verify-important-phones.mjs` 5/5
> phones); not yet merged or deployed. On `feature/important-agents`.
> Branched from `main` @ `60520ed` (2026-06-15).

## Goal

Let the user flag an agent as **important** so its **dashboard dock** stands out
and sorts to the top. Marking is a **toggle** — an important agent can be set
back to normal. Scoped to the **dashboard "wall of phones"** (the Agents tab is
not involved). Advanced-mode (the dashboard is already Advanced-gated).

## Behaviour

- A **⭐ toggle button** in the dashboard dock header marks the agent important.
- An important agent's dock gets a **bright-red, thicker border** (vs the normal
  1px border) on the **dashboard phone dock** (`.phone`), coexisting with the
  existing recency border.
- Important docks sort **first in the dashboard** (currently recency-sorted →
  important-first, then recency among them).
- Clicking the toggle again clears `important` → the dock returns to normal.
- **Multiple** agents may be important; they cluster at the top, ties keep the
  existing relative (recency) order.

## Where it plugs in (grounded in the current code)

Persisted, backend-synced per-dock flag — exactly the path `color` / `dashboard`
already take, so it survives reloads and syncs across devices.

| Concern | File | Note |
|---|---|---|
| Flag on the model | `ClaudeWeb.App/Services/Dock/DockRegistry.cs` | add `bool Important` to `DockTab` (default false); carry it in `Update()` + `Clone()` |
| API in/out | `ClaudeWeb.App/Controllers/DockController.cs` | add `bool? Important` to the PATCH request + `important` to `ToDto` |
| Client sync | `client/src/context/DockContext.jsx` | include `important` in `toServerPatch()`; read `tab.important` |
| Toggle button + handler | `client/src/components/dashboard/PinnedAgent.jsx` | ⭐ button in the dock header; `updateTab(id, { important: !tab.important })` |
| Dock border | `client/src/pages/dashboard.css` | `.phone--important` → thick bright-red border (sits over the recency border) |
| Dashboard order | `client/src/pages/Dashboard.jsx` | `orderedTabs` memo: important-first, then recency |

The unique key per agent is `tab.id` (stable across devices); `important`
defaults to `false`, so old `dock.json` entries are unaffected.

## Decisions (settled with the user 2026-06-15)

- Button: a **⭐ toggle** in the dashboard dock header.
- Ordering target: the **dashboard docks** (not the Agents tab).
- **Multiple** important agents allowed (cluster at top).

## Scope

One focused slice — dashboard only:

1. Backend `important` flag (model + PATCH + DTO + persistence).
2. ⭐ toggle button on the dashboard dock header.
3. Red-thick `.phone--important` border.
4. Important-first dashboard ordering.

(Out of scope, possible later: mirroring the toggle/border onto the Agents-tab
cards.)

## Verification

Browser-verified on an isolated harness instance per the repo's
`docs/claude-web/browser-testing.md` (curl can't see React state) — assert the
border style, the post-toggle dashboard ordering (important docks first), and
that toggling off restores normal. Dock tests must POST their own `/api/dock`
tab and clean it up (the :520x preview shares `%APPDATA%\ClaudeWeb\dock.json`
with the live agent tabs — see the dock-sync test gotchas).
