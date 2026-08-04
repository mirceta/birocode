# Technique catalog — agentic loops

Synthesized in one sitting (2026-08-04) from the committed source documents in
`sources/`. Every entry traces to at least one source file; nothing here was
invented during synthesis. Ratings use the fixed scale from the
[README](README.md): **demonstrated** > **recommended** > **secondhand**. When
sources disagree in strength, the rating is the strongest *honestly earned*
level and the entry says which source earns it.

Stable IDs (T01…T37) are referenced 1:1 by [adoption-map.md](adoption-map.md).

---

## A. Loop architecture

### T01 — Minimal inner agent loop
An agent is an LLM calling tools in a loop with environment feedback until it
answers in plain text; the harness's job is faithful execution and
result-echoing, nothing smarter. Ball builds the whole thing in ~300 lines of
Go with three tools ("an LLM, a loop, and enough tokens"); Anthropic states the
same shape as the canonical `gather context → take action → verify work →
repeat` cycle.
**Sources:** [thorsten-ball](sources/thorsten-ball.md),
[anthropic-building-effective-agents](sources/anthropic-building-effective-agents.md),
[anthropic-claude-agent-sdk](sources/anthropic-claude-agent-sdk.md).
**Evidence:** demonstrated (Ball: full code + transcripts).

### T02 — Fresh-context outer loop over durable state
Run the agent as repeated *fresh* sessions — cleared context every iteration —
with all state in files and git, not in the model's memory. Huntley's Ralph
loop is literally `while :; do cat PROMPT.md | claude ; done` (one task per
iteration); Anthropic's C-compiler run drove ~2,000 fresh headless sessions
through the same shape; their long-running-harness post formalizes it as
session-chaining with re-orientation artifacts.
**Sources:** [geoffrey-huntley](sources/geoffrey-huntley.md),
[anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md),
[anthropic-effective-harnesses-long-running-agents](sources/anthropic-effective-harnesses-long-running-agents.md).
**Evidence:** demonstrated (three independent first-hand runs).

### T03 — An outer work-queue harness decides completion, not the model
Above the inner loop sits a harness holding a queue of work; it picks tasks,
runs an agent attempt, and *itself* decides whether the task is done or goes
around again — "the task stays alive beyond the point where the model by itself
would normally have said: 'I am done'" (Ronacher). Cherny's `/loop`, `/goal`
and `/schedule` are the same shape productized (secondhand for his usage);
Anthropic's harness posts demonstrate concrete instances.
**Sources:** [armin-ronacher](sources/armin-ronacher.md),
[boris-cherny](sources/boris-cherny.md),
[anthropic-effective-harnesses-long-running-agents](sources/anthropic-effective-harnesses-long-running-agents.md).
**Evidence:** demonstrated (Anthropic harness runs); Ronacher's articulation is
recommended (he shows no harness code and reports mixed personal success).

### T04 — Plan-then-build phase separation
Split the loop into a planning mode that produces/refreshes a prioritized plan
(no implementation) and a building mode that executes the top item. Huntley
drives one loop with two prompt files (`PROMPT_plan.md` / `PROMPT_build.md`);
Anthropic splits initializer-agent from coding-agent; Cherny plans in plan
mode, then one-shots under auto-accept ("once there is a good plan, it will
one-shot the implementation almost every time").
**Sources:** [geoffrey-huntley](sources/geoffrey-huntley.md),
[anthropic-effective-harnesses-long-running-agents](sources/anthropic-effective-harnesses-long-running-agents.md),
[boris-cherny](sources/boris-cherny.md),
[anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md).
**Evidence:** demonstrated (Huntley's published prompts; Cherny's daily habit).

### T05 — Orchestrator–workers fan-out
A lead agent decomposes the task and spawns parallel worker agents (3–5 in
Anthropic's production research system), synthesizes their condensed reports,
and decides iterate-or-stop at the coordinator. Measured: 90.2% better than
single-agent on their eval, at ~15× token cost.
**Sources:** [anthropic-multi-agent-research-system](sources/anthropic-multi-agent-research-system.md),
[anthropic-building-effective-agents](sources/anthropic-building-effective-agents.md).
**Evidence:** demonstrated (shipped production system with numbers).

### T06 — Uncoordinated parallel agents with git-mediated task claiming
No orchestrator at all: parallel fresh-session agents share a bare git repo,
claim tasks by committing lock files (`current_tasks/`), merge each other's
work, and self-select "the next most obvious problem." Coordination emerges
from git plus a near-perfect shared verifier.
**Sources:** [anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md).
**Evidence:** demonstrated (the ~2,000-session compiler run).

### T07 — Heartbeat tick with an idle sentinel and defer-while-busy
For always-on agents, a periodic turn asks "anything need attention?"; the
agent replies with a designated idle token (`HEARTBEAT_OK`) that the harness
strips/suppresses, so idle polls stay silent; heartbeats defer while a real run
is active, never interrupting in-flight work.
**Sources:** [peter-steinberger](sources/peter-steinberger.md) (OpenClaw docs).
**Evidence:** demonstrated (his shipped project's documented contract).

---

## B. Verification and stopping

### T08 — A runnable check closes the loop (and the verifier must be near-perfect)
The single loudest consensus in the whole dossier. Give the loop something
that produces pass/fail — tests, build exit code, a diff-against-fixture
script — and "the loop closes on its own"; Cherny calls the feedback loop the
thing that will "2-3x the quality of the final result." The C-compiler run's
core lesson: "It's important that the task verifier is nearly perfect,
otherwise Claude will solve the wrong problem" — and an overly strict verifier
sends the loop chasing spurious differences. Huntley calls the same thing
"backpressure"; Willison: test suites "dramatically amplify tool
effectiveness"; Ronacher engineers whole environments for fast, agent-proof
feedback.
**Sources:** [anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md),
[boris-cherny](sources/boris-cherny.md),
[anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md),
[geoffrey-huntley](sources/geoffrey-huntley.md),
[simon-willison](sources/simon-willison.md),
[armin-ronacher](sources/armin-ronacher.md),
[anthropic-writing-tools-for-agents](sources/anthropic-writing-tools-for-agents.md).
**Evidence:** demonstrated (Cherny's browser loop, the compiler run, Ralph,
Willison's Fly.io run, Ronacher's environments).

### T09 — Escalating stop-gates
Grade how hard the check gates the stop: in-prompt "iterate until it passes" →
a goal condition an evaluator re-checks every turn → a Stop hook that blocks
turn-end until the check passes (with a hard override after 8 blocks) → a
fresh-context verification agent. "The /goal and Stop hook versions are what
let an unattended run finish correctly without you."
**Sources:** [anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md).
**Evidence:** recommended (product mechanisms described, no run shown).

### T10 — Adversarial review in a fresh context / by a second model
Before counting unattended work done, have a reviewer that did not produce the
change check it: a fresh subagent that sees only the diff and the criteria
(Anthropic), or a different model entirely (Steinberger pastes specs into a
separate Gemini chat, has GPT-5 review plans, escalates stuck problems to an
"Oracle"). Caveat from the guide: a reviewer prompted to find gaps will find
some even in sound work — scope it to correctness.
**Sources:** [anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md),
[peter-steinberger](sources/peter-steinberger.md),
[boris-cherny](sources/boris-cherny.md) (writer/reviewer split).
**Evidence:** demonstrated (Steinberger's second-model steps); the
fresh-subagent variant is recommended (guide text).

### T11 — Evidence, not assertions
The agent must show the test output, the command and its result, or a
screenshot — never just claim success. "Reviewing evidence is faster than
re-running the verification yourself, and it works for sessions you weren't
watching."
**Sources:** [anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md).
**Evidence:** recommended.

### T12 — Externalized done-ness ledger
Done-ness lives in a machine-checkable artifact, not the model's opinion: a
JSON feature list with `passes: false` booleans agents may flip only after
verification ("It is unacceptable to remove or edit tests"), fixing the
"premature victory declaration" failure mode. Huntley's plan file plays the
same role for Ralph.
**Sources:** [anthropic-effective-harnesses-long-running-agents](sources/anthropic-effective-harnesses-long-running-agents.md),
[geoffrey-huntley](sources/geoffrey-huntley.md).
**Evidence:** demonstrated (schema shown, deployed against an observed failure).

### T13 — Browser-level end-to-end self-verification
For UI-bearing work, the loop verifies as a user would: Cherny has Claude
drive a real browser against claude.ai/code changes and iterate; Anthropic's
harness lets agents mark features passing only after Puppeteer end-to-end
testing; Steinberger keeps exactly one MCP (chrome-devtools) "to close the
loop" and built Peekaboo for screenshot self-checks.
**Sources:** [boris-cherny](sources/boris-cherny.md),
[anthropic-effective-harnesses-long-running-agents](sources/anthropic-effective-harnesses-long-running-agents.md),
[peter-steinberger](sources/peter-steinberger.md),
[anthropic-claude-agent-sdk](sources/anthropic-claude-agent-sdk.md).
**Evidence:** demonstrated (three independent first-hand practices).

### T14 — Hard iteration caps and explicit stopping conditions
Loop termination is dual: a completion signal OR a hard cap ("a maximum number
of iterations to maintain control"). In practice loops also end at plan
exhaustion (Huntley) or at the model's capability ceiling — the compiler run
stopped when "new features and bugfixes frequently broke existing
functionality," honestly reported.
**Sources:** [anthropic-building-effective-agents](sources/anthropic-building-effective-agents.md),
[geoffrey-huntley](sources/geoffrey-huntley.md),
[anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md).
**Evidence:** demonstrated (Huntley/compiler end states); the cap advice itself
is recommended.

### T15 — Human checkpoints with an unchanged review bar
Autonomy is bracketed by humans: a clear task going in, checkpoint/blocker
pauses during, and human review at the end whose bar does not move — "the same
exact bar regardless of whether the code was written by the model or by a
human" (Cherny, at 80–90% Claude-written code).
**Sources:** [boris-cherny](sources/boris-cherny.md),
[anthropic-building-effective-agents](sources/anthropic-building-effective-agents.md),
[simon-willison](sources/simon-willison.md).
**Evidence:** demonstrated (Cherny's and Willison's stated practice).

### T16 — Deterministic fences around the loop
Non-LLM mechanisms that make rules stick: git hooks running duplication/dead-
code/AST-rule scanners (Steinberger), CI regression gates so new commits can't
break existing behavior (compiler run), and product hooks — "unlike CLAUDE.md
instructions which are advisory, hooks are deterministic."
**Sources:** [peter-steinberger](sources/peter-steinberger.md),
[anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md),
[anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md).
**Evidence:** demonstrated (Steinberger's hook stack; the compiler CI gate).

### T17 — LLM-as-judge: rubric-scored, and treated as the weakest gate
Where checks are fuzzy, a single judge call with a fixed rubric outputting
0.0–1.0 plus pass/fail "was the most consistent and aligned with human
judgements" (Anthropic's research system) — but the SDK post explicitly ranks
model-judged verification last: "generally not very robust," behind
rules-based and visual feedback.
**Sources:** [anthropic-multi-agent-research-system](sources/anthropic-multi-agent-research-system.md),
[anthropic-claude-agent-sdk](sources/anthropic-claude-agent-sdk.md).
**Evidence:** demonstrated (their eval methodology); the ranking is recommended.

### T18 — Reference-oracle fallback for incremental frontiers
When the full task is too monolithic to verify, mix in a known-good reference
implementation (compile most of the kernel with GCC, the rest with the
agent-built compiler) so the loop can bisect blame and shrink the frontier
gradually.
**Sources:** [anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md).
**Evidence:** demonstrated (mid-project harness change).

---

## C. Context across iterations

### T19 — Context as a finite attention budget
Performance degrades as the window fills ("context rot"); curate "the smallest
set of high-signal tokens." Huntley budgets ~30% of context for specs/plans
and reports the advertised 200k clipping at 147–152k practical; Steinberger's
version: "Context is precious, don't waste it."
**Sources:** [anthropic-effective-context-engineering](sources/anthropic-effective-context-engineering.md),
[geoffrey-huntley](sources/geoffrey-huntley.md),
[peter-steinberger](sources/peter-steinberger.md).
**Evidence:** demonstrated (Huntley's running numbers); the principle itself is
recommended.

### T20 — Compaction (summarize and reinitiate)
Near the context limit, distill the conversation and restart with the summary,
preserving decisions, unresolved bugs, and implementation details — shipped in
Claude Code / the Agent SDK.
**Sources:** [anthropic-effective-context-engineering](sources/anthropic-effective-context-engineering.md),
[anthropic-claude-agent-sdk](sources/anthropic-claude-agent-sdk.md).
**Evidence:** demonstrated (shipped mechanism).

### T21 — Progress files as cross-iteration memory
Amnesiac iterations re-orient from disk: `claude-progress.txt` + git history
(Anthropic's harness), extensive READMEs updated frequently (compiler run),
`IMPLEMENTATION_PLAN.md` / `@fix_plan.md` as "deterministic stack allocation"
(Huntley), structured note-taking generally (the Pokemon agent's tallies and
maps). Entry/exit ritual: read notes + git log on session start, commit +
update notes on session end.
**Sources:** [anthropic-effective-harnesses-long-running-agents](sources/anthropic-effective-harnesses-long-running-agents.md),
[anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md),
[geoffrey-huntley](sources/geoffrey-huntley.md),
[anthropic-effective-context-engineering](sources/anthropic-effective-context-engineering.md).
**Evidence:** demonstrated (four independent first-hand mechanisms).

### T22 — Fresh-session reset instead of in-context correction
Failed attempts poison the window. Cherny throws work away and restarts rather
than patching ("don't type 'that didn't work, try X instead' — that keeps the
failed attempt in your context"); the guide's two-strikes rule: after two
failed corrections, `/clear` and re-prompt with what you learned; Huntley's
loop-level variant: delete the stale plan file and regenerate it.
**Sources:** [boris-cherny](sources/boris-cherny.md),
[anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md),
[geoffrey-huntley](sources/geoffrey-huntley.md).
**Evidence:** demonstrated (Cherny's and Huntley's practice); the two-strikes
formulation is recommended.

### T23 — Subagent fan-out for context isolation
Expensive exploration runs in isolated subagent windows that return condensed
summaries (1,000–2,000 tokens back to the coordinator); Huntley fans reads out
to "up to 500 parallel subagents" but keeps exactly **one** agent for
builds/tests. Ronacher's counterweight: subagents with mixed read-write
operations misbehaved for him — isolation is for reads and risky retries.
**Sources:** [anthropic-effective-context-engineering](sources/anthropic-effective-context-engineering.md),
[geoffrey-huntley](sources/geoffrey-huntley.md),
[boris-cherny](sources/boris-cherny.md),
[armin-ronacher](sources/armin-ronacher.md).
**Evidence:** demonstrated (all four first-hand).

### T24 — A persistent instruction file as institutional memory
CLAUDE.md / AGENTS.md is the one file every iteration reloads: Cherny adds
every observed mistake so it never recurs (team-maintained, updated weekly,
@.claude PR tagging); the guide demands it stay lean ("Would removing this
cause Claude to make mistakes? If not, cut it"); Steinberger runs a fat
~800-line AGENTS.md — the sources genuinely disagree on size, not on the
mechanism.
**Sources:** [boris-cherny](sources/boris-cherny.md),
[anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md),
[peter-steinberger](sources/peter-steinberger.md),
[simon-willison](sources/simon-willison.md).
**Evidence:** demonstrated (Cherny's and Steinberger's living files).

### T25 — Quiet tools that log details to files
The verifier "should not print thousands of useless bytes. At most, it should
print a few lines... and log all important information to a file so Claude can
find it when needed." Same economics as Anthropic's measured token-efficient
tool responses (concise format ≈ ⅓ the tokens).
**Sources:** [anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md),
[anthropic-writing-tools-for-agents](sources/anthropic-writing-tools-for-agents.md),
[armin-ronacher](sources/armin-ronacher.md).
**Evidence:** demonstrated (harness rule from the compiler run; measured token
counts).

### T26 — Mid-loop reinforcement injection
Don't rely on the initial context surviving the whole run: the harness
re-states objectives after tool calls, hints after failures, reports
background state changes, and uses "echo tools" that reflect the agent's own
task list back at it; a forgotten required output tool triggers an injected
reminder, not a failure.
**Sources:** [armin-ronacher](sources/armin-ronacher.md).
**Evidence:** demonstrated (his production harness at Earendil).

### T27 — Just-in-time retrieval over pre-loading
Keep lightweight identifiers (paths, queries) and load data into context at
runtime via agentic search (glob/grep/bash) instead of pre-loading everything;
pre-load only the cheap always-needed stuff (CLAUDE.md).
**Sources:** [anthropic-effective-context-engineering](sources/anthropic-effective-context-engineering.md),
[anthropic-claude-agent-sdk](sources/anthropic-claude-agent-sdk.md).
**Evidence:** demonstrated (Claude Code's shipped design).

---

## D. Operating autonomy at scale

### T28 — Sandboxed full-permission (YOLO) execution
Permission prompts hamper loops, so practitioners remove them *inside
containment*: Willison's isolated Fly.io org with a $5 spending cap, Ronacher's
`claude-yolo` in Docker, Steinberger's bare-metal skip-permissions backstopped
by hourly backups ("zero incidents"), Anthropic's sandbox-and-guardrail
advice. The autonomy dial is the blast radius, not the approval dialog.
**Sources:** [simon-willison](sources/simon-willison.md),
[armin-ronacher](sources/armin-ronacher.md),
[peter-steinberger](sources/peter-steinberger.md),
[anthropic-building-effective-agents](sources/anthropic-building-effective-agents.md).
**Evidence:** demonstrated (three independent setups).

### T29 — Risk-scoped permissioning: allowlists and classifier gating
Between "approve everything" and "skip everything": pre-allow known-safe
commands (`/permissions`, `--allowedTools` for unattended runs), auto-accept
only for safely-verifiable loops like test iteration (Cherny), and
classifier-gated auto mode that blocks scope escalation while routine work
proceeds — with abort-on-repeated-blocks for headless runs.
**Sources:** [boris-cherny](sources/boris-cherny.md),
[anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md).
**Evidence:** demonstrated (Cherny's habits); the auto-mode mechanism is
recommended.

### T30 — Start small, then scale the automation
Before unleashing a batch loop: run it on one item, verify behavior, refine
the prompt on the first 2–3 failures, then run at scale. "Start small... test
it on one test. Make sure that it has reasonable behavior."
**Sources:** [boris-cherny](sources/boris-cherny.md),
[anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md).
**Evidence:** recommended (advised ramp; the fan-out recipe is guide text).

### T31 — Parallelism stratified by review cost and blast radius
The human review bottleneck governs how many loops you may run: Willison
parallelizes only research, explanation, low-stakes maintenance, and
spec-driven production changes ("Code that started from your own specification
is a lot less effort to review"); Steinberger sizes concurrent agents by blast
radius (1–2 normally, up to 8 for cleanup); Cherny runs 5 local + 5–10 cloud
sessions and frames context-switching as the skill.
**Sources:** [simon-willison](sources/simon-willison.md),
[peter-steinberger](sources/peter-steinberger.md),
[boris-cherny](sources/boris-cherny.md).
**Evidence:** demonstrated (all three daily operating modes).

### T32 — Fleet bookkeeping and phone-reachable monitoring
Running many loops needs supervision infrastructure: terminal titles
self-reported by agents ("Debugging CI failures - playwright tests"), browser/
phone-reachable terminals for checking on long runs from lunch (VibeTunnel),
phone-started morning sessions and system notifications when a session needs
input (Cherny).
**Sources:** [peter-steinberger](sources/peter-steinberger.md),
[boris-cherny](sources/boris-cherny.md).
**Evidence:** demonstrated (shipped tools + daily practice).

### T33 — Message queueing and stall auto-continue
Keep a long run fed without watching it: queue "continue" messages so a
multi-hour refactor keeps going unattended (Steinberger), detect stalled
generation and auto-press continue (his CodeLooper), queue follow-up work
across parallel projects.
**Sources:** [peter-steinberger](sources/peter-steinberger.md).
**Evidence:** demonstrated (his tools and practice).

### T34 — Durable execution: checkpoint, resume, retry
Long-running agents resume from where errors occurred instead of restarting
("durable execution"); checkpoints make risk cheap — try something, rewind if
it fails; rainbow deployments keep in-flight agents alive across releases.
**Sources:** [anthropic-multi-agent-research-system](sources/anthropic-multi-agent-research-system.md),
[anthropic-claude-code-best-practices](sources/anthropic-claude-code-best-practices.md).
**Evidence:** demonstrated (production reliability engineering).

### T35 — Explicit effort-scaling rules
Embed sizing guidance in the coordinator's prompt — "simple fact-finding: 1
agent, 3-10 tool calls; complex research: 10+ subagents" — so the system
neither over-spawns on trivial work nor under-resources hard work.
**Sources:** [anthropic-multi-agent-research-system](sources/anthropic-multi-agent-research-system.md).
**Evidence:** demonstrated (production prompt rules).

### T36 — Self-improving prompts and tools from failure transcripts
Feed the loop's own failure transcripts back to the model to fix the loop:
Claude diagnoses why an agent prompt fails and rewrites it; a tool-testing
agent rewrote flawed tool descriptions for a 40% task-time reduction;
"concatenate the transcripts from your evaluation agents and paste them into
Claude Code."
**Sources:** [anthropic-multi-agent-research-system](sources/anthropic-multi-agent-research-system.md),
[anthropic-writing-tools-for-agents](sources/anthropic-writing-tools-for-agents.md).
**Evidence:** demonstrated (measured results).

### T37 — Negative results: automation that didn't stick
First-hand abandonments worth as much as successes: Ronacher dropped slash
commands (clumsier than conversation), hooks (ineffective under yolo), print
mode (slow, hard to debug), and write-capable subagent parallelism; his rule —
"if I do want to automate something, I must have done it a few times already."
Steinberger abandoned worktree/PR isolation for same-folder speed and calls
MCPs "context poison"; Cherny (secondhand) dropped plan mode for newer models.
One compiler-run agent `pkill -9 bash`-ed its own loop.
**Sources:** [armin-ronacher](sources/armin-ronacher.md),
[peter-steinberger](sources/peter-steinberger.md),
[boris-cherny](sources/boris-cherny.md),
[anthropic-building-c-compiler](sources/anthropic-building-c-compiler.md).
**Evidence:** demonstrated (tried-and-abandoned experiments, reported
specifically).
