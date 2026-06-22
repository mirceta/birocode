# Autopilot loop mode — re-send one fixed prompt until the agent is genuinely done

> Status: **BUILT — slices 1–4 done, verified on an isolated port, not yet
> merged/deployed.** On `feature/autopilot-loop-mode`, branched from `main` @
> 29088ec (2026-06-20). Augments [loop-autopilot](plans/loop-autopilot.md): a
> **deterministic** loop that does **not** use the (still-stub) classifier brain.
>
> Built: `LoopConfigStore` (`loops.json`) + the per-turn decision folded into
> `AutopilotService.Tick` (loop takes precedence over classify per repo) +
> `POST /api/autopilot/loop` (start/update/stop) folded into `GET /api/autopilot`
> + a **Loops** sub-tab in `AutopilotConsole` (`LoopsView.jsx`). Verified with
> `.claudeweb-preview/playwright/verify-loopmode-api.mjs` (store/API contract,
> against a fake repoId so no real agent is driven) and `verify-loopmode-ui.mjs`
> (arm / live / finished states + correct POST bodies).
>
> **Live engine e2e (2026-06-20):** ran the real loop on an isolated `:5210`
> build against a throwaway scratch repo with a seeded session, driving a real
> Claude agent. All three deterministic stop branches confirmed end-to-end:
> **cap** (resends 0→1→2, audited 2× `outcome=loop`, then `capped`), **sentinel**
> (one send, agent emits the phrase → `done` at iter 1), **escalate** (one send,
> reply contains a deny-listed word `deploy`/`prod` → `escalate`, fails safe). The
> double-send guard held (exactly one send per turn). Not exercised: the
> `run errored → error` branch (couldn't force a deterministic run error). Known
> edge: the snippet-dedup guard treats *identical* consecutive replies as the same
> turn, so a loop whose agent emits byte-identical output every turn stalls — fine
> for real work (replies vary), sharp for trivial echo prompts.

## The problem

You often hand Claude everything it needs to keep going, but it **still stops to
ask** — "do you want slice A or slice B?", "should I proceed?" — and waits. You
want to tell autopilot: **keep re-sending this one well-defined prompt every time
the agent finishes a turn**, so it pushes itself through those questions. And you
want autopilot to **notice when the agent is genuinely done** so the loop stops
instead of nagging forever.

## How this differs from existing autopilot

The shipped autopilot ([loop-autopilot](plans/loop-autopilot.md)) is a
**classifier**: at each idle turn it predicts *which* of your routine prompts fits
(or escalates). Its real LLM brain is **not built** (a keyword stub stands in).

**Loop mode is the simpler, deterministic sibling.** It does **not** classify and
does **not** need the brain: it resends **one fixed prompt** you define, every
turn, until a stop condition. So it can ship now, independent of the brain work.

## Two detections

| Detection | Meaning | Mechanism (reuse existing) |
|-----------|---------|----------------------------|
| **Turn done** | the agent finished its current turn → time to resend | `RunSessionService.IsBusy(repoId)` flips false when a run's `Status` goes `running → done`/`error` (`RunSession.Complete()` keys off the CLI's terminal `{"type":"done"}` event). |
| **Genuinely done** | the whole job is complete → **stop looping** | **Sentinel phrase** in the last assistant message (read via the engine's existing `LastAssistantMessage(repoPath)`), backstopped by a hard iteration cap. |

## Decision per turn-completion

When a looping agent's run finishes, read its last assistant message and decide:

1. **Sentinel present** (last message contains the loop's stop phrase, e.g.
   `LOOP_DONE`) → **stop**, mark `done`.
2. **Deny-list hit** (last message mentions a risky action — reuse the existing
   `DenyList`: deploy/push/force/reset --hard/…) → **stop**, mark `escalate`
   (don't resend; hand back to the human).
3. **Cap reached** (`iterationsDone >= maxIterations`) → **stop**, mark
   `capped`/`escalate`.
4. **Run errored** (`Status == "error"`) → **pause**, mark `error`.
5. **Otherwise** → **resend** the fixed prompt, `iterationsDone++`, record an
   audit entry.

## Safety (this mode acts unattended)

Loop mode **sends prompts to agents with no human in the loop** — exactly the
confused-deputy authority `plan.md`'s risk section warns about. So:

- **Operator gate, off by default.** Reuse [AutopilotGate](plans/loop-autopilot-safety.md):
  the web can start/stop a loop only when the **host** has opened the gate. The web
  can never open it. (Same fence as every other autopilot endpoint.)
- **Sentinel + cap, not an LLM judge** — chosen for done-detection precisely
  because it's deterministic, free, and adds **no new prompt-injection surface**
  (an LLM judge reading untrusted agent output would).
- **Hard `maxIterations` cap** (default 10) — the loop refuses to run past it.
- **Deny-list escalation** — risky-looking endings pause and hand back to you.
- **Per-loop Stop button**; auto-pause on a run `error`.
- **Audit every send** to the existing append-only `autopilot-audit.jsonl`
  (`outcome = "loop"`), so unattended sends are durably recorded.

## Data model (new)

A `LoopConfig` per armed agent, backend-synced (extend `autopilot.json` or a new
`loops.json`):

```
repoId         string   which agent
prompt         string   the fixed text to resend (free text; seedable from a routine/custom prompt)
sentinel       string   stop phrase to watch for (default "LOOP_DONE")
maxIterations  int      hard cap (default 10)
active         bool     loop running?
iterationsDone int      live counter
status         string   "looping" | "done" | "escalate" | "capped" | "error" | "stopped"
lastSentAt     long
```

## Slices

1. **Backend engine + config** — `LoopConfig` model + persistence; drive the
   per-turn decision above from the autopilot tick (extend `AutopilotService`, or a
   small dedicated `LoopService` it owns). Reuse `RunSession.TryBeginRun` +
   `CliRunnerService.RunAsync` for the send (the existing `TrySend` path), and the
   audit log. All gated.
2. **API** — `POST /api/autopilot/loop` (start / update / stop); loop state folded
   into `GET /api/autopilot`.
3. **Frontend** — per-agent loop controls in `AutopilotConsole` (start: prompt +
   cap + sentinel; live status: iteration count, state badge, **Stop**). Live via
   the existing 4 s poll. Advanced-gated.
4. **Verify** on an isolated port with Playwright (start a loop against a fake/echo
   agent; confirm resend-on-done, sentinel-stop, cap-stop, deny-list escalate, Stop
   button). Honesty pass on `understanding-app/`.

## Open questions (defaulted; override anytime)

- **Done-detection** = sentinel + cap (vs LLM judge / no-progress / manual). Picked
  the deterministic, injection-free default.
- **Resend trigger** = after *every* completed turn (not only question-endings).
- **One loop per agent** at a time.
