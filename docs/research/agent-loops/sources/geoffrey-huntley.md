# Geoffrey Huntley

**Author / credibility:** Australian open-source developer (formerly Gitpod, sourcegraph-adjacent tooling work) who invented and named the "Ralph Wiggum" technique — the canonical run-a-coding-agent-in-a-bash-while-loop pattern — in mid-2025. Credible on agentic loops specifically because he runs the loop himself at scale and publishes the artifacts: the CURSED programming language (a self-hosted compiler built entirely by the loop), a Y Combinator hackathon run that shipped 6 repos overnight, and a contract-delivery cost receipt. This is first-hand practice, not commentary; his `ghuntley.com/ralph/` post includes the live prompts and file layout he uses.

**Primary sources retrieved:**
- https://ghuntley.com/ralph/ — retrieved 2026-08-04
- https://github.com/ghuntley/how-to-ralph-wiggum — retrieved 2026-08-04

## Techniques

### The Ralph loop (agent in a bash while-loop)
- **What they actually do/say:** The entire harness is `while :; do cat PROMPT.md | claude ; done` (repo README shows `claude`; the blog post shows `claude-code`). Each iteration starts with a **fresh, cleared context window**; progress persists only in files and git history, never in the model's memory. One task per iteration — "one task per loop only" prevents context bloat and keeps behavior near-deterministic. Deliberately monolithic: single repo, single process, no multi-agent coordination layer.
- **Evidence:** demonstrated — loop code, live prompts, and shipped projects (CURSED compiler, 6-repo overnight hackathon run) are shown.
- **Cited:** https://ghuntley.com/ralph/ retrieved 2026-08-04; https://github.com/ghuntley/how-to-ralph-wiggum retrieved 2026-08-04

### Two-mode operation: planning prompt vs building prompt
- **What they actually do/say:** Two prompt files drive the same loop in different modes. `PROMPT_plan.md` runs gap analysis — "specs vs code" — and outputs a prioritized TODO list with *no implementation, no commits*. `PROMPT_build.md` picks the most important item from the plan, implements it fully ("DO NOT IMPLEMENT PLACEHOLDER... WE WANT FULL IMPLEMENTATIONS"), runs that unit's tests, commits, and updates the plan as a side effect. Requirements come from an upstream human+LLM phase that writes `specs/*.md` (source of truth).
- **Evidence:** demonstrated — the actual CURSED prompt text is published in the blog post, and the repo templates both prompt files.
- **Cited:** https://ghuntley.com/ralph/ retrieved 2026-08-04; https://github.com/ghuntley/how-to-ralph-wiggum retrieved 2026-08-04

### Plan file as cross-iteration shared state (`IMPLEMENTATION_PLAN.md` / `@fix_plan.md`)
- **What they actually do/say:** A persistent prioritized task list on disk is the loop's memory. Every iteration deterministically loads the same files (`@fix_plan.md`, `@specs/*`, `@AGENT.md`) — he calls this "deterministic stack allocation." When the loop gets stuck or the plan goes stale, the recovery move is: delete the plan file and regenerate it from a planning iteration.
- **Evidence:** demonstrated — file structures shown; the delete-and-regenerate recovery is described as his own recurring practice.
- **Cited:** https://ghuntley.com/ralph/ retrieved 2026-08-04; https://github.com/ghuntley/how-to-ralph-wiggum retrieved 2026-08-04

### Tests and compilers as backpressure (quality gates inside the loop)
- **What they actually do/say:** The loop's correctness comes from mechanical gates, not the model: Rust compilation ("slow but high correctness"), per-feature unit tests run immediately after implementing ("After implementing... run the tests for that unit"), static analyzers (Dialyzer, Pyright for dynamic languages), and custom scanners. Tests must carry documentation explaining *why* they matter — deliberate breadcrumbs for future iterations that start with zero context.
- **Evidence:** demonstrated — an Elixir `QueryOptimizerTest` with `@moduledoc` breadcrumb documentation is shown in the post.
- **Cited:** https://ghuntley.com/ralph/ retrieved 2026-08-04

### Context-window budgeting and subagent fan-out
- **What they actually do/say:** Allocate ~30% of context to specs and plans; keep status reports out of `@AGENT.md` to save space. Fan expensive read operations (searches, summarization) out to subagents — "up to 500 parallel subagents for reads" — but strictly **one** agent for builds/tests. He also reports Claude's advertised 200k context clipping at 147–152k practical.
- **Evidence:** demonstrated — these numbers come from his running CURSED prompt, published verbatim.
- **Cited:** https://ghuntley.com/ralph/ retrieved 2026-08-04

### Stopping conditions: plan exhaustion or human pull-the-plug
- **What they actually do/say:** The inner iteration ends naturally (tests pass, commit made, agent exits). The outer loop has no smart terminator: it runs until the plan is exhausted, an iteration cap, or Ctrl+C — "Eventually, Ralph will run out of things to do... or it goes completely off track." Human intervention remains required for broken compilation and prompt tuning: "Engineers are still needed... no way this is possible without senior expertise guiding Ralph."
- **Evidence:** demonstrated — described as observed behavior of his own runs, including the failure modes.
- **Cited:** https://ghuntley.com/ralph/ retrieved 2026-08-04; https://github.com/ghuntley/how-to-ralph-wiggum retrieved 2026-08-04

## Search trail
- "Geoffrey Huntley Ralph Wiggum technique agent loop while loop" — rich results; primary sources ghuntley.com/ralph/ and the how-to-ralph-wiggum GitHub repo both fetched successfully.
- Secondary coverage surfaced (codecentric.de, geocod.io, joshowens.dev, awesomeclaude.ai, Dev Interrupted podcast) — not used for claims; primary sources sufficed.
