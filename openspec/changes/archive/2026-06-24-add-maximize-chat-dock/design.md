## Context

On the dashboard, an agent dock is the "phone" tile rendered by
`client/src/components/dashboard/PinnedAgent.jsx`. The tile is a `flex-direction: column`
container (`.phone`) whose children, top to bottom, are fixed-height (`flex: 0 0 auto`) chrome
regions followed by a flex-filling screen that holds the chat:

- `.phone__bar` — header (status dot, repo, path, important/wide/waiting toggles)
- `.phone__lanes` — Builder / Ask / Files lane switcher
- `.phone__apps` — local-apps switcher (optional)
- `.phone__git` — git-status block (branch/ahead/behind, refresh, merge/pull actions)
- `.phone__discover` — discover-local-apps block (optional)
- `.phone__screen` (flex: 1) — contains the embedded `<Chat>` (`.chat--embedded`), whose own
  children are `.chat__bar` (toolbar), `.chat__body` (scroll + overlays), `.chat-input` (composer)

The Tool Calls button is `.chat__tools` inside `.chat__bar` in `client/src/pages/Chat.jsx`
(~line 225), toggling the `toolsOpen` overlay. The chat toolbar is the natural home for the new
button. Everything here is Advanced-mode-gated already (the dock isn't shown in Basic mode).

## Goals / Non-Goals

**Goals:**
- One toggle button, next to Tool Calls, that hides the dock's non-chat chrome so the chat fills
  the dock; pressing again restores the normal layout.
- Per-dock, ephemeral state. No backend, no persistence, no new dependencies.
- Keep the composer and chat toolbar usable while maximized (so the user can un-maximize and keep
  typing).

**Non-Goals:**
- Persisting the maximized state across reloads or syncing it across devices.
- A full-screen / studio takeover of the dock (that already exists via the phone bar). This only
  reclaims the in-dock chrome space.
- Touching the standalone (non-embedded) Chat page layout or Basic mode.

## Decisions

**State owner: `PinnedAgent`, not `Chat`.** The chrome regions being collapsed (`.phone__*`) are
rendered by `PinnedAgent`, so the boolean (`chatMaximized`) lives there as `useState(false)`.
`PinnedAgent` passes both the current value and a toggle callback down into the embedded `<Chat>`
so the button can render in the chat toolbar while the layout effect happens in the parent.
Alternative considered: lifting state to `Dashboard` keyed by agent id — rejected as unnecessary;
the state is ephemeral and local to one tile, and `PinnedAgent` already re-mounts per agent.

**Collapse via conditional render / CSS class, not unmount of Chat.** When `chatMaximized` is
true, `PinnedAgent` either skips rendering the chrome regions or adds a `phone--chat-max` modifier
class that sets those regions to `display: none`. The `<Chat>` subtree is NOT remounted, so chat
state, scroll position, and the streaming connection are preserved across toggles. Prefer a
modifier class (`phone--chat-max`) so the CSS owns visibility and there is a single source of
truth; the chrome JSX stays mounted but hidden, which is cheap and avoids layout churn.

**Button placement and semantics.** Render the toggle in `.chat__bar` immediately adjacent to
`.chat__tools`, only when the embedded/dock context applies (the toggle props are present). It
mirrors the Tool Calls button's pattern: `aria-pressed`, an active modifier class
(`chat__maximize--on`), and an i18n title/aria-label (`chat.maximizeChat` / `chat.restoreChat`).
Because the dock is Advanced-only, no extra capability gate is needed beyond where the dock and
Tool Calls button already render.

**i18n.** Add keys to `client/src/i18n/en.json` and `tr.json` for the label and its two states.

## Risks / Trade-offs

- [Composer hidden when maximized] The composer (`.chat-input`) lives inside `.phone__screen`, not
  in the chrome being collapsed, so it stays visible — but verify in the browser that nothing in
  the chrome was load-bearing for the composer's layout → Mitigation: Playwright check on an
  isolated preview port that the composer and both toolbar buttons are clickable while maximized.
- [Other lanes/views] A dock can show Files or a local app in `.phone__screen` instead of chat.
  The toggle should be meaningful only for the chat lane → Mitigation: render the button only in
  the chat (Builder/Ask) context and decide whether maximize is offered when a non-chat lane is
  active; simplest is to only show it on chat lanes, matching where `.chat__bar` exists.
- [State lost on lane switch] Switching lanes may reset local layout if it remounts → acceptable
  given the state is intentionally ephemeral; document it rather than engineer persistence.

## Migration Plan

Pure additive frontend change. Ship by rebuilding `client/dist` and deploying via `swap.ps1`.
Rollback is trivial (revert the commit); no data or API surface changes, nothing to migrate.

## Open Questions

- Should the maximize button appear when a non-chat lane (Files / local app) is active in the
  dock, or only on chat lanes? Leaning chat-lanes-only since it collapses dock chrome around the
  chat specifically. Resolve during implementation against how `.chat__bar` is mounted.
