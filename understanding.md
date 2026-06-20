# Understanding — Autopilot loop mode

## What you asked for

Augment the **autopilot** feature so it can **drive an agent in a loop**.

The pain: often you've already told Claude everything it needs to keep going,
but it *still* stops to ask "do you want slice A or slice B?" and waits. You want
a way to tell autopilot: **keep re-sending this one well-defined prompt every time
the agent finishes a turn**, so it pushes itself through those questions — and you
want autopilot to **detect when the agent is genuinely done** so the loop stops
instead of nagging forever.

## How I read it

This is a **new, deterministic mode** of autopilot, separate from the existing
classifier ("suggest a routine prompt or escalate"). Loop mode does **not**
classify — it resends **one fixed prompt** you define. Two detections matter:

1. **Turn done** (the resend trigger) — the agent finished its current turn and
   is idle/waiting. Reuse the existing run-lifecycle signal
   (`RunSessionService.IsBusy` flips false when a run's status goes
   `running → done`).
2. **Genuinely done** (the stop) — the whole job is complete, so stop looping.

## Concrete things I'll do

- **Backend loop engine + config**: a per-agent loop (fixed `prompt`, hard
  `maxIterations` cap, a stop `sentinel` phrase), persisted backend-synced. On
  each turn-completion, decide: stop / escalate / resend. Reuse the existing
  send path (`RunSession.TryBeginRun` + `CliRunnerService.RunAsync`) and the
  existing append-only audit log.
- **API**: start / update / stop a loop; loop state surfaced in `GET /api/autopilot`.
- **Frontend**: per-agent loop controls + live status (iteration count, state,
  Stop button) in the existing `AutopilotConsole`.
- **Verify** on an isolated port with Playwright; keep `understanding-app/` honest.

## Decisions I'm making (you can override)

You declined the design questions, so I'm taking the safe defaults:

- **Genuinely-done detection = sentinel + cap backstop.** Your loop prompt asks
  the agent to print a sentinel (e.g. `LOOP_DONE`) when nothing is left; the
  engine stops the instant it sees it. A hard `maxIterations` cap (default 10) is
  the runaway backstop. Chosen over an LLM judge because it's deterministic, free,
  and adds **no** prompt-injection surface — which matters because…
- **Loop mode acts unattended, so it stays behind the operator gate** (off by
  default, host-only enable). This is non-negotiable per the confused-deputy risk
  in `plan.md`. The web can start/stop a loop only when the operator has opened
  the gate.
- **Deny-list still applies**: if the agent's last message mentions a risky action
  (deploy/push/reset --hard/…), the loop **escalates to you** instead of resending.
- **Per-loop Stop button**, and the loop **auto-pauses on a run `error`** (not
  just clean `done`).

## Assumptions

- Resend fires after **every** completed turn (until a stop condition), not only
  when the agent ends with a question — that's how it pushes through the "slice A
  or B?" prompts.
- Loop mode ships **without** the unbuilt real LLM classifier — it's independent
  of the brain.
- One loop per agent at a time.
