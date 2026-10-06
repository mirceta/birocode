# Status → Agents: double-click a repo agent chip opens its harness

## Why

The Operator (2026-10-06, fleet task 6f86332c): opening an agent's harness
from Management → Status takes two steps — expand the details, then press
"Open harness". The most common action deserves one gesture.

## What Changes

- Double-clicking an agent chip opens its harness directly, through the SAME
  pair the details' big button uses — a shared `harnessTargetOf(machine,
  agent)` derivation (the Kanban badge's tab key + the machine's studio deep
  link) handed to `focusAgentTab`. One implementation, now with two callers.
- Single click keeps toggling the details. The double-click's two leading
  clicks toggle them open and shut again (the Kanban title's
  click-vs-dblclick idiom, no delay timer), so nothing is left toggled.
- The chip's tooltip gains "double-click: open harness"; a machine with an
  unknown address gets no double-click action (and no hint) — nothing to
  open, nothing guessed.
- Works in the split and the merged layout and under every filter; the ✓
  "mark as checked" beside a finished chip and the details' big button are
  untouched.

## Impact

- Affected specs: `management-dashboard` (ADDED requirement).
- Affected code: `FleetStatus.jsx` only (shared helper + chip wiring).
- Evidence: `client/tests/ui/shot-status-agent-dblclick.mjs`, 10/10 — tab
  opened/focused-not-reloaded, details never left toggled, merged layout,
  unknown address inert, ✓ independent.
