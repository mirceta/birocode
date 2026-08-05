# Writing effective tools for AI agents — using AI agents (Anthropic)

**Source:** https://www.anthropic.com/engineering/writing-tools-for-agents (retrieved 2026-08-04)
**Author / credibility:** Official Anthropic engineering post. First-hand: "most of the advice in this post came from repeatedly optimizing our internal tool implementations with Claude Code," with held-out-test-set graphs comparing human-written vs Claude-optimized Slack and Asana MCP servers, and a cited SWE-bench state-of-the-art result attributed to tool-description refinements. Loop-relevant because it describes a closed evaluation loop in which agents improve their own tools.

## Techniques

### Prototype → evaluate → let the agent refine (tool-improvement loop)
- **What they actually do/say:** Three-phase cycle: (1) stand up quick tool implementations and test them locally with Claude Code / local MCP servers; (2) "run comprehensive evaluation" of agent performance on realistic tasks; (3) feed evaluation transcripts back to Claude: "Simply concatenate the transcripts from your evaluation agents and paste them into Claude Code. Claude is an expert at analyzing transcripts and refactoring lots of tools all at once."
- **Evidence:** demonstrated — held-out test graphs show Claude-optimized Slack/Asana MCP servers beating the human-written versions.
- **Cited:** https://www.anthropic.com/engineering/writing-tools-for-agents (retrieved 2026-08-04).

### Realistic multi-call eval tasks with verifiable outcomes
- **What they actually do/say:** Eval tasks should require "multiple tool calls—potentially dozens" and mirror real workflows (scheduling a meeting with a document attached, investigating a duplicate charge across customer records). Pair each prompt with "a verifiable response or outcome," from exact string match to Claude-based judgment. Warning: avoid "overly strict verifiers that reject correct responses due to spurious differences." Evals were grounded in "real projects, documents, and messages" from their internal workspace.
- **Evidence:** demonstrated — their own eval methodology used to produce the published comparisons.
- **Cited:** https://www.anthropic.com/engineering/writing-tools-for-agents (retrieved 2026-08-04).

### Mine agent transcripts, including what agents omit
- **What they actually do/say:** Review agent reasoning/chain-of-thought blocks and raw transcripts including tool calls; "what agents omit in their feedback can often be more important than what they include" — silent workarounds and unused tools mark tooling defects.
- **Evidence:** demonstrated — part of their practiced analysis workflow.
- **Cited:** https://www.anthropic.com/engineering/writing-tools-for-agents (retrieved 2026-08-04).

### Token-efficient responses: format enums, pagination, truncation defaults
- **What they actually do/say:** Response-format enums let the agent request "detailed" (206 tokens) vs "concise" (72 tokens) responses — the concise Slack format used "~1/3 of the tokens." Pagination/truncation with "sensible default parameter values" plus steering language that encourages targeted searches over exhaustive dumps.
- **Evidence:** demonstrated — token counts measured on their own Slack tooling.
- **Cited:** https://www.anthropic.com/engineering/writing-tools-for-agents (retrieved 2026-08-04).

### Semantic IDs over UUIDs
- **What they actually do/say:** Replace opaque IDs with human-readable names: "resolving arbitrary alphanumeric UUIDs to more semantically meaningful language" improves agent precision (fewer hallucinated/mistyped IDs in long tool chains).
- **Evidence:** demonstrated — reported from their optimization work.
- **Cited:** https://www.anthropic.com/engineering/writing-tools-for-agents (retrieved 2026-08-04).

### Actionable error responses
- **What they actually do/say:** Tool errors should give "specific and actionable improvements, rather than opaque error codes" — the error message is the loop's steering signal after a failed action.
- **Evidence:** recommended — advised with rationale; no isolated measurement given.
- **Cited:** https://www.anthropic.com/engineering/writing-tools-for-agents (retrieved 2026-08-04).

### Tool consolidation and namespacing
- **What they actually do/say:** Consolidate workflows into single tools handling "multiple discrete operations" (e.g. `schedule_event` wrapping availability search + booking); namespace related tools with prefixes (`asana_projects_search`, `asana_users_search`) to reduce wrong-tool selection. Descriptions written "as you would describe your tool to a new hire," with unambiguous parameter names.
- **Evidence:** demonstrated — patterns applied in the measured Slack/Asana optimizations; SWE-bench: "Claude Sonnet 3.5 achieved state-of-the-art performance on the SWE-bench Verified evaluation after we made precise refinements to tool descriptions, dramatically reducing error rates."
- **Cited:** https://www.anthropic.com/engineering/writing-tools-for-agents (retrieved 2026-08-04).

## Notes
- The meta-point for loop design: tool quality is itself loop-optimizable — build an eval harness once, then let the agent iterate on its own interface using its failure transcripts as input. This mirrors the multi-agent research system's tool-testing agent (40% task-time reduction; see anthropic-multi-agent-research-system.md).
- Verifier-strictness warning generalizes to any loop gate: a verifier that rejects correct work sends the loop chasing spurious differences.
