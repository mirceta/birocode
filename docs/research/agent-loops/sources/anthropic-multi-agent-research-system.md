# How we built our multi-agent research system (Anthropic)

**Source:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04)
**Author / credibility:** Official Anthropic engineering post about a shipped production system — the Research feature in Claude — written by the team that built and operates it. First-hand demonstrated engineering with published performance numbers (90.2% improvement over single-agent on their internal eval; token-use analysis) and production-operations detail (deployments, checkpointing). One of the most evidence-dense official sources on multi-agent loops.

## Techniques

### Orchestrator-workers with parallel subagents
- **What they actually do/say:** A lead agent "analyzes [queries], develops a strategy, and spawns subagents to explore different aspects simultaneously." "The lead agent spins up 3-5 subagents in parallel rather than serially" and subagents themselves "use 3+ tools in parallel," which "cut research time by up to 90% for complex queries."
- **Evidence:** demonstrated — production architecture with measured latency improvement.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### Explicit effort-scaling rules in the prompt
- **What they actually do/say:** The lead agent's prompt embeds sizing guidelines: "Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents." This prevents both over-spawning on trivial queries and under-resourcing hard ones.
- **Evidence:** demonstrated — actual prompt guidance from the production system.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### Iterate-or-stop decision loop at the orchestrator
- **What they actually do/say:** After subagents return, the lead agent "synthesizes these results and decides whether more research is needed—if so, it can create additional subagents or refine its strategy." The stop decision lives at the coordinator, not the workers, preventing endless searching.
- **Evidence:** demonstrated — production loop structure.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### Extended thinking as a controllable scratchpad
- **What they actually do/say:** "Extended thinking mode... can serve as a controllable scratchpad. The lead agent uses thinking to plan its approach, assessing which tools fit the task, determining query complexity and subagent count." Subagents use "interleaved thinking after tool results to evaluate quality, identify gaps, and refine" their next queries — per-step self-evaluation inside the loop.
- **Evidence:** demonstrated — described as how the shipped system works.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### Source-quality heuristics in prompts (fix for reward-hacking search)
- **What they actually do/say:** "Human testers noticed that our early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources." Fix: "source quality heuristics to our prompts" plus explicit tool-selection heuristics ("examine all available tools first, match tool usage to user intent, search the web for broad external exploration, or prefer specialized tools").
- **Evidence:** demonstrated — observed failure mode plus the deployed prompt fix.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### Self-improving prompts and tools (agent debugs the agent)
- **What they actually do/say:** "When given a prompt and a failure mode, [Claude 4 models] are able to diagnose why the agent is failing and suggest improvements." They built "a tool-testing agent—when given a flawed MCP tool, it attempts to use the tool and then rewrites the tool description to avoid failures," yielding a "40% decrease in task completion time for future agents."
- **Evidence:** demonstrated — built agent with a measured result.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### LLM-as-judge with a fixed rubric; end-state evaluation
- **What they actually do/say:** "A single LLM call with a single prompt outputting scores from 0.0-1.0 and a pass-fail grade was the most consistent and aligned with human judgements," grading factual accuracy, citation accuracy, completeness, source quality, and tool efficiency. For agents that mutate persistent state: "evaluate whether it achieved the correct final state" rather than validating "every intermediate step." Human testing retained because "people testing agents find edge cases that evals miss" (hallucinated answers, subtle source-selection bias).
- **Evidence:** demonstrated — their actual evaluation methodology, with the comparison of judge designs they tried.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### External memory before context truncation
- **What they actually do/say:** The lead agent persists "its plan to Memory... since if the context window exceeds 200,000 tokens it will be truncated." Agents "summarize completed work phases and store essential information in external memory before proceeding to new tasks" and later "retrieve stored context like the research plan from their memory rather than losing previous work."
- **Evidence:** demonstrated — production mechanism with the concrete truncation threshold.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### Artifact systems: pass references, not payloads
- **What they actually do/say:** "Rather than requiring subagents to communicate everything through the lead agent, implement artifact systems where specialized agents can create outputs that persist independently." Subagents "call tools to store their work in external systems, then pass lightweight references back to the coordinator," preventing "information loss during multi-stage processing."
- **Evidence:** demonstrated — production design.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### Durable execution: checkpoints + retry instead of restart
- **What they actually do/say:** The system "can resume from where the agent was when the errors occurred" rather than restarting from the beginning, combining "the adaptability of AI agents built on Claude with deterministic safeguards like retry logic and regular checkpoints."
- **Evidence:** demonstrated — production reliability engineering.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

### Rainbow deployments for in-flight agents
- **What they actually do/say:** "Whenever we deploy updates, agents might be anywhere in their process." They use "rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from old to new versions while keeping both running simultaneously."
- **Evidence:** demonstrated — production ops practice.
- **Cited:** https://www.anthropic.com/engineering/multi-agent-research-system (retrieved 2026-08-04).

## Notes
- Headline numbers: multi-agent (Opus 4 lead + Sonnet 4 subagents) "outperformed single-agent Claude Opus 4 by 90.2%" on their internal research eval; token usage explains "80% of the variance" in BrowseComp performance; multi-agent systems use "about 15× more tokens than chats" — so the architecture only pays for high-value tasks.
- Stated limitation: "Our lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks." Async execution "would enable additional parallelism... But this asynchronicity adds challenges in result coordination, state consistency, and error propagation."
- Definition used: a multi-agent system is "multiple agents (LLMs autonomously using tools in a loop) working together."
