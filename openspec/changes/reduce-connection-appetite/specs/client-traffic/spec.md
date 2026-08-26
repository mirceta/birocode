## ADDED Requirements

### Requirement: Pollers are visibility-gated

Every recurring poller in the web UI SHALL skip its tick while the document is
hidden (`document.hidden`), so a locked phone or background tab generates no
steady-state polling traffic. Surfaces that must be fresh immediately on return
SHALL refresh on `visibilitychange` (the chat reconcile already does); all others
MAY simply resume on their next visible tick.

#### Scenario: Locked phone goes quiet

- **WHEN** the operator locks the phone (or hides the tab) with the dashboard open
- **THEN** recurring polls stop until the page is visible again, and the chat
  surface re-syncs immediately on return via the visibility-change reconcile

### Requirement: Connection budget

The web UI SHALL keep its worst-case concurrent connection count to the harness
origin within the browser's 6-per-origin HTTP/1.1 limit in realistic operation:
at most one shared multiplexed stream for all run attachments, plus the active
send's own stream, plus short-lived polls — so interactive requests (saves, panel
loads) always find a free connection slot.

#### Scenario: Save during two running agents

- **WHEN** two agents are mid-turn and the operator saves a settings panel
- **THEN** the save completes promptly instead of queueing behind exhausted
  connections
