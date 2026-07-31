# Queue-based loop

## Why

The autopilot Overview promises three everyday modes; two exist (the 💡 suggestion
loop and the ⟳ loop engine's 📋 recipe / 🎯 goal kinds) and the third — the
🗒️ **queue-based loop**, "line up the prompts you'd send by hand anyway" — is
still a card marked *to build*. The raw material already exists on both sides:
the loop engine (unified `ILoop` kinds, mode dispatch, caps, audit, stop reasons,
operator gate) was explicitly built as the seed for this kind, and the per-tab
**prompt stash** (`DockRegistry.Stash`, plans/prompt-stash.md) is exactly where
the operator already lines those prompts up — jotted while the agent is busy,
shown above the composer. The queue kind is the missing wire between them:
**arm = automatically unload the stash into the agent whenever it is free.**

Two workflow facts shape the design. First, stash items accumulate *while* the
agent works — a queue frozen at arm time defeats the point, so the stash itself
is the queue, live-editable while armed. Second, blindly unloading one prompt
per turn cannot tell whether the previous prompt actually got **solved** — the
agent may have replied with a question or hit a blocker, and sending the next
item would bury it. Verification between steps is therefore the default, not an
extra.

## What Changes

- **The stash becomes reorderable.** Ordered today only by insertion; the strip
  above the composer gains reordering (plus a reorder API), armed or not — a
  standalone stash improvement the queue kind then builds on.
- **New 🗒️ queue loop kind in the loop engine: the tab's stash IS the queue.**
  Arming binds the agent's one loop slot to its tab's stash; each time the
  agent's turn ends (and verification passes), the engine unloads the **head**
  stash item — sent in drive mode, pended into the composer in suggest mode —
  removing it from the stash only once it lands. The stash stays live while
  armed: add/remove/reorder anytime, and the loop resolves **done** when the
  stash drains.
- **Between-step verification, ON by default.** After each unloaded step's turn,
  the engine sends a verification prompt (stored template + that step's text)
  asking the agent whether the step's ask was genuinely accomplished; only a
  final-line `STEP_VERIFIED` unloads the next item — anything else (a question,
  a blocker, a partial) stops the queue as **escalate** quoting the reply.
  Opt-out per arm for fire-and-forget queues.
- **Stopping is lossless; that is the interleaving story.** Unsent items never
  leave the stash, so any stop — escalate, cap, disarm — keeps the remainder;
  the operator chats with the agent freely and re-arms to continue from the
  head. No pause primitive; suggest mode remains the fully human-gated variant.
- **Two surfaces.** The dock's unified loop control gains the 🗒️ kind (settings
  + next-up preview — the stash strip is the editor, not a duplicate list), and
  the autopilot console's Loops section gains a **Queue tab**: per-agent queue
  status, settings, arm/disarm. Ungated status shows counts only (remaining /
  sent / phase); texts follow the gated-detail rule.
- **Existing mechanics apply unchanged, per the engine's contract:** the
  driven-kind safety ladder (run errored → `NEEDS_HUMAN:` → deny-list), the
  iteration cap, recorded stop reasons, the append-only audit trail, the
  operator gate, and the ungated status projection's disclosure rules.
- **Honesty pass:** the Overview card, autopilot explainer notes, and the dock
  copy stating the queue-based loop "does not exist yet" are updated to match
  the build.

## Capabilities

### New Capabilities

- `prompt-stash` (seeded per seed-and-grow): the per-tab stash's ordering
  contract — an ordered, operator-reorderable list, durable and shared across
  devices.

### Modified Capabilities

- `autopilot-loops`: new requirements for the queue kind — arming an agent's
  loop slot onto its tab's live stash, head-first one-prompt-per-turn unloading
  with drive/suggest dispatch and consume-on-land, live edits honored while
  armed, done-on-drained, default-on between-step verification with
  stop-and-escalate, lossless stop/re-arm, the safety ladder / cap / audit /
  gate applying to queue sends identically, and count-only ungated disclosure.

## Impact

- **Backend, stash** (`ClaudeWeb.App/Services/Dock/DockRegistry.cs`,
  `Controllers/DockController.cs`): stash reorder operation + endpoint.
- **Backend, loop** (`ClaudeWeb.App/Services/Autopilot/`): new `QueueLoop.cs`
  (`DrivenLoop` implementation reading the bound tab's stash), `LoopConfigStore`
  (queue kind constant, tab binding + verify fields, verify template),
  `AutopilotService` (consume-on-land at the landed-proposal hook, verify
  phase), `AutopilotController` (queue arm endpoint, count-only projection).
- **Frontend** (`client/src/`): stash strip reordering (`ChatInput.jsx` /
  `PinnedAgent.jsx` area), `DockLoopControl` (kind entry, settings, next-up +
  progress), `AutopilotConsole` Loops → Queue tab, Overview/explainer honesty
  pass; audit + Live feed views (already kind-generic, verify only).
- **Docs:** `docs/loop-driven-agent-convention.md` (`STEP_VERIFIED` contract
  note), understanding-app.
