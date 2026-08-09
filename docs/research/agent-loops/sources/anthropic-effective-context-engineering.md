# Effective context engineering for AI agents (Anthropic)

**Source:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04)
**Author / credibility:** Official Anthropic engineering post. First-party guidance from the team that builds Claude and Claude Code, illustrated with their own production systems (Claude Code's compaction and just-in-time retrieval, the Claude-plays-Pokemon agent, their multi-agent research system). Mix of demonstrated internal mechanisms and general advice.

## Techniques

### Treat context as a finite attention budget (context rot)
- **What they actually do/say:** "As the number of tokens in the context window increases, the model's ability to accurately recall information... decreases." Models have an "attention budget that they draw on when parsing large volumes of context." Governing principle for everything else: "Find the smallest set of high-signal tokens that maximize the likelihood of your desired outcome."
- **Evidence:** recommended — framing principle grounded in cited retrieval-degradation behavior.
- **Cited:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04), context-rot section.

### Compaction: summarize and reinitiate
- **What they actually do/say:** When a conversation nears the context limit, summarize it and restart with the compressed summary. "Compaction distills the contents of a context window in a high-fidelity manner, enabling the agent to continue with minimal performance degradation." Claude Code's implementation has the model "summarize and compress the most critical details" while "preserving architectural decisions, unresolved bugs, and implementation details."
- **Evidence:** demonstrated — Claude Code's shipped compaction is described as the concrete implementation.
- **Cited:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04), long-horizon techniques.

### Structured note-taking / agentic memory outside the window
- **What they actually do/say:** "The agent regularly writes notes persisted to memory outside of the context window. These notes get pulled back into the context window at later times" (NOTES.md-style files, to-do lists). Demonstrated by Claude playing Pokemon: it maintains "precise tallies across thousands of game steps" and "develops maps of explored regions" via self-managed notes, continuing multi-hour tasks across context resets.
- **Evidence:** demonstrated — the Pokemon agent is a concrete first-hand long-horizon run using this mechanism.
- **Cited:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04), long-horizon techniques.

### Sub-agent architectures for context isolation
- **What they actually do/say:** Specialized sub-agents work with isolated context windows while a main agent keeps high-level strategy; "each subagent might explore extensively... but returns only a condensed, distilled summary of its work" (1,000–2,000 tokens back to the coordinator). Their multi-agent research system showed "substantial improvement over single-agent systems on complex research tasks."
- **Evidence:** demonstrated — backed by their production multi-agent research system (see anthropic-multi-agent-research-system.md).
- **Cited:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04), long-horizon techniques.

### Just-in-time retrieval over pre-loading
- **What they actually do/say:** "Agents built with the 'just in time' approach maintain lightweight identifiers [file paths, queries, links]... and use these references to dynamically load data into context at runtime" instead of pre-loading everything. Claude Code does complex data analysis "without ever loading the full data objects into context" via targeted queries and bash commands. Stated tradeoff: "Runtime exploration is slower than retrieving pre-computed data."
- **Evidence:** demonstrated — Claude Code's shipped behavior is the example.
- **Cited:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04), retrieval section.

### Hybrid: pre-load the cheap stuff, explore for the rest
- **What they actually do/say:** Retrieve some data up front for speed, leave the rest to agent-driven exploration: Claude Code "naively loads CLAUDE.md files while using glob/grep for just-in-time file retrieval, effectively bypassing the issues of stale indexing."
- **Evidence:** demonstrated — Claude Code's actual design.
- **Cited:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04), retrieval section.

### Token-efficient, non-overlapping tools
- **What they actually do/say:** "Tools should be self-contained, robust to error, and extremely clear with respect to their intended use." Failure mode called out: "bloated tool sets that cover too much functionality or lead to ambiguous decision points."
- **Evidence:** recommended — advice, no specific long-horizon example in this post (demonstrated counterpart in anthropic-writing-tools-for-agents.md).
- **Cited:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04), tools section.

### Curated canonical few-shot examples
- **What they actually do/say:** Provide diverse, canonical examples rather than exhaustive edge-case lists: "For an LLM, examples are the 'pictures' worth a thousand words."
- **Evidence:** recommended — general advice, weak loop relevance (kept because examples persist in every loop iteration's context).
- **Cited:** https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (retrieved 2026-08-04), examples section.

## Notes
- Anthropic frames context engineering as the successor to prompt engineering: "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference" — for a loop, the curation problem recurs every iteration, which is why the three long-horizon mechanisms (compaction, external notes, sub-agents) are the post's core.
- The three long-horizon techniques are presented as complementary, chosen by task shape: compaction for continuity-heavy work, note-taking for milestone-heavy work with clear state, sub-agents for parallel exploration.
