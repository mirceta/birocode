# Loop autopilot — auto-advance agents through my routine replies

> **Status:** KICKOFF — design proposed, defaults chosen, not built. On
> `feature/loop-autopilot`, branched from `main` @ `5d7d8fb` (2026-06-16).
> **Supersedes the earlier "yes-watcher" idea** — answering "yes" is just the
> simplest member of the routine-prompt set below.
>
> Detail in subdocs (progressive disclosure):
> **[the brain](loop-autopilot-brain.md)** (discover + predict) ·
> **[the engine](loop-autopilot-engine.md)** (how the loop runs) ·
> **[safety / escalation](loop-autopilot-safety.md)** ·
> **[build internals](loop-autopilot-internals.md)**.

## The problem

Across a long agent session the user rarely says anything novel turn-to-turn.
There's a **small, stable set of ~7 custom prompts** they cycle through —
"continue", "play it back", "deploy", "keep it", "now test it", "yes", … — until
the agent reaches a **genuine hard decision** that needs a real human call.
Re-sending those routine prompts by hand, across many agents, is the bottleneck.
The hard decisions are rare; the boring repeats are what eat the user's attention.

## The goal

An **autopilot** that, for each working agent, recognises when the next step is
one of the user's **routine prompts** and sends it automatically — looping the
agent forward — and **stops to escalate only when it hits a hard decision** the
user actually needs to make.

Two things must be true, and they're the two build phases:

1. **We know the recurring set** (the ~7) — discovered from the user's history.
2. **At each turn we can pick the right one** — or correctly say "this is a hard
   decision, ask the human."

## How it works

```
agent finishes a turn
  └─ autopilot reads its last message
       └─ does this call for one of my routine prompts?
            ├─ no / unsure → ESCALATE  (hard decision — ask me)
            └─ yes → which routine prompt, and how confident?
                       ├─ below threshold → ESCALATE
                       └─ above threshold → risky / deny-listed?
                                              ├─ yes → ESCALATE
                                              └─ no  → send that prompt + log → loop
```

The "escalate" branch is the feature's whole point: it runs the user on autopilot
through the repeats and **pauses at exactly the decisions they wanted to keep**.

## Two phases

- **Phase 1 — Discover the set.** Mine the user's prompt history to surface the
  recurring prompts (the ~7) and the situation that precedes each. The user
  confirms/edits the set. Detail: [the brain](loop-autopilot-brain.md#discover).
- **Phase 2 — Auto-advance.** At each idle agent, classify the situation → a
  routine prompt or *escalate*, send it (gated), and loop. Detail:
  [the brain](loop-autopilot-brain.md#predict) + [the engine](loop-autopilot-engine.md).

## Decisions (defaults — change any in Open questions)

- **Brain = an LLM classifier over your fixed small set + an "escalate" class** —
  not a trained model, not open-ended generation. Why: [the brain](loop-autopilot-brain.md).
- **Engine = a backend service** (polling, or event-driven later) — scored in
  [the engine](loop-autopilot-engine.md).
- **Acting = gated** — confidence threshold + risky-action fence + audit + kill
  switch; otherwise escalate. See [safety](loop-autopilot-safety.md).

## Slices

1. **Discover & confirm the set** — mine history, show the user their ~7 recurring
   prompts and when each fires; let them edit. **No acting.** ✅ **BUILT** (discovery
   half): backend `AutopilotDiscoveryService` mines the on-disk
   `~/.claude/projects` transcripts across all repos, groups human messages by a
   normalised key, filters interrupt/system noise, and returns the recurring
   prompts (count, distinct sessions/repos, sample triggering contexts,
   custom-prompt match) via `GET /api/autopilot/discover`. New **Autopilot** tab
   (Advanced) renders the ranked list. Browser-verified on :5210
   (`verify-autopilot-discover.mjs` 16/16 — 92 sessions → 38 routines). Still to
   do for this slice: let the user **confirm/edit** the set (persist the chosen set).
2. **Suggest-only** — at each turn, predict the routine prompt and pre-fill it;
   the user sends. Measures live accuracy and builds trust.
3. **Auto-advance** — above the confidence threshold, send automatically and loop;
   escalate otherwise. Audit log + kill switch.

## Out of scope (for now)

- **Inventing new prompts** — autopilot only ever sends one of your known routine
  prompts, or escalates. Nothing free-form.
- Cross-machine watching — this machine's agents only.

## Open questions (defaults chosen; tell me to change)

- **The set:** fixed to your existing custom prompts, or learned/expanding over
  time as the brain sees new repeats?
- **Escalation surface:** a dock badge, a hard pause, a push notification — how
  should "I need you" reach you?
- **Enable scope:** per-agent, global, or both.

## Verification

Browser-verified on an isolated :5210 instance — seed cases and assertions in
[build internals → Verification](loop-autopilot-internals.md#verification).
