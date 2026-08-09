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

You do not need to have read this file to know that: **every driven send now tells you
the situation in its own text** (openspec: loop-agent-briefing). Work prompts arrive
wrapped in an `[Autopilot loop briefing]` prefix stating that an automated loop sent
them, the behavioral posture below, the escalation line, the non-blocking `FLAG:`
line, and the applicable marker contract, followed by `--- The prompt follows. ---`
and the stored text. Verification
prompts carry a short honesty-first note instead. The briefing is this document's
distilled form; the two are kept in sync in the same commit whenever either changes.

Loops come in three kinds; the prompt you receive tells you which you are in:

- **📋 Recipe loop** — the prompt is a stored ritual (e.g. "drive the current OpenSpec
  change"). Your done-claim (the sentinel) ends the loop directly.
- **🎯 Goal loop** — the prompt states a user-written goal. Your done-claim does **not**
  end the loop: it triggers a **verification turn** (see below), and only a verified
  confirmation ends it.
- **🗒️ Queue loop** — each prompt you receive is the next item of a **queue of
  user-written prompts**, sent to you one at a time. The queue is the operator's plan,
  not yours: the sentinel does **nothing** here (finishing one item never means the job
  is over), and the queue simply ends when it runs dry. Between items you normally get a
  **step-verification turn** (see below). `NEEDS_HUMAN:` works as everywhere.

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

## Non-blocking flags — `FLAG:`

Complaints and ambiguities have their own channel, separate from the two markers above
because it never affects the loop. If anything in a turn was a **complaint**, a
**workaround**, or an **ambiguity you resolved by guessing**, also record each one as
its own line, anywhere in your reply:

```
FLAG: <one short sentence>
```

Matching is **line-start** (case-insensitive; one line per issue) — a mid-sentence
"FLAG:" does nothing. Unlike `NEEDS_HUMAN:` this neither stops nor escalates
anything: you proceed with your sensible default, and the harness lifts every
`FLAG:` line into a persistent ledger shown in the web app's **footer** until the
human dismisses it — so a gripe nobody watched live is not forgotten. Make each
flag self-contained, like the `NEEDS_HUMAN:` question: it is read without your
conversation context, possibly days later.

The division of labor: `NEEDS_HUMAN:` is for decisions that **block** you;
`FLAG:` is for "I proceeded, but note this." A flag in the same reply as a
sentinel or an escalation still gets collected.

The channel is **operator-switchable**: when the human turns it off, driven
prompts stop carrying the `FLAG:` instruction and replies are no longer mined.
Write flags only when the prompt you received teaches the marker; if it does
not, fold anything noteworthy into your reply text instead.

## How to behave

Nobody reads your replies in real time, so a reply that only asks or plans goes
nowhere. In every **work** turn:

- **Act.** Do the work the prompt asks for in this turn. Do not stop at a plan, a list
  of options, or a clarifying question — there is no one to answer it.
- **Answer your own questions.** When you would ask a clarifying question and you are
  confident of the answer, answer it yourself and follow your own advice.
- **Sensible defaults.** For open details, choose a sensible default and state briefly
  which you chose, so the human can review the choice later.
- **When you would explain, do.** "Here's what I'd do" is a work item, not a reply.
- **`NEEDS_HUMAN:` is the escalation path, not the default.** Reserve it for decisions
  that genuinely require the human — irreversible, destructive, or a preference only
  they can give.

**Verification** turns are the deliberate exception: they carry no act-pressure. Judge
honestly — a false confirmation silently corrupts the run, while an honest refusal
merely stops the loop for a human to look at.

The work-phase posture bullets above are seeded into the harness's **editable briefing
rules** (the dock's Briefing section): the operator can tune, add, or park rules at any
time, and the current set is composed into every driven work send.

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

## The queue loop's step verification — a fourth marker

In a **🗒️ queue loop** (on by default, the operator can opt out), after each item's
reply you get a **step-verification prompt** quoting the item you just handled: re-check
whether that request was **genuinely accomplished** — actually done, not just discussed,
partially done, or answered with a question. Then:

- If yes, end your reply with **`STEP_VERIFIED`** as the final line (enforced final-line
  rule, same as the sentinel). The loop unloads the next queued item.
- If not — including when you asked a question or hit a blocker — state the open question
  or blocker plainly and do **not** write `STEP_VERIFIED`. The loop stops and escalates
  to the human instead of sending the next item into a broken state.

`STEP_VERIFIED` is deliberately distinct from `GOAL_VERIFIED` so a queue driving
goal-contract agents can never cross-trigger, and like the other completion markers it
is only meaningful in the verification turn's reply.

## What stops a loop (in order)

When your turn completes the harness checks, deterministically: an **operator stop**
(the human pressed Stop on your run — the loop resolves **stopped · by-operator**, a
user action, never reported as your failure) → run **error** → **`NEEDS_HUMAN:`**
(escalate — checked before the completion markers, so a blocked agent is never
re-driven) → a **deny-listed term** in your reply (escalate — the fail-safe for agents
that ignore this contract) → the **sentinel** (recipe loop: done; goal loop: send the
verification turn, or **`GOAL_VERIFIED`** in that turn's reply: done; queue loop:
ignored) → the queue loop's own checks (**`STEP_VERIFIED`** missing from a
step-verification reply: escalate; queue empty: done) → the **iteration cap** (capped,
checked before every send including verification sends) → otherwise it resends. Every
resolution records a stop reason + detail that the user reviews afterward.

Deny-list matching is **whole-word** (case-insensitive, anywhere in your reply): the
term `push` matches "commit and push" but not "pushed". Honest past-tense reporting of
work your repo's own conventions required does not trip the fence — but naming a risky
action you are *about to take* still does, which is the point. The operator can also
trim the deny-list **per arm** (e.g. dropping `push` for a commit-and-push repo); the
trimmed list is stored on the loop instance and disclosed with its gated detail.

A **🗒️ queue loop** that stopped with items still queued (escalated, capped, errored, or
operator-stopped) offers the operator a one-step **Resume**: the same instance
re-activates and drives the remainder from the current head of the stash, with a fresh
iteration budget and no leftover verification obligation from the interrupted step.

## Safety posture (why you can trust the loop, and it you)

- Loop **actions** (arm / edit / stop) and every other autopilot endpoint are fenced by an
  operator gate that only the human at the host PC can open; it is off by default.
- One deliberate exception: a **read-only** loop-*status* endpoint
  (`GET /api/autopilot/loops`) stays readable behind normal session auth after the gate
  closes, so a loop's outcome (done / escalated / capped + why) remains visible on the
  dashboard. It discloses status and recipe names only — no prompts, no config, no way to
  act.
- Resends carry a hard iteration cap and are recorded in an append-only audit log.
- Every prompt you receive is a **deterministic composition of operator-inspectable
  parts** (openspec: loop-agent-briefing): the fixed briefing frame (compiled into the
  harness), the operator's briefing rules at a **recorded revision** (edited in the
  dock's Briefing section; the store keeps every revision), and the stored text the
  user can inspect — the recipe text in the editor, a goal loop's work/verification
  prompts composed once at arm time, or a queue item's text as it sits in the stash
  strip above the composer. The queue's step-verification prompt composes the fixed,
  inspectable verification template with the item text just sent. The chat renders
  every driven send verbatim — the exact composed text you received — and the durable
  audit stamps each send's loop kind, phase, and exact sent text (openspec:
  queue-loop-prompt-transparency); truncated list surfaces (audit slices, the queue's
  per-arm sent-history) keep the raw stored text plus a briefed flag and the rules
  revision, so what was actually sent is both readable and reconstructable forever.
  The arm preview and the Briefing section show the exact composition before anything
  fires.
- Arming is **exclusive per agent**: a loop and the suggestion-based autopilot are never
  armed on the same repo at once.
