# Effective harnesses for long-running agents (Anthropic)

**Source:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04)
**Author / credibility:** Official Anthropic engineering post describing a harness Anthropic itself built and ran: chaining discrete Claude sessions into a multi-session loop that builds a full application (an example web app with 200+ features). First-hand demonstrated engineering, including the actual prompts' onboarding sequence, the artifact file names, a JSON feature schema, and observed failure modes with the fixes that addressed them. The strongest evidence class in this dossier for cross-session loop design.

## Techniques

### Two-agent split: initializer agent + coding agent
- **What they actually do/say:** "An initializer agent that sets up the environment on the first run, and a coding agent that is tasked with making incremental progress in every session, while leaving clear artifacts for the next session." The initializer runs once to scaffold (git repo, feature list, progress file, init.sh); the coding agent runs every subsequent session.
- **Evidence:** demonstrated — the harness was built and run; artifacts and session logs are shown.
- **Cited:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04).

### Progress file + git history as cross-session state
- **What they actually do/say:** A `claude-progress.txt` log of what agents have done, maintained across sessions. "The key insight here was finding a way for agents to quickly understand the state of work when starting with a fresh context window, which is accomplished with the claude-progress.txt file alongside the git history."
- **Evidence:** demonstrated — named artifact from their running harness.
- **Cited:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04).

### Exhaustive machine-checkable feature list with pass booleans
- **What they actually do/say:** The initializer writes a JSON manifest of 200+ granular features, each like `{"category": "functional", "description": "New chat button creates a fresh conversation", "passes": false}`. Coding agents pick from it and flip `passes` only after verification. Guard instruction: "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality." This is the fix for the "premature victory declaration" failure mode — done-ness is the manifest, not the model's opinion.
- **Evidence:** demonstrated — schema shown verbatim; deployed against an observed failure mode.
- **Cited:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04).

### Fixed session-onboarding protocol
- **What they actually do/say:** Every coding session starts the same way: "Run `pwd` to see the directory you're working in"; "Read the git logs and progress files to get up to speed"; "Read the features list file and choose the highest-priority feature that's not yet done." A session-log excerpt shows the actual sequence: pwd, file reads, git log inspection, server startup, functionality testing before feature work.
- **Evidence:** demonstrated — prompt sequence and example session log shown.
- **Cited:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04).

### One feature per session (incremental progress)
- **What they actually do/say:** Agents work on "only one feature at a time" rather than attempting the whole app in one session — sizing each loop iteration to what fits in one context window and one verifiable increment.
- **Evidence:** demonstrated — harness rule from their run.
- **Cited:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04).

### Verify at both loop edges: baseline test on entry, commit + progress update on exit
- **What they actually do/say:** "Start the session by reading the progress notes file and git commit logs, and run a basic test on the development server to catch any undocumented bugs. End the session by writing a git commit and progress update." Entry-check catches the previous session's undocumented breakage; exit ritual leaves clean committable state.
- **Evidence:** demonstrated.
- **Cited:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04).

### End-to-end self-verification via browser automation
- **What they actually do/say:** Agents use Puppeteer MCP "to conduct end-to-end testing as a human user would, not just unit tests or CLI commands," and may mark a feature `passes: true` only after such testing — the fix for "features marked complete without testing."
- **Evidence:** demonstrated — part of the running harness.
- **Cited:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04).

### init.sh environment-restart script
- **What they actually do/say:** The initializer writes an `init.sh` script to restart development servers; coding agents "read init.sh and run the development server first" — the fix for agents wasting turns re-deriving how to start the app each fresh session.
- **Evidence:** demonstrated.
- **Cited:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (retrieved 2026-08-04).

## Notes
- Motivating problem statement: long-running agents "must work in discrete sessions, and each new session begins with no memory of what came before" — the whole harness is a protocol for state handoff between amnesiac loop iterations.
- Failure modes observed without the harness (each paired with its fix above): premature victory declaration; buggy undocumented progress; features marked complete without testing; agent confusion on app startup. The post claims Claude Opus 4.5 exhibits these failures un-harnessed and improves with the framework, but publishes no quantitative metrics.
- Open question they state: "whether a single, general-purpose coding agent performs best across contexts, or if better performance can be achieved through a multi-agent architecture" (testing/QA/cleanup specialists).
