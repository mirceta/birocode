# Best practices for Claude Code (Anthropic / Claude Code docs)

**Source:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04)
**Access note:** The classic engineering-blog URL https://www.anthropic.com/engineering/claude-code-best-practices now returns **308 Permanent Redirect** to https://code.claude.com/docs/en/best-practices (redirect observed 2026-08-04). The content below is the current living-docs successor of the original "Claude Code: Best practices for agentic coding" post, retrieved in full from the redirect target; the original blog snapshot is no longer served at the old URL.
**Author / credibility:** First-party Anthropic documentation for Claude Code, maintained by the team that builds the product. The doc states its patterns "have proven effective across Anthropic's internal teams and for engineers using Claude Code across various codebases, languages, and environments" — i.e. distilled first-hand internal practice, published as guidance (individual internal runs are not shown).

## Techniques

### Give Claude a check it can run — close the loop on verification
- **What they actually do/say:** "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop... Give Claude something that produces a pass or fail, and the loop closes on its own. Claude does the work, runs the check, reads the result, and iterates until the check passes." The check is "anything that returns a signal Claude can read in the conversation: a test suite, a build exit code, a linter, a script that diffs output against a fixture, or a browser screenshot compared against a design." Example prompt shape: "write a validateEmail function. example test cases: ... run the tests after implementing."
- **Evidence:** recommended — the doc's central principle with concrete before/after prompt pairs, but no internal run shown.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Give Claude a way to verify its work".

### Escalating verification gates: prompt → /goal → Stop hook → second opinion
- **What they actually do/say:** Four levels of how hard the check "gates the stop": (1) in-prompt "run the check and iterate in the same message"; (2) "set the check as a /goal condition. A separate evaluator re-checks it after every turn and Claude keeps working until it holds"; (3) "a Stop hook runs your check as a script and blocks the turn from ending until it passes. Claude Code overrides the hook and ends the turn after 8 consecutive blocks"; (4) "a verification subagent... has a fresh model try to refute the result, so the agent doing the work isn't the one grading it." "Each step trades setup for attention... The /goal and Stop hook versions are what let an unattended run finish correctly without you."
- **Evidence:** recommended — described product mechanisms with specifics (the 8-block override is a hard product fact), no run transcript.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Give Claude a way to verify its work".

### Demand evidence, not assertions of success
- **What they actually do/say:** "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching."
- **Evidence:** recommended.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Give Claude a way to verify its work".

### Explore → plan → implement → commit (plan mode)
- **What they actually do/say:** Four-phase workflow: explore in plan mode ("Claude reads files and answers questions without making changes"), ask for a detailed plan (editable via Ctrl+G before proceeding), then implement "verifying against its plan", then commit + PR. Counterweight: "Plan mode is useful, but also adds overhead... If you could describe the diff in one sentence, skip the plan."
- **Evidence:** recommended — a recommended workflow with example prompts per phase.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Explore first, then plan, then code".

### Iterate against a visual target (screenshot loop)
- **What they actually do/say:** "[paste screenshot] implement this design. take a screenshot of the result and compare it to the original. list differences and fix them" — an explicit self-comparison loop for UI work, listed under verification strategies.
- **Evidence:** recommended — prompt shown, not an internal run.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Give Claude a way to verify its work" table.

### Context window as the binding constraint; /clear aggressively
- **What they actually do/say:** "Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills." Remedies: "Use /clear frequently between tasks"; auto-compaction "preserves important code and decisions"; `/compact <instructions>` for directed compaction; partial compaction via rewind checkpoints ("Summarize from here" / "Summarize up to here"); CLAUDE.md compaction instructions like "When compacting, always preserve the full list of modified files and any test commands"; `/btw` for side questions that never enter history.
- **Evidence:** recommended — product mechanics described in detail.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), intro + "Manage context aggressively".

### Two-strikes reset rule for failed corrections
- **What they actually do/say:** "If you've corrected Claude more than twice on the same issue in one session, the context is cluttered with failed approaches. Run /clear and start fresh with a more specific prompt that incorporates what you learned. A clean session with a better prompt almost always outperforms a long session with accumulated corrections." Also `Esc` to interrupt mid-action, `Esc Esc`//`/rewind` to restore prior conversation+code state.
- **Evidence:** recommended — an explicit loop-reset heuristic.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Course-correct early and often" + "Avoid common failure patterns".

### Subagents for investigation and for verification
- **What they actually do/say:** "Subagents run in separate context windows and report back summaries" — delegate research ("use subagents to investigate X") so exploration doesn't consume the main context, and use them post-implementation: "use a subagent to review this code for edge cases."
- **Evidence:** recommended — prompts given, mechanism is a product feature.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Use subagents for investigation".

### Adversarial review in a fresh context before calling work done
- **What they actually do/say:** "The longer Claude works unattended, the more an independent check matters before you count the work as done. A reviewer running in a fresh subagent context sees only the diff and the criteria you give it, not the reasoning that produced the change." Example prompt: "Use a subagent to review the rate limiter diff against PLAN.md. Check that every requirement is implemented... Report gaps, not style preferences." Caveat: "A reviewer prompted to find gaps will usually report some, even when the work is sound... Chasing every finding leads to over-engineering" — tell the reviewer to flag only correctness-affecting gaps.
- **Evidence:** recommended — prompt and caveat given; no internal run shown.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Add an adversarial review step".

### Writer/Reviewer and test-writer/implementer multi-Claude patterns
- **What they actually do/say:** "A fresh context improves code review since Claude won't be biased toward code it just wrote." Writer/Reviewer table: Session A implements; Session B reviews ("Look for edge cases, race conditions, and consistency with our existing middleware patterns"); A addresses the pasted feedback. "You can do something similar with tests: have one Claude write tests, then another write code to pass them." Parallel-session substrates: git worktrees, desktop app sessions, Claude Code on the web (isolated VMs), and agent teams ("automated coordination of multiple sessions with shared tasks, messaging, and a team lead").
- **Evidence:** recommended — worked example prompts, no run.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Run multiple Claude sessions".

### Headless mode (`claude -p`) for CI and pipelines
- **What they actually do/say:** "`claude -p 'your prompt'`... is how you integrate Claude into CI pipelines, pre-commit hooks, or any automated workflow." Output formats: plain text, `--output-format json` (single object with `result` field), `stream-json` (one JSON object per line). Pipe composition: "claude -p '<your prompt>' --output-format json | your_command".
- **Evidence:** recommended — commands shown, no CI deployment shown.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Run non-interactive mode".

### Fan-out loop over a generated task list
- **What they actually do/say:** Three steps for large migrations: (1) "Have Claude write the list of files that need migrating to a file" ("list all 2,000 Python files that need migrating and save the list to files.txt"); (2) a shell loop: `for file in $(cat files.txt); do claude -p "Migrate $file from React to Vue. Return OK or FAIL." --allowedTools "Edit,Bash(git commit *)"; done`; (3) "Test on a few files, then run at scale. Refine your prompt based on what goes wrong with the first 2-3 files." "`--allowedTools`... matters when you're running unattended."
- **Evidence:** recommended — full script shown as a recipe.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Fan out across files".

### Auto mode: classifier-gated autonomy
- **What they actually do/say:** "A classifier model reviews commands before they run, blocking scope escalation, unknown infrastructure, and hostile-content-driven actions while letting routine work proceed without prompts." `claude --permission-mode auto -p "fix all lint errors"`. For headless runs, "auto mode aborts if the classifier repeatedly blocks actions, since there is no user to fall back to." Alternatives: permission allowlists and OS-level sandboxing.
- **Evidence:** recommended — product mechanism described.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Configure permissions" + "Run autonomously with auto mode".

### Hooks for deterministic must-happen actions
- **What they actually do/say:** "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens." E.g. "Write a hook that runs eslint after every file edit" or "a hook that blocks writes to the migrations folder." (The Stop hook variant gates loop termination — see the verification-gates technique.)
- **Evidence:** recommended.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Set up hooks".

### Lean CLAUDE.md, pruned like code
- **What they actually do/say:** "For each line, ask: 'Would removing this cause Claude to make mistakes?' If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" Include commands Claude can't guess, non-default style rules, repo etiquette, gotchas; exclude anything inferable from code. "Treat CLAUDE.md like code: review it when things go wrong, prune it regularly, and test changes by observing whether Claude's behavior actually shifts." Emphasis markers ("IMPORTANT", "YOU MUST") improve adherence.
- **Evidence:** recommended — loop-relevant because CLAUDE.md is the persistent per-iteration context every session reloads.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Write an effective CLAUDE.md".

### Spec-by-interview, then execute in a fresh session
- **What they actually do/say:** "I want to build [brief description]. Interview me in detail using the AskUserQuestion tool... Keep interviewing until we've covered everything, then write a complete spec to SPEC.md." Then: "Once the spec is complete, start a fresh session to execute it." Good specs "name the files and interfaces involved, state what is out of scope, and end with an end-to-end verification step that proves the feature works."
- **Evidence:** recommended — prompt template given.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Let Claude interview you".

### Checkpoints as cheap risk-taking (rewind instead of pre-planning)
- **What they actually do/say:** "Every prompt you send creates a checkpoint... Instead of carefully planning every move, you can tell Claude to try something risky. If it doesn't work, rewind and try a different approach." Warning: "Checkpoints only track changes made through Claude's file editing tools... This isn't a replacement for git."
- **Evidence:** recommended — product mechanism.
- **Cited:** https://code.claude.com/docs/en/best-practices (retrieved 2026-08-04), "Rewind with checkpoints".

## Notes
- Named failure patterns (all loop-relevant): "kitchen sink session" (mixed-task context — fix: /clear), "correcting over and over" (fix: two-strikes reset), "over-specified CLAUDE.md" (rules lost in noise), "trust-then-verify gap" ("If you can't verify it, don't ship it"), "infinite exploration" (unscoped investigation fills context — fix: scope or subagents).
- The doc's framing sentence for the whole verification section: the check "is the difference between a session you watch and one you walk away from" — i.e. unattended-loop capability is earned by installing machine-checkable stop gates.
- Skills (`.claude/skills/SKILL.md`) are positioned as reusable multi-step workflows (e.g. a `/fix-issue` skill enumerating view-issue → implement → test → lint → PR steps) — canned loop bodies invoked on demand.
- Closing caveat: "The patterns in this guide aren't set in stone... Sometimes you should let context accumulate because you're deep in one complex problem and the history is valuable."
