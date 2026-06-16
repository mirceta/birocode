# Loop autopilot — the engine (how the loop runs)

> Subdoc of **[loop-autopilot.md](loop-autopilot.md)**. Secondary to
> [the brain](loop-autopilot-brain.md): the brain decides *what* to send; the
> engine is the plumbing that *runs the loop forever* and feeds the brain each
> idle agent. Four candidates, scored.

## The four engines

- **A · Backend polling service** — a hosted `BackgroundService` ticks on an
  interval (~10 s), finds idle agents, hands each to the brain, routes the result.
- **B · Backend event-driven hook** — no polling; trigger the brain the moment an
  agent *finishes a turn*, by hooking the run-completion event in `RunSessionService`.
- **C · Real looping Claude agent** — spawn an actual Claude agent in a dock with a
  looping prompt that calls the harness API to inspect and answer peers.
- **D · Frontend poller** — the dashboard polls peers every N seconds while a
  browser tab is open.

## Scorecard (5★ = best)

| Engine | Ease of dev | Low dev risk | Robustness¹ | Token cost² | Responsiveness | Total |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **A · Backend polling** | ★★★☆☆ | ★★★★☆ | ★★★★★ | ★★★★★ | ★★★★☆ | **21/25** |
| **B · Event-driven hook** | ★★★☆☆ | ★★★☆☆ | ★★★★★ | ★★★★★ | ★★★★★ | **21/25** |
| **C · Real looping agent** | ★★☆☆☆ | ★☆☆☆☆ | ★★☆☆☆ | ★☆☆☆☆ | ★★★☆☆ | **9/25** |
| **D · Frontend poller** | ★★★★★ | ★★★★☆ | ★☆☆☆☆ | ★★★★★ | ★★★☆☆ | **18/25** |

¹ Runs with no browser open, survives restarts, can't silently stop.
² 5★ = no tokens spent running the loop itself (separate from the brain's LLM calls).

## Recommendation

**Start with A (backend polling).** Lowest-risk robust path, decoupled from the run
lifecycle, ~10 s latency is fine for advancing a stalled agent. **Evolve to B**
(event-driven) if instant reaction matters — it reuses everything but the trigger.
**D** is at most a thin UI cue on top of the backend, never the engine (it dies
when the tab closes). **C** only if you specifically want a literal Claude agent
looping, and accept the worst risk, robustness, and token cost.

> Note: the engine is token-free, but the **brain** spends tokens per check (an LLM
> classification). Cost scales with how many agents are idle and how often the
> engine ticks — a reason to favour B's "only on turn-completion" trigger later.
