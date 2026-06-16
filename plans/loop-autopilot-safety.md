# Loop autopilot — safety & escalation

> Subdoc of **[loop-autopilot.md](loop-autopilot.md)**. How sending prompts on the
> user's behalf is kept safe — and how the autopilot knows when to stop and hand
> back control.

## Escalation is the core safety mechanism

Autopilot only ever **sends a known routine prompt or escalates**. "Escalate"
means: stop auto-advancing this agent and surface it to the user as needing a real
decision. The gate before any auto-send:

```
brain returns a label + confidence
  └─ confidence below threshold?      → ESCALATE
  └─ label would trigger risky work?  → ESCALATE   (deny-list, see below)
  └─ otherwise                        → send the routine prompt + log → loop
```

Defaulting ambiguity to **escalate** is deliberate: a needless pause costs the user
a glance; a wrong auto-send advances an agent down a path they didn't choose.

## The fences

1. **Confidence threshold.** Below the user-set bar → escalate, never guess.
2. **Risky-action deny-list.** Even a confident routine prompt is **not**
   auto-sent if the agent's message proposes destructive/irreversible work —
   `delete`, `drop`, `force`, `reset --hard`, `push`, `deploy`, `prod`,
   `overwrite`, … — those always escalate. The list lives in config, extensible.
3. **Audit log.** Every auto-send records when, which agent/repo, which routine
   prompt, and the message it answered — append-only JSON in
   `%APPDATA%\ClaudeWeb`, like the deploy ledger. So the user can review what was
   sent on their behalf.
4. **Kill switch.** One control disables all auto-advancing instantly; everything
   reverts to suggest-only / manual.

## Failure-safe defaults

- Brain unsure, errors, or times out → **escalate**, never auto-send.
- Can't read a peer's last message → no decision, no action.
- An auto-send fails → log it; never silently retry into a loop.

## Why this needs care (the convention point)

Auto-sending advances another agent's work without the user in the loop — a
consequential action the repo's top convention (CLAUDE.md) says must not happen
silently. The constrained label set, the escalate-by-default gate, the deny-list,
the audit log, and the kill switch are what make it acceptable. Auto-advance
(Slice 3) also stays **off until the [accuracy gate](loop-autopilot-brain.md#gate)
is cleared**.
