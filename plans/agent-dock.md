# Agent Dock — multi-session tab bar

> **Status (2026-06-10):** In development on branch `feature/agent-dock`.
> Phases 1–4 implemented (see "Where it lives" below); Phase 5 polish not started.
>
> **Decision (2026-06-10): the Dock strip is replaced by an Agents tab.**
> The horizontal strip crowds the chat window on the phone. Instead, sessions
> get a dedicated bottom-nav tab presented as a conversation list (like a
> messaging app's chat list), with a status badge on the nav icon for
> background activity. The state layer (DockContext, per-tab ChatContext map,
> concurrent streams) is unchanged — only the presentation moves. The Agents
> tab is Advanced-mode-only (see `plans/ui-modes.md`). Section 5 below
> describes the superseded strip UI; the strip code (`Dock.jsx`, `dock.css`)
> will be replaced by an Agents page.

## Glossary

- **Dock** — horizontal tab bar below the header showing all open agent sessions
- **Dock tab** — one item in the Dock, representing a conversation in a specific repo
- **Active tab** — the Dock tab currently displayed in the main content area
- **Agent session** — one Claude CLI conversation identified by a `sessionId` in a specific repo

## Problem

Today, running agents in parallel across repos requires opening multiple Chrome
tabs. You can't tell which Chrome tab maps to which repo without clicking into
it. Closing a tab loses the live view. There is no unified place to see all
running agents at once.

## Goal

Replace the multi-browser-tab workflow with an in-app Dock that shows all open
agent sessions. The user can:

1. See all active/open sessions at a glance (repo name + status indicator)
2. Click a tab to switch the view to that conversation
3. Close a tab when done (session remains in History, just removed from Dock)
4. Have the Dock survive page reloads and app restarts (persisted)

## Current architecture (relevant parts)

- **ChatContext** holds one conversation's state: `messages`, `sessionId`,
  `streaming`, `draft`, `error`. Mounted once in Layout above the Outlet.
- **Switching repos** triggers `startNewConversation()` — clears all state.
- **One SSE stream per repo** enforced by backend (`_busyRepos` dict, 409 on
  overlap). Different repos can stream concurrently.
- **Sessions live on disk** as JSONL files under `~/.claude/projects/<encoded-cwd>/`.
  The backend reads them on demand; there is no frontend database.
- **Streaming survives tab navigation** (Chat -> Files -> Chat) because
  ChatContext lives above the router Outlet.

## Design

### 1. Dock state: `DockContext`

New context mounted above ChatContext in Layout. Holds:

```
dockTabs: [{ id, repoId, repoName, sessionId, status, createdAt }]
activeTabId: string | null
```

- `id` — random UUID, the Dock tab's own identity
- `repoId` — which repo this tab targets
- `repoName` — display name (denormalized for convenience)
- `sessionId` — Claude session UUID (null until the first `system/init` event)
- `status` — `"idle"` | `"running"` | `"done"` | `"error"`
- `createdAt` — timestamp, used for ordering

Actions:
- `openTab(repoId, repoName)` — creates a new Dock tab and makes it active
- `closeTab(id)` — removes a tab; if it was active, switches to the next one
- `setActiveTab(id)` — switches the displayed conversation
- `updateTab(id, patch)` — updates sessionId/status as the stream progresses

### 2. Persistence

Dock tabs are persisted to **localStorage** under key `claudeweb_dock`. On load,
the Dock reads the saved array and restores it. Tabs with `status: "running"` are
reset to `"idle"` on load (the CLI process is gone after a restart, but the
session can be resumed).

This is simpler than server-side persistence and works immediately. The session
transcripts themselves already live on disk (JSONL), so resuming a restored tab
just calls `--resume <sessionId>`.

### 3. Per-tab chat state: refactor ChatContext into a map

Today ChatContext holds a single conversation. Refactor to hold a **map of
conversations keyed by Dock tab id**:

```
conversations: Map<tabId, {
  messages, sessionId, streaming, draft, error, abortController, attachment
}>
```

The existing `send()`, `resumeConversation()`, `startNewConversation()` methods
gain a `tabId` parameter (or infer it from `activeTabId`). The Chat page reads
from `conversations.get(activeTabId)`.

Key behavior:
- Switching the active Dock tab swaps which conversation the Chat page renders.
  No data is lost — inactive tabs' state stays in the map.
- Starting a new turn on a tab uses that tab's `repoId` for requests,
  regardless of the global repo selector's current value.
- Each tab manages its own `AbortController` so streams are independent.

### 4. Multiple concurrent SSE streams

The backend already supports one CLI process per repo concurrently. The frontend
currently opens one SSE connection at a time. With the Dock, multiple SSE
connections can be open simultaneously (one per running tab, each to a different
repo).

Each conversation entry in the map holds its own `AbortController`. Closing a
tab or the user clicking "Stop" aborts only that tab's stream.

### 5. Dock UI component

A horizontal strip rendered in Layout between the header and the main content:

```
[header]
[dock: tab1 | tab2 | tab3 | + ]
[main content]
[bottom nav]
```

Each Dock tab shows:
- Repo name (truncated if long)
- Status dot: green (running), gray (idle), red (error), blue (done)
- Close button (X)

The `+` button opens a picker to choose a repo and create a new tab.

Clicking a tab:
- Sets it as active in DockContext
- The Chat page re-renders with that tab's conversation
- The bottom nav stays on Chat (or navigates to Chat if on another page)

Styling: compact, single-line, horizontally scrollable if many tabs. Sits above
the main content area but below the header.

### 6. Repo selector interaction

With the Dock, the repo selector's role changes:
- It still shows the repos for reference
- But the **active Dock tab** determines which repo requests target, not the
  global selector
- Changing the repo selector when no Dock tabs exist creates a new Dock tab
- When Dock tabs exist, the selector could either: (a) switch to an existing
  tab for that repo, or (b) create a new tab. Start with (a), add (b) via
  the `+` button.

### 7. Backend changes

Minimal:
- **`GET /api/dock/status`** (optional) — returns `{ [repoId]: "busy"|"idle" }`
  so the frontend can show accurate status dots without polling per-repo.
  Reads from `CliRunnerService._busyRepos`. Low priority — the frontend can
  track status from its own SSE events.
- No other backend changes needed. The existing `POST /api/chat` with
  `X-Repo-Id` header already routes to the right repo. `GET /api/sessions`
  already scopes to the repo. The Dock is primarily a frontend feature.

## Implementation phases

### Phase 1: DockContext + UI shell
- Create `DockContext` with state, actions, localStorage persistence
- Render the Dock bar in Layout (between header and main content)
- Wire the `+` button to create tabs from the repo list
- Wire close button to remove tabs
- No chat integration yet — just the tab bar appearing/disappearing

### Phase 2: Per-tab chat state
- Refactor ChatContext from single-conversation to a map keyed by tab id
- The active Dock tab determines which conversation is displayed
- `send()` uses the active tab's repoId for requests
- Switching tabs swaps the rendered conversation instantly

### Phase 3: Concurrent streaming
- Allow multiple SSE connections (one per running tab)
- Each tab has its own AbortController
- Status updates flow from SSE events into DockContext (running/done/error)
- Dock tab status dots update in real time

### Phase 4: Persistence & resume
- Dock tabs survive page reload (localStorage)
- On restore, tabs with sessionId can be resumed (load transcript + send new
  messages with `--resume`)
- Tabs that were "running" reset to "idle" on reload

### Phase 5: Polish
- Keyboard shortcuts to switch tabs (Ctrl+1/2/3 or Ctrl+Tab)
- Drag to reorder tabs
- Tab context menu (close, close others, rename)
- Auto-create a Dock tab when the user sends the first message (if no tabs exist)
- Hide Dock bar when there are 0 tabs (preserve current single-conversation feel)

## Where it lives

The feature is almost entirely frontend. Every file involved:

| File | Role |
|------|------|
| `client/src/context/DockContext.jsx` | **New.** Dock tab state (`{id, repoId, repoName, sessionId, status, createdAt}`), actions (`openTab`/`closeTab`/`setActiveTab`/`updateTab`), localStorage persistence under `claudeweb_dock`, running→idle reset on reload |
| `client/src/layout/Dock.jsx` | **New.** The tab bar UI: tabs with status dots, close button, `+` repo picker |
| `client/src/layout/dock.css` | **New.** Dock styling |
| `client/src/context/ChatContext.jsx` | Refactored from single conversation to a per-tab map (`convos[tabId]`, key `"default"` when no Dock tabs exist). Per-tab AbortControllers enable concurrent SSE streams. Exposes the active tab's state through `useChat()` so existing consumers are unchanged |
| `client/src/layout/Layout.jsx` | Mounts `DockProvider` (above `ChatProvider`) and renders the Dock bar between header and main content |
| `client/src/pages/Chat.jsx` | Renders the active tab's conversation |
| `client/src/api/client.js` | Per-call repoId override so each tab's requests target its own repo |
| `client/src/components/chat/chat.css` | Spacing adjustments for the Dock bar |
| `ClaudeWeb.App/Controllers/ChatController.cs`, `ClaudeWeb.App/Services/Chat/CliRunnerService.cs` | Minor backend tweaks; per-repo concurrency (`_busyRepos`) already existed |

## Risks & mitigations

- **Memory** — Holding multiple conversations in memory could grow large if
  sessions are long. Mitigation: cap stored messages per tab (e.g. last 200),
  load full transcript on demand.
- **Complexity** — ChatContext refactor touches many components. Mitigation:
  phase 2 can keep the existing API shape by having ChatContext expose the
  active tab's state as the default, so most consumers don't change.
- **Concurrent streams on slow connections** — Multiple SSE connections may
  compete for bandwidth. Mitigation: the browser limits concurrent connections
  per origin (6 in Chrome), and we'll rarely have more than 3-4 agents.
