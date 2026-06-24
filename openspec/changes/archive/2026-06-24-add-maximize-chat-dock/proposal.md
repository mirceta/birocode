## Why

On the dashboard, each agent dock (the "phone" tile) stacks several non-chat regions above the
chat — the phone bar/header, the lane switcher (Builder/Ask/Files), the local-apps switcher, the
git-status block, and the discover-local-apps block. Together these consume roughly 40% of the
dock's vertical height, leaving the chat (message list + composer) — the part the operator
actually reads and types into — cramped. When the operator just wants to focus on the
conversation, there is no way to reclaim that space.

## What Changes

- Add a **maximize-chat toggle** button to the chat toolbar in each agent dock, placed
  immediately next to the existing **Tool Calls** button (`.chat__tools` in `client/src/pages/Chat.jsx`).
- When maximized, the dock hides its non-chat chrome (phone bar, lane switcher, local-apps
  switcher, git-status, discover) so the chat fills the dock's full vertical space.
- Clicking the same button again **restores** the dock to its previous (normal) layout. It is a
  pure two-state toggle on one button, with a clear pressed/active visual state and a title /
  aria-label.
- The maximized state is **per-dock** (each agent dock maximizes independently) and **ephemeral**
  UI state — it is not persisted and resets to normal on reload. No backend changes.
- The toggle is shown **only in Advanced mode**, behind the same gate as the agent dock and the
  tool-call-history toggle it sits beside; Basic (Simple) mode is unaffected.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `agent-dock`: Adds a requirement that an agent dock can collapse its non-chat chrome so the chat
  fills the dock, toggled per-dock from the chat toolbar, behind the existing Advanced gate, with
  the state being ephemeral.

## Impact

- Frontend only. Affected files:
  - `client/src/components/dashboard/PinnedAgent.jsx` — owns the per-dock maximized state and
    conditionally renders / collapses the `.phone__*` chrome regions; passes the toggle down to
    the chat toolbar.
  - `client/src/pages/Chat.jsx` — renders the new toggle button beside the Tool Calls button
    (`.chat__tools`) and surfaces the toggle handler/state.
  - `client/src/components/dashboard/dashboard.css` and/or `client/src/components/chat/chat.css` —
    collapse the chrome regions and style the button's active state.
  - `client/src/i18n/en.json`, `client/src/i18n/tr.json` — label / aria text for the toggle.
- No backend, API, persistence, or data-model changes. No new dependencies.
