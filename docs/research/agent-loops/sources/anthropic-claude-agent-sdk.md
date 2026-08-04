# Building agents with the Claude Agent SDK (Anthropic)

**Source:** https://claude.com/blog/building-agents-with-the-claude-agent-sdk (retrieved 2026-08-04)
**Access note:** The engineering-blog URL https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk returns **308 Permanent Redirect** to https://claude.com/blog/building-agents-with-the-claude-agent-sdk (redirect observed 2026-08-04); content retrieved from the redirect target.
**Author / credibility:** Official Anthropic post announcing the Claude Agent SDK (renamed from the Claude Code SDK) — the same infrastructure that powers Claude Code, generalized. First-party guidance from the team's own deployments; the loop taxonomy is stated as the SDK's design basis, with a worked email-agent example rather than published run data.

## Techniques

### The canonical agent loop: gather context → take action → verify work → repeat
- **What they actually do/say:** The SDK's whole design is organized around this loop: "gather context -> take action -> verify work -> repeat." The feedback cycle "enables agents to evaluate and improve their own output iteratively before completion." This is Anthropic's most explicit official statement of the loop shape itself.
- **Evidence:** recommended — the framing the SDK is built on; the SDK itself (compaction, subagents, tools) is shipped software embodying it.
- **Cited:** https://claude.com/blog/building-agents-with-the-claude-agent-sdk (retrieved 2026-08-04).

### Agentic search over the filesystem as context gathering
- **What they actually do/say:** Agents use bash commands (`grep`, `tail`) to selectively load information; "folder structure functions as a form of context engineering" — the agent decides what to retrieve rather than having everything pushed into context. Semantic (embedding) search is positioned as a later optimization: faster but "less accurate, more difficult to maintain, and less transparent"; recommendation is to start with agentic search.
- **Evidence:** recommended — design guidance mirroring Claude Code's shipped behavior.
- **Cited:** https://claude.com/blog/building-agents-with-the-claude-agent-sdk (retrieved 2026-08-04).

### Subagents for parallel, isolated context
- **What they actually do/say:** Subagents "maintain isolated context windows, returning only relevant excerpts to the orchestrator"; ideal for "sifting through large datasets where most content is irrelevant" and for parallelizing simultaneous tasks.
- **Evidence:** recommended — SDK feature description (demonstrated at production scale in the multi-agent research system post).
- **Cited:** https://claude.com/blog/building-agents-with-the-claude-agent-sdk (retrieved 2026-08-04).

### Compaction for extended runs
- **What they actually do/say:** The SDK "automatically summarizes previous messages when approaching context limits," preventing agents "from running out of context during extended runs."
- **Evidence:** demonstrated — shipped SDK/Claude Code mechanism.
- **Cited:** https://claude.com/blog/building-agents-with-the-claude-agent-sdk (retrieved 2026-08-04).

### Action hierarchy: tools, bash/scripts, code generation, MCP
- **What they actually do/say:** Tools "should reflect the agent's most frequent intended actions" and are "heavily weighted in Claude's context window"; bash/scripts for general-purpose flexible execution; code generation is "precise, composable, and infinitely reusable" — preferred for complex, repeatable operations (Excel/PowerPoint/Word); MCP for standardized external integrations with auth handled.
- **Evidence:** recommended — design taxonomy with examples.
- **Cited:** https://claude.com/blog/building-agents-with-the-claude-agent-sdk (retrieved 2026-08-04).

### Three-tier verification: rules-based, visual, LLM-as-judge
- **What they actually do/say:** (1) Rules-based feedback: "provide clearly defined output rules; report which rules failed and why" — "code linting exemplifies effective feedback" (TypeScript gives more verification layers than JavaScript). (2) Visual feedback: screenshots/renders for UI or email output, checking "layout, styling, content hierarchy, responsiveness"; "MCP servers like Playwright automate visual feedback loops." (3) LLM-as-judge for fuzzy rules — but explicitly downgraded: "generally not very robust" with heavy latency tradeoffs, "useful only when marginal performance gains justify added cost."
- **Evidence:** recommended — a ranked verification menu; the email-agent example applies all three (rules validation of addresses, visual check of HTML drafts).
- **Cited:** https://claude.com/blog/building-agents-with-the-claude-agent-sdk (retrieved 2026-08-04).

## Notes
- The worked example is an email agent: subagents search email history in parallel, tools operate the inbox, code-generated rules validate output, visual feedback checks HTML drafts — one concrete composition of the full loop, though presented as illustration rather than a published deployment.
- Notable ordering claim for loop builders: prefer deterministic (rules-based) verification first, visual second, model-judged last — the inverse of how tempting each is to implement.
