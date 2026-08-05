# Peter Steinberger

**Author / credibility:** Peter Steinberger (@steipete), Vienna — founder of PSPDFKit (exited; company now "Nutrient"), full-time agentic-engineering practitioner since 2025 and one of the most-read bloggers on the subject (his "Just Talk To It" post was picked up by Simon Willison, https://simonwillison.net/2025/Oct/14/agentic-engineering/, retrieved 2026-08-04). He is the creator of OpenClaw, the viral open-source personal-agent framework, and announced on 2026-02-14 that he is joining OpenAI "to work on bringing agents to everyone" (https://steipete.me/posts/2026/openclaw, retrieved 2026-08-04). Material is overwhelmingly **first-hand practice**: he describes his own daily workflow on a ~300k-LOC production codebase, publishes the tools he builds for it (VibeTunnel, Peekaboo, Poltergeist, CodeLooper, OpenClaw), and shows concrete commands, configs, and numbers. Very high credibility for "how loops are actually run"; his posts are opinionated but grounded in shown practice, not commentary.

**Primary sources retrieved:**
- https://steipete.me/posts/just-talk-to-it — retrieved 2026-08-04
- https://steipete.me/posts/ (full post index) — retrieved 2026-08-04
- https://steipete.me/posts/2025/optimal-ai-development-workflow — retrieved 2026-08-04
- https://steipete.me/posts/2025/shipping-at-inference-speed — retrieved 2026-08-04
- https://steipete.me/posts/2025/claude-code-is-my-computer — retrieved 2026-08-04
- https://steipete.me/posts/2025/commanding-your-claude-code-army — retrieved 2026-08-04
- https://steipete.me/posts/command-your-claude-code-army-reloaded — retrieved 2026-08-04
- https://steipete.me/posts/2025/vibetunnel-turn-any-browser-into-your-mac-terminal — retrieved 2026-08-04
- https://steipete.me/posts/2025/poltergeist-ghost-keeps-builds-fresh — retrieved 2026-08-04
- https://steipete.me/posts/2025/the-future-of-vibe-coding — retrieved 2026-08-04
- https://steipete.me/posts/2026/openclaw — retrieved 2026-08-04
- https://docs.openclaw.ai/gateway/heartbeat (docs of his own project) — retrieved 2026-08-04

## Techniques

### "Just talk to it" — conversational iteration instead of spec files
- **What he actually does/says:** By Oct 2025 he had abandoned the spec-driven style he used through June. Prompts are "1-2 sentences + an image"; for bigger features "I start a discussion with codex, I paste in some websites, some ideas, ask it to read code, and we flesh out a new feature together." He "rarely uses big plan files," and for UI work deliberately under-specifies: he "often start[s] with sth simple and woefully under-spec my requests, and watch the model build and see the browser update in real time." Earlier (Aug 2025, Claude Code era) he still planned more: "Using plan mode and iterating is key. Smaller tasks I do right away, bigger I write in a file and let GPT-5 review."
- **Evidence:** demonstrated — he walks through his own daily process with concrete prompt sizes and examples.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/optimal-ai-development-workflow retrieved 2026-08-04

### Many agents in parallel, mostly in the same folder
- **What he actually does/says:** Runs "3-8 in parallel in a 3x3 terminal grid, most of them in the same folder" (codex era); with Claude Code it was "generally running one or two agents, increasing to roughly four for cleanup, tests or interface work" — "All depends on the blast radius of the work." He tried worktrees and PR-based isolation and reverted because same-folder "gets stuff done the fastest." Hardware supports it: an ultra-wide monitor with "4 Claude instances + Chrome all visible without moving windows."
- **Evidence:** demonstrated — exact counts, grid layout, and the abandoned worktree experiment are described from his own setup.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/optimal-ai-development-workflow retrieved 2026-08-04

### Blast-radius sizing as the loop-scoping heuristic
- **What he actually does/says:** He sizes tasks by "blast radius" — how many files a change touches and how long it runs. He avoids massive refactors in a single run, preferring multiple smaller atomic commits, and when unsure of impact asks the model to "give me a few options before making changes" before letting it execute.
- **Evidence:** demonstrated — stated as his operating rule with the concrete pre-flight prompt he uses.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04

### Active steering + fearless mid-run interruption (not background autonomy)
- **What he actually does/says:** He watches agents and interrupts freely: "Don't be afraid of stopping models mid-way, file changes are atomic and they are really good at picking up where they stopped." He explicitly prefers foreground steering over background runs: "I steer the models a lot as I notice them drifting off - that's much harder if they run in the background."
- **Evidence:** demonstrated — first-hand habit with the reasoning shown.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/optimal-ai-development-workflow retrieved 2026-08-04

### Message queueing to keep a long run going unattended
- **What he actually does/says:** Uses codex's message-queuing to pipeline work: "Queue up continue messages if you wanna go away and just see it done" (for long refactors that stop mid-work). In Dec 2025 he describes using "the queueing feature of codex" to pipeline ideas across 3-8 simultaneous projects while satellite projects "chug along" with minimal oversight.
- **Evidence:** demonstrated — his own long-refactor and multi-project practice.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/shipping-at-inference-speed retrieved 2026-08-04

### Verification by behavior, not code review — "watch the stream"
- **What he actually does/says:** "These days I don't read much code anymore. I watch the stream and sometimes look at key parts"; he verifies through observable behavior (agents run CLIs, browser updates in real time) while keeping the architecture in his head. Correction loop instead of reverts: "If something isn't how I like it, I ask the model to change it."
- **Evidence:** demonstrated — described as his current practice on his production app.
- **Cited:** https://steipete.me/posts/2025/shipping-at-inference-speed retrieved 2026-08-04

### Tests written in the same context, immediately after the feature
- **What he actually does/says:** He asks agents to "write tests after each feature/fix is done" in the same session: "Automated ones usually aren't great, but the model almost always finds issues when you ask it to write tests IN THE SAME CONTEXT. Context is precious, don't waste it."
- **Evidence:** demonstrated — quoted rule from his own workflow, with the observed effect.
- **Cited:** https://steipete.me/posts/2025/optimal-ai-development-workflow retrieved 2026-08-04; https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04

### Deterministic quality gates around the loop (hooks, linters, structure tools)
- **What he actually does/says:** Non-LLM ground truth enforced mechanically: `jscpd` for duplication, `knip` for dead code, eslint plugins, and `ast-grep` rules run as git hooks. Agents make "atomic commits" themselves under custom instructions; he keeps custom slash commands `/commit`, `/automerge`, `/massageprs`, `/review`. He commits straight to main: "I simply commit to main," relying on linear git history rather than branch process.
- **Evidence:** demonstrated — named tools, hook placement, and slash commands from his repo setup.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/shipping-at-inference-speed retrieved 2026-08-04

### CLIs over MCPs; one MCP only to "close the loop" via the browser
- **What he actually does/says:** He calls MCPs "context poison" and prefers plain CLIs, keeping only `chrome-devtools-mcp` to "close the loop" (agent sees the running UI). Earlier he removed MCPs because "Claude sometimes would go off spinning up Playwright unasked when it could simply read the code - which is faster and pollutes the context less." He rebuilt his own Peekaboo tool from MCP-only to CLI-first for the same reason.
- **Evidence:** demonstrated — his own before/after tooling decisions with reasons.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/optimal-ai-development-workflow retrieved 2026-08-04

### Screenshot-first prompting and visual self-verification
- **What he actually does/says:** "Approximately 50% of his prompts contain screenshots, often without annotation" (just-talk-to-it). Earlier: "Screenshots are Your Best Friend... a picture (or a screenshot of a crash log/weird UI) is worth a thousand words to these multimodal AIs," and his Peekaboo tool lets the agent take macOS screenshots to self-check ("Is this settings screen blank? Does the button look enabled?").
- **Evidence:** demonstrated — quantified from his own prompt stream; Peekaboo is his own shipped tool.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/the-future-of-vibe-coding retrieved 2026-08-04

### Second-model review as the escalation/verification step
- **What he actually does/says:** Bigger plans get cross-checked by a different model: "bigger I write in a file and let GPT-5 review" (Aug 2025). In his vibe-coding workshop he does spec "peer review": "copy that entire generated spec and paste it into a brand new, separate Gemini chat," feed the gaps back, repeat. When an agent is stuck, he uses "Oracle (a GPT Pro wrapper) to research problems before resuming."
- **Evidence:** demonstrated — shown as concrete steps in his own sessions.
- **Cited:** https://steipete.me/posts/2025/optimal-ai-development-workflow retrieved 2026-08-04; https://steipete.me/posts/2025/the-future-of-vibe-coding retrieved 2026-08-04; https://steipete.me/posts/2025/shipping-at-inference-speed retrieved 2026-08-04

### Full permissions + backup safety net instead of per-step approval
- **What he actually does/says:** Runs Claude Code with `--dangerously-skip-permissions` on bare macOS (flag intended for containers), acknowledging "a rogue prompt could theoretically nuke my system"; mitigation is hourly Arq snapshots and SuperDuper! clones — "zero incidents" after two months. Uses a `cc` shell alias so every session starts permission-free. This is what makes unattended iteration possible at all in his setup.
- **Evidence:** demonstrated — exact flag, alias, backup regime, and incident count.
- **Cited:** https://steipete.me/posts/2025/claude-code-is-my-computer retrieved 2026-08-04

### Terminal-title bookkeeping for the "agent army"
- **What he actually does/says:** With 3-6 concurrent sessions ("six tabs all saying 'claude'"), he first used a ZSH wrapper that sets the title to folder + context and a background process that "continuously reset[s] the title (prevents Claude from changing it)" every half-second. V2 moved this into VibeTunnel: agents self-report via `vt title` "whenever you start a new task, change focus, or make significant progress" (e.g. "Debugging CI failures - playwright tests"), instructed through `~/.claude/CLAUDE.md`.
- **Evidence:** demonstrated — both iterations shipped with scripts/config shown.
- **Cited:** https://steipete.me/posts/2025/commanding-your-claude-code-army retrieved 2026-08-04; https://steipete.me/posts/command-your-claude-code-army-reloaded retrieved 2026-08-04

### Remote monitoring of long-running sessions from the phone (VibeTunnel)
- **What he actually does/says:** Built VibeTunnel (browser-based terminal for his Mac) because "we all wanted to check on our AI agents and see how far they'd gotten with their tasks" — "imagine being at lunch and checking if your agent finished that refactoring task, then immediately giving it the next assignment." No SSH setup; works from any browser/phone.
- **Evidence:** demonstrated — he built and open-sourced the tool for his own agent supervision.
- **Cited:** https://steipete.me/posts/2025/vibetunnel-turn-any-browser-into-your-mac-terminal retrieved 2026-08-04

### Auto-rebuild watcher so the loop never tests stale binaries (Poltergeist)
- **What he actually does/says:** "In agentic engineering, loop iteration speed is everything." He built Poltergeist, "an AI-friendly universal file-watcher that auto-detects any project and rebuilds them as soon as a file has been changed," because "agents would sometimes forget to rebuild before testing, leading to debugging sessions on code that was already fixed." It "detects if a human or agent calls it and adds helpful messages for agents to steer them to correct usage." Related: he tells agents to run background processes (dev servers, tests) "via tmux" rather than special agent config.
- **Evidence:** demonstrated — his own shipped tool, motivated by a failure mode he hit.
- **Cited:** https://steipete.me/posts/2025/poltergeist-ghost-keeps-builds-fresh retrieved 2026-08-04; https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04

### Stall detection + auto-continue for unattended generation loops (CodeLooper)
- **What he actually does/says:** His side project CodeLooper uses "screen capture, accessibility APIs, and even JavaScript injection... to detect when a generation loop has paused and... automatically click 'Continue'" so sessions keep running unattended.
- **Evidence:** demonstrated — his own tool, described in his workshop write-up (early/cruder era of his stack).
- **Cited:** https://steipete.me/posts/2025/the-future-of-vibe-coding retrieved 2026-08-04

### Heartbeat + sentinel-reply loop for an always-on personal agent (OpenClaw)
- **What he actually does/says:** OpenClaw (his open-source personal agent; inbox/messaging automation, moved to a foundation when he joined OpenAI) drives long-lived autonomy with a **heartbeat**: a periodic agent turn (default `30m`) whose prompt ends "If nothing needs attention, reply HEARTBEAT_OK." Actionable items call `heartbeat_respond` with `notify: true/false`; a bare `HEARTBEAT_OK` is stripped/suppressed so idle polls stay silent. Heartbeats defer "while any reply or embedded run for the same agent is active" (never interrupt in-flight work); precise recurring schedules belong to a separate cron-like automations system, and heartbeat scratch is "prompt context only, not a scheduler." Multiple checks batch into one turn.
- **Evidence:** demonstrated — mechanics from his own project's documentation; the openclaw blog post itself confirms provenance but contains no mechanics.
- **Cited:** https://docs.openclaw.ai/gateway/heartbeat retrieved 2026-08-04; https://steipete.me/posts/2026/openclaw retrieved 2026-08-04

### Context hygiene: fat AGENTS.md, session-ID statusline, no formal backlog
- **What he actually does/says:** Maintains an ~800-line `Agents.md` (symlinked to `claude.md`) holding product context, naming conventions, React patterns, testing guidance, and ast-grep rules; by Dec 2025 a global `AGENTS.MD` with cross-project references agents consult on their own. Keeps "the initial topic in the statusline + session ID" so sessions survive account switches. Stopping criteria are informal: "Important ideas I try right away, and everything else I'll either remember or it wasn't important" — tasks end when the iterated result feels right, not when a spec is met.
- **Evidence:** demonstrated — file sizes, symlink, statusline practice all from his own setup.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/optimal-ai-development-workflow retrieved 2026-08-04; https://steipete.me/posts/2025/shipping-at-inference-speed retrieved 2026-08-04

### Voice dictation as the prompt input channel
- **What he actually does/says:** Speaks prompts rather than typing — "Wispr Flow with semantic correction" ("still king"); in earlier workshops voice-dictated raw specs because "I'm lazy with typing," then had the model structure them. Pairs with under-specified conversational prompting: "it's amazing how much sense agents can make out of my incoherent thoughts."
- **Evidence:** demonstrated — named tool, used daily.
- **Cited:** https://steipete.me/posts/just-talk-to-it retrieved 2026-08-04; https://steipete.me/posts/2025/the-future-of-vibe-coding retrieved 2026-08-04; https://steipete.me/posts/2025/optimal-ai-development-workflow retrieved 2026-08-04

## Search trail

- `steipete.me Claude Code agentic coding blog` — mostly missed; returned generic Claude Code guides plus github.com/steipete/claude-code-mcp, no direct steipete.me post links.
- `Peter Steinberger agents blog "just talk to it" Claude Code workflow` — hit: steipete.me/posts/just-talk-to-it, simonwillison.net coverage, Lex Fridman #491 transcript (lexfridman.com/peter-steinberger-transcript/ — found but not fetched; blog + docs already gave first-hand loop mechanics).
- Fetched https://steipete.me/posts/ index directly — the productive move; enumerated all 2025-2026 posts, from which the loop-relevant ones were selected (deliberately skipped non-loop posts: Vibe Meter cost tracking, llm.codes, stats.store, Demark, essential-reading link roundups, startup-slop, finding-my-spark-again, signature-flicker).
- `steipete OpenClaw Clawdbot personal agent heartbeat cron todo automation blog post` — hit docs.openclaw.ai/gateway/heartbeat (primary, fetched) plus third-party guides (Taskade history, Adapt, Context Studios, Kryll — not used as sources; secondhand).
- Dead end within a source: https://steipete.me/posts/2026/openclaw contains no heartbeat/inbox mechanics (it is the OpenAI announcement); mechanics recovered from docs.openclaw.ai instead.
- No fetch failures: all 12 attempted URLs loaded on first try.
- Not covered (known gaps for a later refresh): Lex Fridman #491 transcript (long-form first-hand interview on OpenClaw), steipete.me/posts/2025/self-hosting-ai-models, the two claude-code-army posts' full script listings, and any Twitter/X threads (not swept — search surfaced none directly).
