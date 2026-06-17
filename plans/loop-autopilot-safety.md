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

## The deeper risk: confused deputy / prompt injection

The fences above assume the *brain's verdict* is the thing to constrain. The
harder risk is that the brain — or the agent that **authors** autopilot's
surfaces — is **Claude**, which ingests untrusted input (files, web pages, PRs,
dependency text) as ordinary work. A steered session is a realistic vector, not a
hypothetical stranger, and autopilot's entire job is *to act* (send prompts), i.e.
the exact authority an injection wants to borrow. "I trust the apps on my box"
really reduces to "I trust that no Claude session of mine got steered" — a weaker
guarantee than trusting shrink-wrapped software.

**Eventual mitigation (NOT built):** a **scoped capability token held by the
engine, never by the brain.**

- The brain only ever **proposes**; the deterministic engine **executes** under a
  narrow, expiring token, and only **after** the gate above. If the LLM can read
  the token, an injection can repurpose it for anything *within scope*, so all the
  protection collapses to whatever the scope happened to be — keeping the
  credential out of the model's context is what turns "scope" into a real wall.
- **Never expose a send/act primitive that skips the gate.** Even a future steered
  session must, at worst, be fenced by threshold + deny-list — never fire a raw
  "deploy" directly.
- The token's authority must be **strictly less** than the operator's own session
  (do **not** reuse `claudeweb_session`). Token bounds the *category* of action;
  the gate bounds *each* action; they compose, neither replaces the other.

## Interim guard (BUILT): operator-only endpoint gate

Until the token mitigation lands, the autopilot API is **gated from the host
only**, mirroring guest approval (plans/auth-ip-filter.md) — the asymmetry that a
remote/steered web surface can **shrink but never grow** authority:

- `AutopilotGate` (`%APPDATA%\ClaudeWeb\autopilot-gate.json`) holds one operator
  bool, flipped **only** from the WinForms host UI. **Default off.**
- When off, every `/api/autopilot*` endpoint returns **403** and the
  `AutopilotService` loop pauses. There is **no web endpoint that can enable it** —
  a steered web client or brain cannot turn acting on; the operator must opt in
  physically at the host.
- This is a **harder** switch than the web `Enabled` kill switch: `Enabled` can
  only *shrink* (pause classifying) and only works while the operator gate is on.
