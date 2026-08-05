# Boris Cherny

**Author / credibility:** Boris Cherny is the creator and Head of Claude Code at Anthropic (previously ~5 years at Meta as a Principal Engineer; author of *Programming TypeScript*). He is about as first-hand as a source on agentic coding loops gets: he built the tool, runs it all day on the tool's own codebase, and publishes recurring "how I use it" threads on X plus long-form interviews (Latent Space, Pragmatic Engineer, Every, Lenny's). Caveats on this file's evidence: his X threads are blocked to direct fetch from this box (HTTP 402), so his own words arrive via a ThreadReader mirror and via aggregator/coverage sites — flagged per-claim below. He is also an obviously interested party (he sells the workflow his tool embodies), but the material here is concrete mechanics, not marketing claims.

**Primary sources retrieved:**
- https://threadreaderapp.com/thread/2007179832300581177.html — mirror of his 2026-01-02 X thread "how I use Claude Code" (13 tips, his own words); retrieved 2026-08-04. (Direct https://x.com/bcherny/status/2007179832300581177 returned HTTP 402 — failed access recorded below.)
- https://www.latent.space/p/claude-code — Latent Space podcast episode/transcript with Boris Cherny and Cat Wu, direct quotes; retrieved 2026-08-04.
- https://every.to/podcast/transcript-how-to-use-claude-code-like-the-people-who-built-it — Every podcast transcript (Dan Shipper with Boris Cherny + Cat Wu), direct quotes with a live demo flavor; retrieved 2026-08-04.
- https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny — Pragmatic Engineer (Gergely Orosz) interview article with direct quotes (partial page); retrieved 2026-08-04.
- https://www.developing.dev/p/boris-cherny-creator-of-claude-code — Ryan Peterman interview with direct quotes; retrieved 2026-08-04.
- https://www.threads.com/@boris_cherny/post/DImosORT-Us — Boris's own Threads post announcing "Just published our 'Claude Code: Best practices for agentic coding' guide!"; retrieved 2026-08-04.
- https://code.claude.com/docs/en/best-practices — the current best-practices guide (the original https://www.anthropic.com/engineering/claude-code-best-practices now 308-redirects here; the live page carries **no byline**, so it is cited as Anthropic-team-authored material that Boris announced/co-owns, not as his sole-authored text); retrieved 2026-08-04.
- https://paddo.dev/blog/how-boris-uses-claude-code/ — third-party writeup of the 2026-01-02 thread (used for corroboration + thread URL/date); retrieved 2026-08-04.
- https://getpushtoprod.substack.com/p/how-the-creator-of-claude-code-actually — third-party writeup of the same thread; retrieved 2026-08-04.
- https://howborisusesclaudecode.com/ — fan-maintained aggregation (by @carolinacherry) of his 2026 X-thread series with dated links to each original thread; useful index, but quotes taken from it are rated secondhand-mirror here; retrieved 2026-08-04.

**Failed accesses (recorded per README convention):**
- https://x.com/bcherny/status/2007179832300581177 — HTTP 402 Payment Required (X blocks unauthenticated fetch). Fallback: ThreadReader mirror above.
- https://www.lennysnewsletter.com/p/head-of-claude-code-what-happens — paywalled Substack; only episode metadata visible, no usable quotes. Not cited for any claim.
- https://web.archive.org/web/2025/https://www.anthropic.com/engineering/claude-code-best-practices — fetch tool refuses web.archive.org; could not confirm the original April-2025 byline, hence the conservative attribution of the best-practices guide above.
- The individual 2026 X threads indexed by howborisusesclaudecode.com (e.g. x.com/bcherny/status/2017742741636321619, .../2038454337811386436, .../2064327225504403752) were not fetched directly (same X block assumed); claims sourced only from that aggregator are rated secondhand.

## Techniques

### Verification loop as the single biggest quality lever
- **What he actually does/says:** Tip 13 of his thread, which he frames as the most important: "give Claude a way to verify its work. If Claude has that feedback loop, it will 2-3x the quality of the final result." Concretely, for his own changes to claude.ai/code he has Claude use the Claude Chrome extension to open a browser, test the UI changes, and iterate until it works. The team best-practices guide he announced formalizes the same idea: "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop... Give Claude something that produces a pass or fail, and the loop closes on its own" — and escalates it into stop-gating machinery (a `/goal` condition re-checked every turn, a Stop hook that "blocks the turn from ending until it passes" with an override after 8 consecutive blocks, and a fresh-context verification subagent "so the agent doing the work isn't the one grading it"). The guide also insists on evidence over assertion: "Have Claude show evidence rather than asserting success."
- **Evidence:** demonstrated — the browser-verification loop is his own described practice on his own product; the stop-gating variants are recommended (guide text, team-authored).
- **Cited:** https://threadreaderapp.com/thread/2007179832300581177.html (mirror of x.com/bcherny/status/2007179832300581177), retrieved 2026-08-04; https://code.claude.com/docs/en/best-practices, retrieved 2026-08-04; announcement tying him to the guide: https://www.threads.com/@boris_cherny/post/DImosORT-Us, retrieved 2026-08-04.

### Massively parallel sessions (5 local + 5–10 cloud, phone-started)
- **What he actually does/says:** He runs 5 Claude Code sessions in his terminal, numbered 1–5, each in its own checkout, with system notifications telling him when a session needs input; plus 5–10 more sessions on claude.ai/code, sometimes "teleporting" a session between local and web. He kicks off sessions from his phone each morning: "Every morning I wake up and start a few agents to begin my code for the day" (developing.dev interview). On what happens when he gets to his desk: "Sometimes I'll merge it if the code looks good. Sometimes I'll pull it locally and edit a little bit." Pragmatic Engineer reports the throughput this yields — 20–30 PRs/day — and his own framing of the skill shift: "It's not so much about deep work, it's about how good I am at context switching and jumping across multiple different contexts very quickly."
- **Evidence:** demonstrated — his own numbers and setup, described first-hand across three independent sources.
- **Cited:** https://threadreaderapp.com/thread/2007179832300581177.html, retrieved 2026-08-04; https://www.developing.dev/p/boris-cherny-creator-of-claude-code, retrieved 2026-08-04; https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny, retrieved 2026-08-04.

### Plan first, then one-shot under auto-accept
- **What he actually does/says:** Most sessions start in Plan mode (shift+tab twice); he iterates on the plan with Claude until it is solid, then switches to auto-accept mode for execution — "A good plan is really important!" (thread, via paddo.dev's writeup). In the Every transcript: "I'll shift tabs into plan mode and then align on the plan first before it even writes any code." In Pragmatic Engineer: "once there is a good plan, it will one-shot the implementation almost every time." In the Peterman interview: "First, we align on a plan. This is like shift tab in Claude Code to get into plan mode."
  **Later revision (secondhand):** the fan aggregation records him saying in 2026 that he has dropped the planning step for newer models: "I don't use that anymore. I use auto mode — instead of plan mode. The newer models don't actually need a planning step." Not confirmed in a directly-fetched primary source.
- **Evidence:** demonstrated — consistent first-hand description in four sources; the "I stopped using plan mode" revision is secondhand (aggregator mirror only).
- **Cited:** https://threadreaderapp.com/thread/2007179832300581177.html, retrieved 2026-08-04; https://every.to/podcast/transcript-how-to-use-claude-code-like-the-people-who-built-it, retrieved 2026-08-04; https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny, retrieved 2026-08-04; https://www.developing.dev/p/boris-cherny-creator-of-claude-code, retrieved 2026-08-04; revision: https://howborisusesclaudecode.com/, retrieved 2026-08-04.

### Scoped autonomy: auto-accept only for safely-verifiable loops
- **What he actually does/says:** On Latent Space he draws the line by task risk: "if Claude Code is... writing tests for me, I'll just hit shift tab enter auto accept mode and just let it run the tests and iterate on the tests until they pass. Because I know that's a pretty safe thing to do" — while bash commands warrant caution. In his thread he uses `/permissions` to pre-allow known-safe commands rather than `--dangerously-skip-permissions`. The later (secondhand, 2026) evolution is auto mode with a classifier, with his counterintuitive rationale mirrored as: "When you accept 99% of requests, your eyes glaze over. Auto mode is more safe than reading every permission prompt."
- **Evidence:** demonstrated — the test-iteration auto-accept and the allowlist habit are first-hand; the auto-mode "eyes glaze over" quote is secondhand (aggregator mirror).
- **Cited:** https://www.latent.space/p/claude-code, retrieved 2026-08-04; https://threadreaderapp.com/thread/2007179832300581177.html, retrieved 2026-08-04; https://howborisusesclaudecode.com/, retrieved 2026-08-04.

### CLAUDE.md as accumulating institutional memory
- **What he actually does/says:** Anytime he sees Claude do something incorrectly he adds it to CLAUDE.md so it doesn't recur; the team keeps a single CLAUDE.md in git, updated multiple times a week by teammates. During code review he tags @.claude on PRs to fold CLAUDE.md updates into the PR itself. In the Every transcript he describes the reflex: ask Claude to "add this to Claude MD so that the next time it just knows this automatically."
- **Evidence:** demonstrated — first-hand, recurring habit with team mechanics.
- **Cited:** https://threadreaderapp.com/thread/2007179832300581177.html, retrieved 2026-08-04; https://every.to/podcast/transcript-how-to-use-claude-code-like-the-people-who-built-it, retrieved 2026-08-04; corroboration https://paddo.dev/blog/how-boris-uses-claude-code/, retrieved 2026-08-04.

### Slash commands + subagents as canned loop segments
- **What he actually does/says:** Slash commands (in `.claude/commands/`, checked into git) for workflows he runs many times a day — `/commit-push-pr` "dozens of times daily"; in the Every demo he names `/commit`, `/PR`, `/feature dev`, `/security review`, `/code review`. He runs a stable of subagents for the most common PR workflows: code-simplifier, verify-app, build-validator, code-architect, oncall-guide. He also fans out research inside a session: "something I'll do sometimes is if I have a planning question or a research type question, I'll ask Claude to investigate a few paths in parallel" (sub-agents per path, then consolidate).
- **Evidence:** demonstrated — named commands/agents from his own setup, plus first-hand podcast description.
- **Cited:** https://threadreaderapp.com/thread/2007179832300581177.html, retrieved 2026-08-04; https://every.to/podcast/transcript-how-to-use-claude-code-like-the-people-who-built-it, retrieved 2026-08-04; https://www.latent.space/p/claude-code, retrieved 2026-08-04.

### Throw away and restart instead of correcting in place
- **What he actually does/says:** In the Every transcript: "Claude just does the thing and then I see where it messes up, and then I'll ask it to just throw it away" (escape and revert rather than patching a bad attempt). The aggregator mirrors a 2026 elaboration: rewind, don't correct — "When Claude goes down a wrong path, don't type 'that didn't work, try X instead.' That keeps the failed attempt in your context." The team guide states the rule crisply: after two failed corrections, `/clear` and rewrite the prompt — "A clean session with a better prompt almost always outperforms a long session with accumulated corrections."
- **Evidence:** demonstrated — first-hand in the Every transcript; the rewind elaboration is secondhand (aggregator); the /clear rule is recommended (team guide).
- **Cited:** https://every.to/podcast/transcript-how-to-use-claude-code-like-the-people-who-built-it, retrieved 2026-08-04; https://howborisusesclaudecode.com/, retrieved 2026-08-04; https://code.claude.com/docs/en/best-practices, retrieved 2026-08-04.

### Start small, verify behavior, then scale the automation
- **What he actually does/says:** On rolling out unattended/batch automation, from Latent Space: "start small... test it on one test. Make sure that it has reasonable behavior. Iterate on your prompt" — then scale from single instances to larger runs. The team guide's fan-out recipe matches: generate a task list, loop `claude -p` over it with `--allowedTools` scoping, and "Refine your prompt based on what goes wrong with the first 2-3 files, then run on the full set."
- **Evidence:** recommended — he advises the ramp; the fan-out loop itself is guide text, not a shown run of his.
- **Cited:** https://www.latent.space/p/claude-code, retrieved 2026-08-04; https://code.claude.com/docs/en/best-practices, retrieved 2026-08-04.

### Human review bar unchanged at ~80–90% Claude-written code
- **What he actually does/says:** On Latent Space: "I think that nets out to maybe like 80, 90% quad [Claude] written code overall," with handwritten code reserved for cases like "intricate data model refactoring" where he holds "really strong opinions"; "I have not manually written a unit test in many months" (Cat Wu: "And we have a lot of unit tests"). The review gate stays human and constant: "We have the same exact bar regardless of whether the code was written by the model or by a human" (Peterman interview). Loop-relevant reading: the stopping condition of his loops is human review at an unchanged quality bar, not model self-assessment.
- **Evidence:** demonstrated — first-hand figures and practice from two interviews.
- **Cited:** https://www.latent.space/p/claude-code, retrieved 2026-08-04; https://www.developing.dev/p/boris-cherny-creator-of-claude-code, retrieved 2026-08-04.

### Queueing recurring/long-running work (/loop, /schedule, /goal) — secondhand only
- **What he actually does/says:** The fan aggregation (indexing his March 2026 X threads, which could not be fetched directly) mirrors: `/loop` schedules a recurring local prompt "for up to 3 days at a time"; `/schedule` creates recurring cloud jobs that "work even when your laptop is closed"; `/goal` makes Claude keep working "until the condition is true; every time it tries to stop, the model checks the condition against the transcript." The `/goal` and Stop-hook stop-gating also appears first-hand in the team guide (see verification technique above).
- **Evidence:** secondhand — sourced from an aggregator mirror of unfetchable X threads; only the `/goal`/Stop-hook portion is independently backed by the (recommended-grade) team guide.
- **Cited:** https://howborisusesclaudecode.com/, retrieved 2026-08-04; https://code.claude.com/docs/en/best-practices, retrieved 2026-08-04.

### Model choice: strongest model, thinking on, for everything
- **What he actually does/says:** "Opus 4.5 with thinking for everything. It's the best coding model I've ever used" — chosen despite cost/speed because it needs less steering and is better at tool use, which matters when you supervise 10+ concurrent loops.
- **Evidence:** demonstrated — his stated daily default.
- **Cited:** https://threadreaderapp.com/thread/2007179832300581177.html, retrieved 2026-08-04; corroboration https://paddo.dev/blog/how-boris-uses-claude-code/, retrieved 2026-08-04.

## Search trail
Queries run on 2026-08-04 (WebSearch):
- `Boris Cherny Claude Code workflow how I use` — hit: paddo.dev, getpushtoprod, howborisusesclaudecode.com, several rewrite blogs (mindwiredai, digitalstrategy-ai — skipped as derivative).
- `Boris Cherny Latent Space interview Claude Code` — hit: latent.space/p/claude-code, Pragmatic Engineer, Lenny's (paywalled), developing.dev, every.to transcript.
- `latent.space Boris Cherny Claude Code podcast transcript` — confirmed latent.space episode URL; surfaced vlad.build/cc-pod (not used — latent.space primary sufficed) and every.to transcript.
- `"claude code best practices" anthropic engineering "Boris Cherny" author wrote` — surfaced his own Threads announcement post (fetched) but no fetchable page confirming a personal byline on the original April-2025 guide; attribution kept conservative.

Fetches attempted and failed: x.com/bcherny/status/2007179832300581177 (HTTP 402), lennysnewsletter.com episode (paywall), web.archive.org (tool-blocked). Not pursued: YouTube year-in-review interview (2026-06-08, indexed by howborisusesclaudecode.com) — video, no fetchable transcript found this pass; a later refresh could try a transcript search for it. Overall: substantive first-hand material was plentiful; nothing here is padded from memory.
