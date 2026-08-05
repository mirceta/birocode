# Building a C compiler with a team of parallel Claudes (Anthropic)

**Source:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04)
**Author / credibility:** Official Anthropic engineering post, written in the first person by an Anthropic researcher who actually ran the experiment: ~2,000 Claude Code sessions over two weeks, ~$20k of tokens, producing a 100,000-line C compiler that compiles Linux 6.9 on x86/ARM/RISC-V with "a 99% pass rate on most compiler test suites including the GCC torture test suite." Fully first-hand demonstrated practice — the harness script is published in the post.

## Techniques

### Infinite while-loop harness of fresh headless sessions
- **What they actually do/say:** The whole driver is a bash loop: `while true; do COMMIT=$(git rev-parse --short=6 HEAD); LOGFILE="agent_logs/agent_${COMMIT}.log"; claude --dangerously-skip-permissions -p "$(cat AGENT_PROMPT.md)" --model claude-opus-X-Y &> "$LOGFILE"; done`. "When it finishes one task, it immediately picks up the next." Every iteration is a fresh containerized Claude Code session with no persistent in-context state.
- **Evidence:** demonstrated — the actual harness script is shown and was run ~2,000 times.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

### READMEs + progress files as re-orientation state
- **What they actually do/say:** Because each cycle starts amnesiac, agents maintain "extensive READMEs and progress files that should be updated frequently with the current status" so a fresh session can re-orient from the repo alone.
- **Evidence:** demonstrated — operating rule of the actual run.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

### Git-mediated lock files for parallel task claiming
- **What they actually do/say:** Parallel agents (one Docker container each, repo mounted at /workspace, shared bare git repo) coordinate without an orchestrator: "Claude takes a 'lock' on a task by writing a text file to current_tasks/". If two agents grab the same task, "git's synchronization forces the second agent to pick a different one." The agent removes the lock on completion. Merging: each agent "pulls from upstream, merges changes from other agents, pushes its changes"; "Merge conflicts are frequent, but Claude is smart enough to figure that out."
- **Evidence:** demonstrated — the run's actual coordination mechanism.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

### No orchestrator: agents self-select the next most obvious task
- **What they actually do/say:** "I haven't yet implemented any other method for communication between agents, nor do I enforce any process for managing high-level goals. I don't use an orchestration agent." Instead, "I leave it up to each Claude agent to decide how to act. In most cases, Claude picks up the 'next most obvious' problem."
- **Evidence:** demonstrated — deliberate design choice of the run, observed to work.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

### Near-perfect verifier as the ground truth for the whole loop
- **What they actually do/say:** "It's important that the task verifier is nearly perfect, otherwise Claude will solve the wrong problem." The bulk of the human's work was "finding high-quality compiler test suites, writing verifiers and build scripts for open-source software packages." The human role "shifted from real-time pairing... to environment architecture and test engineering."
- **Evidence:** demonstrated — the stated core lesson of the project.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

### CI regression gate to stop feature-work breaking existing behavior
- **What they actually do/say:** Observed failure mode: "Claude started to frequently break existing functionality each time it implemented a new feature." Fix: a continuous-integration pipeline with "stricter enforcement that allowed Claude to better test its work so that new commits can't break existing code."
- **Evidence:** demonstrated — failure observed, gate added, behavior improved.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

### Oracle fallback (GCC) to keep progress incremental
- **What they actually do/say:** When full Linux-kernel compilation was too monolithic to parallelize: "I wrote a new test harness that randomly compiled most of the kernel using GCC, and only the remaining files with Claude's C Compiler. If it broke, then it could further refine by re-compiling some of these files with GCC." The reference compiler lets the loop bisect blame and shrink the frontier gradually.
- **Evidence:** demonstrated — harness change made mid-project.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

### Quiet test output, log details to files
- **What they actually do/say:** "The test harness should not print thousands of useless bytes. At most, it should print a few lines of output and log all important information to a file so Claude can find it when needed" — protecting each session's context from verifier spam.
- **Evidence:** demonstrated — harness design rule from the run.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

### Deterministic-per-agent subsampled fast tests
- **What they actually do/say:** A default `--fast` test option runs "a 1% or 10% random sample. This subsample is deterministic per-agent but random across VMs, so Claude still covers all files but each agent can perfectly identify regressions" — cheap per-iteration verification without losing regression detection, compensating for the model's "time blindness."
- **Evidence:** demonstrated — implemented harness feature.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

## Techniques — negative results / limits

### Capability ceiling as the de facto stopping condition
- **What they actually do/say:** No explicit stop threshold existed; the loop ran until progress plateaued: "The resulting compiler has nearly reached the limits of Opus's abilities. I tried (hard!) to fix several of the above limitations but wasn't fully successful. New features and bugfixes frequently broke existing functionality." Unresolved: 16-bit x86 codegen, no independent assembler/linker, output "less efficient code than GCC with all optimizations disabled."
- **Evidence:** demonstrated — honestly reported end state.
- **Cited:** https://www.anthropic.com/engineering/building-c-compiler (retrieved 2026-08-04).

## Notes
- Scale numbers: "nearly 2,000 Claude Code sessions across two weeks," "2 billion input tokens and 140 million output tokens, a total cost just under $20,000," 100k-line output.
- Design philosophy quote: the human designs "the environment around Claude—the tests, the environment, the feedback—so that it could orient itself without me."
- Amusing but real failure mode of unattended loops: one agent ran `pkill -9 bash` and self-terminated the whole loop.
- This is the strongest official example of an *uncoordinated* parallel loop (contrast with the orchestrated multi-agent research system): coordination emerges from git + lock files + a near-perfect shared verifier.
