# The loop-driven-agent convention

This is the **canonical, agent-agnostic statement** of the output contract for an agent
being driven by a Claude Web autopilot **loop**. It is meant to be read directly off disk
by any agent on this box — including agents working in *other* repos. Point an agent here
once and it can be looped reliably from then on.

> The Claude Web harness and its own `CLAUDE.md` reference this file as the single source
> of truth. If the convention changes, change it **here** — don't re-describe it elsewhere.

## The situation you are in

A loop resends you a **stored prompt** every time your turn completes, until a stop
condition fires. There is no human reading your replies between iterations. The loop's
stop detection is **deterministic string matching on your last message** — no LLM judges
you, so the only way to end the loop cleanly is to emit the markers below exactly.

Loops come in two kinds; the prompt you receive tells you which you are in:

- **📋 Recipe loop** — the prompt is a stored ritual (e.g. "drive the current OpenSpec
  change"). Your done-claim (the sentinel) ends the loop directly.
- **🎯 Goal loop** — the prompt states a user-written goal. Your done-claim does **not**
  end the loop: it triggers a **verification turn** (see below), and only a verified
  confirmation ends it.

## The output contract — two markers

1. **Done.** When the *whole* job the loop prompt describes is genuinely finished and
   verified — not just this iteration's step — end your reply with the loop's sentinel
   phrase (default **`LOOP_DONE`**) as the final line. The harness **enforces** the
   final-line rule: the sentinel counts only when it appears on your reply's final
   non-empty line (case-insensitive; trailing punctuation is fine). Mentioning or
   quoting it mid-reply does nothing — but still don't: it muddies the transcript.

2. **Blocked on the human.** When you cannot proceed because of a decision only the human
   can make, end your reply with:

   ```
   NEEDS_HUMAN: <one concise question>
   ```

   and stop working. The loop resolves as **escalated** and shows your question on the
   dashboard verbatim — make it self-contained, because it is read without your
   conversation context. Unlike the completion markers, `NEEDS_HUMAN:` is matched as a
   **substring anywhere in your reply** (its false-positive direction is the safe one —
   stop and ask), so never write it unless you mean to escalate.

If neither marker appears, the loop assumes there is more work and resends its prompt.
Just keep making real progress each turn; don't emit filler.

## The goal loop's verification turn — a third marker

In a **goal loop**, after you claim done with the sentinel, the loop sends you a
**verification prompt**: re-check the stated goal against the **actual state** of the
repository — run the build, the tests, the app as appropriate; do not trust your memory
of the work. Then:

- If the goal is genuinely achieved, end your reply with **`GOAL_VERIFIED`** as the final
  line. The loop resolves **done (verified)**.
- If it is not, list exactly what is missing and **continue working**; the loop returns
  to its work phase and keeps driving you.

`GOAL_VERIFIED` follows the same enforced final-line rule as the sentinel, and it is
only meaningful in the verification turn's reply — never write it otherwise. (Emitting
it during a work turn does nothing, but it muddies the transcript.)

## What stops a loop (in order)

When your turn completes the harness checks, deterministically: run **error** →
**`NEEDS_HUMAN:`** (escalate — checked first, so a blocked agent is never re-driven) → a
**deny-listed term** in your reply (escalate — the fail-safe for agents that ignore this
contract) → the **sentinel** (recipe loop: done; goal loop: send the verification turn,
or **`GOAL_VERIFIED`** in that turn's reply: done) → the **iteration cap** (capped,
checked before every send including the verification send) → otherwise it resends. Every
resolution records a stop reason + detail that the user reviews afterward.

## Safety posture (why you can trust the loop, and it you)

- Loop **actions** (arm / edit / stop) and every other autopilot endpoint are fenced by an
  operator gate that only the human at the host PC can open; it is off by default.
- One deliberate exception: a **read-only** loop-*status* endpoint
  (`GET /api/autopilot/loops`) stays readable behind normal session auth after the gate
  closes, so a loop's outcome (done / escalated / capped + why) remains visible on the
  dashboard. It discloses status and recipe names only — no prompts, no config, no way to
  act.
- Resends carry a hard iteration cap and are recorded in an append-only audit log.
- The prompt you receive is **exactly** the stored text the user can inspect — the recipe
  text in the editor, or a goal loop's work/verification prompts composed once at arm
  time and shown in the dock's prompt inspection. Nothing is injected at send time.
- Arming is **exclusive per agent**: a loop and the suggestion-based autopilot are never
  armed on the same repo at once.
