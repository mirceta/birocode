# Understanding — start running agents automatically

(Current focus of the loop-autopilot feature — see `plans/loop-autopilot.md`.)

## Dashboard decision — LOCKED
The dashboard lives in the **existing harness Autopilot tab** (option A). Not the
optimal-UX choice, chosen for lowest friction; revisit later if it's bad. The
point is *where it shows*, which is settled — so we stop deliberating UX and build
the loop.

## The real goal
Actually **run agents on autopilot**: detect an idle agent, decide whether its next
step is one of your routine prompts, and either **send it automatically** (looping
the agent forward) or **escalate** to you on a hard/risky/uncertain decision.

## What that needs (the next build)
- **Engine** — a backend `BackgroundService` that finds idle agents + their last
  message (`loop-autopilot-engine.md`).
- **Brain** — an LLM classifier: last message → one routine prompt, or *escalate*
  (`loop-autopilot-brain.md`).
- **Gated auto-send** — confidence threshold + risky-action deny-list + audit log +
  kill switch; anything below the bar escalates (`loop-autopilot-safety.md`).
- **Surface** — auto-advancing / needs-you state in the Autopilot tab + a dock cue.

## Safe path (proposed)
Slice 2 **suggest-only** first (predict + pre-fill, you press send — measures live
accuracy, zero risk), then flip to Slice 3 **gated auto-advance** once it's
trustworthy. Same engine/brain; the gate just changes who hits send.

## Open calls (I'll default unless you say otherwise)
- **Enable scope:** per-agent toggle (you arm autopilot on a specific agent).
- **Escalation surface:** dock badge + the Autopilot tab.
- **The set:** seeded from your existing custom prompts (can expand later).

Stays on `feature/loop-autopilot`; nothing pushed until "push it".
