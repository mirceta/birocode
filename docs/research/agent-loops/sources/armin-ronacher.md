# Armin Ronacher

**Author / credibility:** Creator of Flask, Jinja2, and Werkzeug; former Sentry principal; now building LLM agents professionally at Earendil. Doubly credible on agentic loops: he is both a heavy *operator* of coding agents (daily Claude Code use, full-permission "yolo" runs in Docker) and a *builder* of a production agent harness, reporting design lessons from his own system. His writing is unusually honest about failures ("Things That Didn't Work"), which raises trust in what he says did work. First-hand practice throughout; his 2026 "Coming Loop" post is part practice, part forward-looking analysis and is rated accordingly below.

**Primary sources retrieved:**
- https://lucumr.pocoo.org/2025/6/12/agentic-coding/ — retrieved 2026-08-04
- https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/ — retrieved 2026-08-04
- https://lucumr.pocoo.org/2025/11/21/agents-are-hard/ — retrieved 2026-08-04
- https://lucumr.pocoo.org/2026/6/23/the-coming-loop/ — retrieved 2026-08-04

## Techniques

### Full-permission agent runs isolated in Docker (`claude-yolo`)
- **What they actually do/say:** He runs Claude Code with full permissions via a `claude-yolo` alias, mitigating risk with Docker containerization. Workflow shape: "assigning a job to an agent (which effectively has full permissions) and then waiting for it to complete."
- **Evidence:** demonstrated — his own alias and daily workflow.
- **Cited:** https://lucumr.pocoo.org/2025/6/12/agentic-coding/ retrieved 2026-08-04

### Engineer the environment for fast, agent-proof feedback (test caching, Go, logging-as-tool)
- **What they actually do/say:** The loop is only as good as its feedback latency. "Tools need to be **fast**. The quicker they respond (and the less useless output they produce) the better," and they must be "protected against an LLM chaos monkey" using them wrongly. He moved backends from Python to Go partly because Go tests run "straightforwardly and incrementally" (test caching) while Python's magic (pytest fixtures, async) and startup overhead confuse and slow the agent loop. Logging is infrastructure: e.g. emails logged to stdout in debug mode let the agent complete auth flows unaided by reading verification links out of the log. Also: prefer "the dumbest possible thing that will work," plain SQL, stable dependencies (agents leave breadcrumbs that upgrades invalidate).
- **Evidence:** demonstrated — reported from his own project migrations and running setup.
- **Cited:** https://lucumr.pocoo.org/2025/6/12/agentic-coding/ retrieved 2026-08-04

### Negative results: slash commands, hooks, print mode, sub-agents (as parallelism) didn't stick
- **What they actually do/say:** He built and abandoned `/fix-bug`, `/commit`, `/add-tests`, `/fix-nits`, `/next-todo` — unstructured argument passing made them clumsier than plain conversation. Hooks were ineffective under yolo mode ("I wish hooks could actually manipulate what gets executed" — he resorted to PATH hacks). Claude print mode for mixing deterministic code with inference was "slow and difficult to debug." Sub-task/sub-agent parallelization with mixed read-write operations misbehaved; he got "better results by starting new sessions, writing thoughts to Markdown files, or even switching to o3." Automation rule of thumb: "if I do want to automate something, I must have done it a few times already."
- **Evidence:** demonstrated — these are his own tried-and-abandoned experiments, listed specifically.
- **Cited:** https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/ retrieved 2026-08-04

### Mid-loop reinforcement injection (including "echo tools")
- **What they actually do/say:** In the agent he builds at Earendil, the harness injects information after each tool call rather than relying on the initial context alone: re-stating objectives, hinting after failed tool calls, reporting background state changes. He uses "echo tools" — tools that simply reflect the agent's own task list back at it — for self-reinforcement and focus. When a loop completes without calling the required output tool (the model "frequently forgets"), the harness injects a reminder rather than failing.
- **Evidence:** demonstrated — design of the production agent he built, with concrete mechanisms.
- **Cited:** https://lucumr.pocoo.org/2025/11/21/agents-are-hard/ retrieved 2026-08-04

### Failure isolation via subagents + shared virtual filesystem
- **What they actually do/say:** Risky subtasks run in isolated subagents "until they succeed," reporting only results and failed approaches back — so retry noise never pollutes the main loop's context. Because subagents and multiple inference calls need common state, he built a virtual filesystem all tools read/write through shared paths, enabling chains like code-execution → image-generation → code-execution without dead ends.
- **Evidence:** demonstrated — implemented in his production system.
- **Cited:** https://lucumr.pocoo.org/2025/11/21/agents-are-hard/ retrieved 2026-08-04

### Explicit prompt-cache management in the loop
- **What they actually do/say:** He prefers explicit cache control over automatic: cache points placed after the system prompt and at conversation start, with the final point moved up as the conversation grows; dynamic data (like current time) is injected in later messages rather than the static system prompt so the cache stays valid. He also admits the unsolved part: "We find testing and evals to be the hardest problem here."
- **Evidence:** demonstrated — his team's implemented caching strategy.
- **Cited:** https://lucumr.pocoo.org/2025/11/21/agents-are-hard/ retrieved 2026-08-04

### The outer harness loop (work queue above the agent loop)
- **What they actually do/say:** He names the two-level structure: the inner agent loop ("the model calls a tool, incorporates the result... runs tests, and eventually produces some answer") and an outer loop where "work is put into a queue of sorts, a machine picks it up, attempts it, stops, and then some harness decides whether that was actually the end." Continuation options: keep the session and inject a message, start a fresh session with modified context, or ship the task to another machine. Key insight on stopping: the harness — not the model — decides completion, and its signal "does not have to be objective or binary, it just has to be useful enough to drive another iteration"; the task "stays alive beyond the point where the model by itself would normally have said: 'I am done.'" He is candid that his own results are mixed: "I have not had much success with this way of working for code I deeply care about."
- **Evidence:** recommended — a clear articulation of the pattern with observed examples (Bun's Zig→Rust port, his own MiniJinja Go port), but he does not show his own harness code and reports limited personal success.
- **Cited:** https://lucumr.pocoo.org/2026/6/23/the-coming-loop/ retrieved 2026-08-04

## Search trail
- "Armin Ronacher blog agentic coding agents loop workflow lucumr" — surfaced all four posts used plus "Tools: Code Is All You Need" (2025-07-03, not fetched — tool-design focus, marginal to loops; candidate for a later refresh).
- All four target fetches succeeded on first attempt; no dead links.
