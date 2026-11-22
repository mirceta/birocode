# Projector: keep agent pages as tabs (idea #33, living-room Ideas)

## Why

On the projector (the big screen, `/studio?screen=projector`), switching agents from the phone remote (Harness tab →
Agents → tap one) reloads the agent every time:
- **Same harness:** the Agent tab renders only the active dock. Switching unmounts it and mounts the next, so the
  transcript is fetched again and the local-app iframes reload.
- **The peer the screen already shows:** picking another of its agents is planned as a full `navigate`. That mints
  a one-shot PIN, logs in again and loads the studio again, even though the peer's page could switch in place.

The Operator wants browser-tab behaviour: the first visit loads an agent, and returning to it is an instant switch.

## What changes

- **The Agent tab keeps the docks it has shown mounted, hidden.**
  - Switching back shows the same dock, with its chat, scroll position, lane and app iframes as they were. There is
    no page load and no remount.
  - The six most recently shown docks are kept; the least recently shown one past that is unmounted (`MAX_KEPT`).
- **Kept docks stay quiet.**
  - A hidden dock ignores the remote's unnamed commands (`lane`, `layout`, `push-app` without an agent). A command
    that names the agent still reaches it.
  - A hidden dock does not report its layout to the big screen's heartbeat; it reports again when shown.
- **The same peer switches in place.** `open-agent` for an agent on the peer the screen already shows is forwarded to
  that peer as a plain `open-agent` (no `sourceId`). Its Agent tab switches like a tab: no hop, no PIN, no page load.

## Not in scope

**Switching between machines still loads the other harness's page.** The harness session cookie is
`SameSite=Strict`, so a peer's pages cannot stay logged in inside frames on another harness's page. Keeping one page
per machine alive belongs to the living-room presenter: one WebView2 per machine, shown or hidden. That is a
follow-up for the living-room repo; nothing here loosens the cookie.

## Impact

- **Client:**
  - `pages/agentKeepAlive.js` (+ test), `AgentView.jsx` (the kept list), `agentView.css`;
  - `Dashboard.jsx` (`keep` in solo mode, the duplicate solo block removed);
  - `PinnedAgent.jsx` (`remoteActive`).
- **Server:** `RemoteRelay.PlanCommand` (the same-peer case); test in `RemoteRelayTests`.
