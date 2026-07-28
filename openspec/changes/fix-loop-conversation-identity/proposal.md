# fix-loop-conversation-identity

## Why

The engine does not know WHICH conversation it is driving. The post-mortem of
the first capped goal-loop run (2026-07-27, "count to 3" test) showed
`LastAssistantMessage` defines "the agent's reply" as the last assistant
message of the NEWEST `.jsonl` in the repo's shared transcript folder. Three
sessions were writing there concurrently — the user's watched conversation,
the fork every `--resume` creates, and an auto-understanding background job —
so the loop chased whichever file was newest: it judged an unrelated agent's
message that merely QUOTED the sentinel (`SentinelHit` is a substring match)
as "the loop's reply", flipped to the verify phase, drove a forked session the
user's open page never showed, and burned the iteration cap on ~10s-apart
phantom turns (every newest-file change looked like "the agent replied").
Result: "capped 5/5 before verification" with only 2 visible turns.

The second half of the same incident: the chat client discovers backend runs
only on mount, visibilitychange, its own send, or the manual per-dock refresh —
a loop-started run on an OPEN, VISIBLE page never attaches. No bubbles stream
in, Send never becomes Stop, and the user must refresh to see anything, even
though backend-side the run is identical to a manual send.

## What Changes

- **Conversation pinning (engine + store)**: a driven loop instance carries the
  session id of the ONE conversation it drives. Arming pins it (the dock passes
  its current conversation's session id; fallback: the repo's newest session at
  arm time). The engine reads "the agent's reply" from the pinned session only
  and resumes the pinned session only — never "the newest file". Because every
  resume forks a new session id, the pin ADVANCES on run completion: when a
  builder-lane run for the repo completes (loop-sent or human-sent, e.g. a
  suggest-mode prompt sent from the composer), the pin moves to that run's
  captured session id. Unrelated sessions (background jobs, other conversations)
  can no longer feed, advance, or resolve a loop.
- **Final-line sentinel anchoring (kinds)**: `LOOP_DONE` (sentinel) and
  `GOAL_VERIFIED` count only when they appear on the reply's FINAL non-empty
  line — which is what `docs/loop-driven-agent-convention.md` already demands
  ("end your reply with … as the final line"). A reply that merely mentions or
  quotes the token no longer completes a loop. `NEEDS_HUMAN:` stays a substring
  match: its failure direction is fail-safe (stops and asks a human).
- **Client run discovery (chat UI)**: while the page is visible, the chat client
  polls the in-memory `GET /api/runs` snapshot (~5s) and attaches to any
  newly-running builder run through the existing `reconcile()`/`attachToRun()`
  path. An engine-started run then behaves exactly like a manual send on the
  open page: streaming bubbles, busy state, Send flips to Stop.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `autopilot-loops` (change-tree capability; no baseline spec yet — additive
  requirements): driven loops are pinned to one conversation; sentinel tokens
  anchor to the final line.
- `chat`: the client attaches to backend-started runs while the page is open,
  not only on mount/visibility/own-send/manual refresh.

## Impact

- `ClaudeWeb.App/Services/Autopilot/LoopConfigStore.cs` — additive `SessionId`
  field on the loop entry (old `loops.json` loads unchanged) + setter.
- `ClaudeWeb.App/Services/Autopilot/AutopilotService.cs` — pinned-session read
  and resume; pin advance on run completion (via `RunSessionService.RunCompleted`,
  the choke point built for auto-understanding).
- `ClaudeWeb.App/Services/Autopilot/ILoop.cs` + `GoalLoop.cs` — final-line
  matching for sentinel / `GOAL_VERIFIED`.
- `ClaudeWeb.App/Controllers/AutopilotController.cs` — arm request accepts the
  dock's session id; gated debug/detail projections disclose the pin.
- `client/src/components/dashboard/DockLoopControl.jsx` (or its arm call site) —
  pass the conversation's session id when arming.
- `client/src/context/ChatContext.jsx` — visible-page run poll.
- Isolated-port e2e (loop follows its own fork; concurrent-writer immunity) +
  Playwright (open page attaches to an engine-started run).
