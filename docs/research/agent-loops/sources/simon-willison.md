# Simon Willison

**Author / credibility:** Co-creator of Django, creator of Datasette and the `llm` CLI, and one of the most widely cited independent chroniclers of practical LLM use. Credible on agentic loops because he both coined the now-common working definition (an agent "runs tools in a loop to achieve a goal") and runs the loops himself — his posts document his own Claude Code / Codex sessions, including a sandboxed Fly.io experiment with a real budget cap and his day-to-day multi-agent operation. First-hand practice with a strong analytical layer on top; not secondhand commentary.

**Primary sources retrieved:**
- https://simonwillison.net/2025/Sep/30/designing-agentic-loops/ — retrieved 2026-08-04
- https://simonwillison.net/2025/Oct/5/parallel-coding-agents/ — retrieved 2026-08-04

## Techniques

### Design the loop around a clear goal + iterating tools ("brute-force problem solver")
- **What they actually do/say:** His framework: an agent is something that "runs tools in a loop to achieve a goal." Coding agents are brute-force solvers — if you can reduce a problem to a clear objective plus tools the agent can iterate with, it can often find a solution by trial and error. Success requires "clear success criteria"; automated test suites are the essential feedback signal that "dramatically amplify tool effectiveness."
- **Evidence:** demonstrated — the framework is grounded in his own worked example (Fly.io, below) rather than stated abstractly.
- **Cited:** https://simonwillison.net/2025/Sep/30/designing-agentic-loops/ retrieved 2026-08-04

### YOLO mode inside a blast-radius-limited sandbox
- **What they actually do/say:** Approval prompts hamper agents, but unrestricted agents are dangerous — YOLO mode is "so dangerous, but it's also key to getting the most productive results!" He names three hazards: destructive shell commands, exfiltration of code/secrets, and your machine being used to attack others. His mitigation is to run agents on someone else's computer: GitHub Codespaces is his top pick, with Docker containers and hosted interpreters as alternatives. Concrete demonstration: to investigate Fly.io cold-start performance he created an isolated Fly organization with a **$5 spending cap** and scoped API credentials, then let Claude Code freely iterate on Dockerfiles and deployments inside it.
- **Evidence:** demonstrated — the Fly.io experiment is a first-hand run with the exact isolation setup described.
- **Cited:** https://simonwillison.net/2025/Sep/30/designing-agentic-loops/ retrieved 2026-08-04

### Prefer shell commands + AGENTS.md over MCP for loop tooling
- **What they actually do/say:** Rather than wiring MCP servers, expose plain shell commands — agents already know common tools (Playwright, FFmpeg) from training and can figure out invocations by trial and error inside the loop. Document available packages and example usage in an `AGENTS.md` file so each session starts with the operational knowledge it needs.
- **Evidence:** recommended — advised as his practice-derived preference; the post doesn't show a specific AGENTS.md of his.
- **Cited:** https://simonwillison.net/2025/Sep/30/designing-agentic-loops/ retrieved 2026-08-04

### Parallel agent operation stratified by review cost
- **What they actually do/say:** He runs "multiple terminal windows open running different coding agents in different directories" (Claude Code, Codex CLI, Codex Cloud, Copilot Coding Agent, Jules), in YOLO mode for trusted contexts. The governing constraint is the human review bottleneck: "I can only focus on reviewing and landing one significant change at a time, but I'm finding an increasing number of tasks that can still be fired off in parallel." So he stratifies: parallel tracks get (1) research/proof-of-concept tasks that change nothing he keeps, (2) codebase-explanation tasks, (3) low-stakes maintenance (deprecation warnings, small fixes), and (4) production changes only when written to his own detailed spec — because "Code that started from your own specification is a lot less effort to review." Major architectural changes stay sequential.
- **Evidence:** demonstrated — described as his current daily operating mode with named tools and task examples.
- **Cited:** https://simonwillison.net/2025/Oct/5/parallel-coding-agents/ retrieved 2026-08-04

### Isolation via fresh /tmp checkouts and containers (not worktrees)
- **What they actually do/say:** For local parallelism he uses fresh checkouts into `/tmp` rather than git worktrees; riskier tasks go to asynchronous hosted agents (Codex Cloud) where network access is contained. He also self-prescribes: "I need to start habitually running my local agents in Docker containers."
- **Evidence:** demonstrated for /tmp checkouts and hosted-agent routing (his actual practice); recommended for the habitual-Docker part (stated as an intention).
- **Cited:** https://simonwillison.net/2025/Oct/5/parallel-coding-agents/ retrieved 2026-08-04

## Search trail
- "Simon Willison agentic loop coding agents \"in a loop\"" — surfaced the two primary posts used; both fetched successfully.
- "simonwillison.net parallel coding agents lifestyle" — confirmed the Oct 2025 post URL.
- Not pursued: his substack mirror (duplicate content) and the ResearchGate "semantic framework" PDF citing him (secondary, academic repackaging of his definition).
