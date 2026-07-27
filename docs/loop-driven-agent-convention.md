# The loop-driven-agent convention

This is the **canonical, agent-agnostic statement** of the output contract for an agent
being driven by a Claude Web autopilot **loop**. It is meant to be read directly off disk
by any agent on this box — including agents working in *other* repos. Point an agent here
once and it can be looped reliably from then on.

> The Claude Web harness and its own `CLAUDE.md` reference this file as the single source
> of truth. If the convention changes, change it **here** — don't re-describe it elsewhere.

## The situation you are in

A loop resends you **one fixed prompt** every time your turn completes, until a stop
condition fires. There is no human reading your replies between iterations. The loop's
stop detection is **deterministic string matching on your last message** — no LLM judges
you, so the only way to end the loop cleanly is to emit the markers below exactly.

## The output contract — two markers

1. **Done.** When the *whole* job the loop prompt describes is genuinely finished and
   verified — not just this iteration's step — end your reply with the loop's sentinel
   phrase (default **`LOOP_DONE`**) as the final line. Never mention the sentinel
   otherwise: matching is a substring check, so writing it mid-discussion stops the loop
   early (it fails safe — but it wastes the loop).

2. **Blocked on the human.** When you cannot proceed because of a decision only the human
   can make, end your reply with:

   ```
   NEEDS_HUMAN: <one concise question>
   ```

   and stop working. The loop resolves as **escalated** and shows your question on the
   dashboard verbatim — make it self-contained, because it is read without your
   conversation context. Same substring rule: never write `NEEDS_HUMAN:` unless you mean
   to escalate.

If neither marker appears, the loop assumes there is more work and resends its prompt.
Just keep making real progress each turn; don't emit filler.

## What stops a loop (in order)

When your turn completes the harness checks, deterministically: run **error** → the
**sentinel** (done) → **`NEEDS_HUMAN:`** (escalate) → a **deny-listed term** in your reply
(escalate — the fail-safe for agents that ignore this contract) → the **iteration cap**
(capped) → otherwise it resends. Every resolution records a stop reason + detail that the
user reviews afterward.

## Safety posture (why you can trust the loop, and it you)

- Loop **actions** (arm / edit / stop) and every other autopilot endpoint are fenced by an
  operator gate that only the human at the host PC can open; it is off by default.
- One deliberate exception: a **read-only** loop-*status* endpoint
  (`GET /api/autopilot/loops`) stays readable behind normal session auth after the gate
  closes, so a loop's outcome (done / escalated / capped + why) remains visible on the
  dashboard. It discloses status and recipe names only — no prompts, no config, no way to
  act.
- Resends carry a hard iteration cap and are recorded in an append-only audit log.
- The prompt you receive is **exactly** the recipe text the user sees in the editor —
  nothing is injected at send time.
