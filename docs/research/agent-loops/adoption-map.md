# Adoption map — technique catalog × our loop framework

Confronts every entry of [techniques.md](techniques.md) (T01–T37, exactly once
each) with the harness's existing loop framework: the `autopilot-loops`
baseline spec (`openspec/specs/autopilot-loops/spec.md`), the shipped loop
surfaces (engine, dock, console, briefing, flags, audit, eval suite), and the
agent-facing convention docs. Buckets: **already-have** (naming the concrete
requirement or surface), **worth-adopting** (ranked, with a landing-site
sketch), **not-applicable** (with the reason). Synthesized 2026-08-04.

Coverage check: already-have 19 + worth-adopting 8 + not-applicable 10 = 37. ✓

---

## Worth adopting (ranked — each entry is a seed for a follow-up OpenSpec change)

### Rank 1 · T08 — A runnable check closes the loop
**Gap:** our goal/queue VERIFICATION_STATE is *agent-self-reported*: the agent
emits `GOAL_VERIFIED` / `STEP_VERIFIED` after being asked to verify. The
dossier's loudest consensus (7 sources, mostly demonstrated) is that the check
must be *machine-checkable* — a command whose exit code, not the model's
opinion, decides. **Landing site:** engine + kinds — an optional per-arm
"verify command" (script/command line) on goal/queue loops; the harness runs
it (or demands its output) when the sentinel arrives, and only a passing check
lets the sentinel count; failing check → back to WORKING_STATE with the
check's output injected. Dock: a VERIFICATION_STATE parameter box for the
command; eval: one scenario where a lying sentinel is caught by the check.

### Rank 2 · T02 — Fresh-context outer loop over durable state
**Gap:** our driven loops resume a *pinned session* every iteration
(fix-loop-conversation-identity), so context accumulates — the exact thing
Ralph/the compiler run avoid; their iterations are amnesiac by design and
re-orient from disk. **Landing site:** engine — a LOOP-WIDE per-arm toggle
"fresh session each iteration": instead of `--resume` on the pinned session,
each tick starts a new session whose prompt includes the re-orientation
protocol (T21's ledger). Dock: toggle + explanation line; convention doc: the
re-orientation contract.

### Rank 3 · T21 — Progress files as cross-iteration memory
**Gap:** nothing in our framework asks the driven agent to maintain durable
progress state on disk; loop memory is the session transcript (which rank 2
would drop) plus our engine-side sent-history. **Landing site:** convention —
`docs/loop-driven-agent-convention.md` gains a progress-ledger contract
(update `LOOP_PROGRESS.md` before ending each turn; read it on start);
briefing — a default editable rule teaching it; engine (optional) — compose
the ledger's tail into the next iteration's prompt. Prerequisite for rank 2.

### Rank 4 · T10 — Adversarial review in a fresh context
**Gap:** our verification phase is graded by the same session that did the
work; no fresh-context reviewer exists. We already have the machinery to fix
that: the one-shot CLI pattern of `CliPromptClassifier` (single-flight,
off-tick, stub fallback). **Landing site:** engine — an optional "second
opinion" step on goal/queue verification: a fresh one-shot CLI call sees only
the diff (`git diff` since arm) plus the goal/step text and returns
refute/confirm; refute → escalate with the reviewer's reason. Dock:
VERIFICATION_STATE toggle; audit: record the verdict.

### Rank 5 · T22 — Fresh-session reset instead of in-context correction
**Gap:** when verification fails, our loops re-propose the verify prompt into
the *same* session (queue/goal re-propose behavior) and eventually escalate;
the practitioners' two-strikes rule says a fresh session with a distilled
better prompt beats correcting in a poisoned context. **Landing site:** engine
state machine — after N failed verify cycles on the same step, offer (or
auto-take, per-arm setting) a "reset iteration": fresh session, prompt =
step + distilled failure summary; only then escalate. Pairs naturally with
rank 2's fresh-session plumbing.

### Rank 6 · T04 — Plan-then-build phase separation
**Gap:** goal loops jump straight to WORKING_STATE with a composed work
prompt; there is no planning phase producing a durable plan the iterations
execute against (Huntley's two-prompt loop, Cherny's plan-then-one-shot).
**Landing site:** kinds — an optional PLANNING_STATE ahead of WORKING_STATE
for goal loops: first iteration produces/refreshes a plan file (T21 ledger),
subsequent iterations execute its top item; the dock's state-machine panel
already has the section grammar to present it.

### Rank 7 · T11 — Evidence, not assertions
**Gap:** our verify prompts ask the agent to verify but don't demand shown
evidence, and the audit records sends, not proof. **Landing site:** kinds —
verification templates require pasting the check's actual output (command +
result) ahead of the sentinel; briefing — a default rule stating it; audit —
sent-history rows keep the evidence blob so the operator can review it from
the console. Cheap; also strengthens rank 1.

### Rank 8 · T36 — Self-improving prompts from failure transcripts
**Gap:** we collect exactly the right raw material (audit trail, loop debug
snapshot from add-loop-debug-handoff) but never feed it back. **Landing
site:** console Loops tab — an "improve this loop" action that sends the
debug snapshot + recent audit rows to a one-shot CLI call and returns
suggested prompt/briefing-rule edits for the operator to accept; suggestions
only, never auto-applied.

---

## Already have

- **T01 — Minimal inner agent loop:** delegated by design. The engine drives
  the Claude Code CLI (`AutopilotService` → chat module's `RunSessionService`),
  which *is* the inner tools-in-a-loop; our framework is deliberately the
  outer layer. Checkable: loop sends land as normal CLI runs (baseline
  "Suggest-mode suggestion loops always pend the best candidate" onward all
  assume it).
- **T03 — Outer work-queue harness decides completion:** this is the queue
  kind end-to-end: stash as the work queue, consume-on-land, the engine's
  verify phases and reply ladder deciding done/again/escalate — the harness,
  not the model, ends the loop. Baseline: "A stopped queue loop with remainder
  offers one-step resume", "Activation resets phase state", "A queue arm names
  its binding before and after arming".
- **T07 — Heartbeat with idle sentinel and defer-while-busy:** our engine's
  tick guard defers while a run is active and gates on witnessed, fresh
  replies (shipped via fix-loop-noreply-stall / fix-loop-verify-stale-reply);
  the sentinel ladder (`LOOP_DONE`, `NEEDS_HUMAN`, final-line anchoring) is
  `docs/loop-driven-agent-convention.md`. OpenClaw's HEARTBEAT_OK contract is
  a direct external analogue — independent convergence on our design.
- **T09 — Escalating stop-gates:** our ladder mirrors the guide's: composed
  verify prompts re-checked per phase, sentinel-gated exits, deny fences,
  caps, and NEEDS_HUMAN escalation. Baseline: "Phased loop parameters are
  presented as state-machine sections" (badges, transitions, terminal
  outcomes).
- **T12 — Externalized done-ness ledger:** the queue stash is exactly this — a
  reorderable on-disk work ledger the loop drains, with cumulative
  sent-history (queue-loop-visibility) as the flipped-to-done record. Baseline:
  queue binding/resume requirements.
- **T13 — Browser-level end-to-end self-verification:** repo conventions
  already mandate it: `docs/claude-web/browser-testing.md` (verify with a
  headless browser before claiming a fix), `docs/detached-verification-convention.md`
  (long verifications outlive the session), and the console's System
  Tests/E2E eval surfaces run real browser checks.
- **T14 — Hard iteration caps:** turn caps with a terminal `capped` status are
  baseline behavior (loop-eval's cap scenario tests it; the parameter panel's
  LOOP-WIDE section exposes it).
- **T15 — Human checkpoints, unchanged review bar:** suggest mode on every
  kind ("Suggest-mode suggestion loops always pend the best candidate"),
  `NEEDS_HUMAN`, the operator gate ("Gate closed keeps reasons undisclosed"),
  and escalate statuses are precisely bracketed autonomy.
- **T16 — Deterministic fences:** word-boundary deny-lists on routines and
  replies, per-arm trims, the operator gate, and the kill switch are our
  deterministic, non-LLM fences. Baseline: "Deny-list terms match routines as
  whole words with a named reason", "Reply deny-list terms match as whole
  words", "The effective deny-list is adjustable per arm".
- **T17 — LLM-as-judge treated as weakest gate:** the CLI-backed classifier
  judges routine matches behind the same contract as the stub, with fallback
  on failure — and every judge verdict still passes threshold, deny, cap, and
  gate fences, which is exactly the "weakest gate" posture. Baseline: "A
  CLI-backed classifier can replace the stub behind the same contract".
- **T24 — Persistent instruction file:** repo CLAUDE.md (the CLI reloads it
  every session) plus our operator-editable briefing rules list — injected
  into every loop send — are the institutional-memory pair
  (loop-agent-briefing, shipped).
- **T25 — Quiet tools, log to files:** the detached-verification convention's
  log-file + terminal-marker contract is this exact rule for long checks.
- **T26 — Mid-loop reinforcement injection:** the briefing frame composed at
  the send choke point re-states the rules on *every* loop send — Ronacher's
  injection pattern at our loop's granularity (loop-agent-briefing; FLAG:
  channel teaches the agent to signal back).
- **T29 — Risk-scoped permissioning:** threshold-gated drive sends, per-arm
  deny trims, suggest-vs-drive as the autonomy dial, and the operator gate map
  onto allowlist/classifier gating. Baseline: threshold gating in
  "Suggest-mode suggestion loops...", per-arm deny requirement.
- **T30 — Start small, then scale:** suggest mode on every kind is the ramp
  (watch what it *would* send before letting it drive), and the queue arm
  preview shows binding + items before any send. Baseline: "A queue arm names
  its binding before and after arming".
- **T31 — Parallelism stratified by review cost:** the dock is multi-tab
  parallel agents under one operator, with the XOR coordinator (one armed loop
  per agent), per-tab loop badges, and binding disclosure keeping each track's
  blast radius legible. The stratification judgment stays with the operator,
  as the sources also practice it.
- **T32 — Fleet bookkeeping and phone-reachable monitoring:** this is Claude
  Web's founding premise — phone-accessible dock, waiting badges, live loop
  decision readout ("The dock discloses the armed loop's live decision"),
  state strip and phase chips ("The parameter panel surfaces the armed loop's
  live state").
- **T33 — Message queueing and stall auto-continue:** the queue kind *is*
  productized message queueing; the drive no-reply escape
  (fix-loop-noreply-stall) is stall detection at the engine.
- **T34 — Durable execution:** detached backend-owned runs that survive
  disconnects (chat spec: RunSessions with seq-numbered reattach), loop resume
  with preserved sent-history ("A stopped queue loop with remainder offers
  one-step resume"), and operator-stop-is-not-error ("An operator stop
  resolves a driven loop as stopped, not errored").

## Not applicable

- **T05 — Orchestrator–workers fan-out:** in-turn subagent fan-out already
  belongs to the CLI (Task tool); a harness-level LLM orchestrator spawning
  worker sessions contradicts the one-driven-session-per-tab design, and
  Ronacher's mixed-write subagent failures (T37) caution against it. The
  human+dock is our orchestrator.
- **T06 — Git-mediated uncoordinated parallel claiming:** multiple agents
  writing the same repo concurrently is out of scope — tabs are per-repo and
  the memory of orphaned-run double-drives is exactly why the XOR coordinator
  exists.
- **T18 — Reference-oracle fallback:** requires a domain with a known-good
  reference implementation (GCC); general product repos have none.
- **T19 — Context attention budget:** the window is the CLI's to manage; the
  harness's only lever is keeping its injections small, which the compact
  briefing frame already is by design.
- **T20 — Compaction:** CLI-internal shipped mechanism; nothing for the
  harness to build.
- **T23 — Subagent context isolation:** CLI-internal (Task tool); the driven
  agent can already use it, and our conventions don't need to mandate it.
- **T27 — Just-in-time retrieval:** CLI-internal shipped behavior
  (glob/grep-based agentic search).
- **T28 — Sandboxed YOLO execution:** permission mode and OS-level sandboxing
  are host decisions outside the Product; the harness's containment layer is
  the operator gate + deny fences + caps, which exist. (Adopting containers
  would be an infra change, not a loop-framework change.)
- **T35 — Explicit effort-scaling rules:** sizing rules govern how many
  workers a coordinator spawns; our loops drive exactly one session, so there
  is no fan-out decision to scale.
- **T37 — Negative results:** not a feature to adopt — calibration evidence.
  It *supports* current design choices: single driven session (vs. write-
  capable subagents), conversational prompts over slash-command automation,
  and skepticism toward MCP-heavy tooling.
