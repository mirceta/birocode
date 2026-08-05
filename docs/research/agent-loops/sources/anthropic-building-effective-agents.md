# Building Effective AI Agents (Anthropic)

**Source:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04)
**Author / credibility:** Official Anthropic engineering post, published first-party on anthropic.com/engineering. Anthropic builds the Claude models and the agent products this dossier's loop framework drives, and the post states its guidance comes from working "with dozens of teams building LLM agents across industries" plus Anthropic's own production agents (SWE-bench coding agent, customer-support agents, computer-use reference implementation). First-hand vendor guidance with some demonstrated production examples; the taxonomy itself is advisory.

## Techniques

### Agent = LLM + tools + environmental feedback in a loop
- **What they actually do/say:** The core definition: "Agents are typically just LLMs using tools based on environmental feedback in a loop." Contrast: "Workflows are systems where LLMs and tools are orchestrated through predefined code paths" vs agents, which "dynamically direct their own processes and tool usage."
- **Evidence:** recommended — a definitional framing, backed by their cookbook and reference implementations but stated as guidance.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Agents" section.

### Ground truth from the environment at every step
- **What they actually do/say:** "During execution, it's crucial for the agents to gain 'ground truth' from the environment at each step (such as tool call results or code execution) to assess its progress." The loop's self-assessment must be anchored in real environment signals, not the model's own belief.
- **Evidence:** recommended — stated as a principle; the SWE-bench appendix example applies it (tests as ground truth) but the post shows the principle, not a run.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Agents" section.

### Explicit stopping conditions (max iterations) plus completion
- **What they actually do/say:** "The task often terminates upon completion, but it's also common to include stopping conditions (such as a maximum number of iterations) to maintain control." Loop termination is dual: done-signal OR hard iteration cap.
- **Evidence:** recommended — advised control measure, no run shown.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Agents" section.

### Human checkpoints inside the loop
- **What they actually do/say:** "Agents begin their work with either a command from, or interactive discussion with, the human user. Once the task is clear, agents plan and operate independently, potentially returning to the human for further information or judgement." And: "Agents can then pause for human feedback at checkpoints or when encountering blockers." Autonomy is bracketed — clear task in, checkpoint/blocker pauses during.
- **Evidence:** recommended — described pattern; their customer-support and coding agents are cited as embodiments but the checkpoint mechanics are not shown.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Agents" section.

### Evaluator-optimizer loop
- **What they actually do/say:** One LLM generates a response, a second LLM evaluates and feeds back, iterating. "This workflow is particularly effective when we have clear evaluation criteria, and when iterative refinement provides measurable value." The generator/critic split is a workflow (fixed loop shape), not a free agent.
- **Evidence:** recommended — pattern in their cookbook (https://platform.claude.com/cookbook/patterns-agents-basic-workflows) but the post itself only describes it.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Evaluator-optimizer" workflow.

### Orchestrator-workers
- **What they actually do/say:** A central LLM dynamically decomposes the task and delegates to worker LLMs. "The key difference from parallelization is its flexibility—subtasks aren't pre-defined, but determined by the orchestrator."
- **Evidence:** recommended — described with cookbook reference; production-scale demonstration is in the separate multi-agent-research-system post.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Orchestrator-workers" workflow.

### Parallelization: sectioning and voting
- **What they actually do/say:** Two variants: sectioning (independent subtasks in parallel) and voting (same task run multiple times for diverse outputs). Example given: "Reviewing a piece of code for vulnerabilities, where several different prompts review and flag the code." Guardrail variant: "one model instance processes user queries while another screens them for inappropriate content."
- **Evidence:** recommended — pattern description with examples, no run shown.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Parallelization" workflow.

### Prompt chaining with programmatic gates
- **What they actually do/say:** Decompose a task into a fixed sequence of LLM calls with programmatic checks ("gates") between steps, e.g. "Generating Marketing copy, then translating it into a different language." Loop-relevant as the simplest verified-step pipeline.
- **Evidence:** recommended — cookbook pattern, described only.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Prompt chaining" workflow.

### Use agents only when steps are unpredictable; sandbox + guardrail them
- **What they actually do/say:** Use agents where "it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path"; otherwise use workflows. "The autonomous nature of agents means higher costs, and the potential for compounding errors. We recommend extensive testing in sandboxed environments, along with the appropriate guardrails." Also: "Agentic systems often trade latency and cost for better task performance."
- **Evidence:** recommended — explicit advice on when-to-loop and containment.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "When (and when not) to use agents".

### Agent-computer interface (ACI) engineering
- **What they actually do/say:** "Invest just as much effort in creating good agent-computer interfaces (ACI)" as in human-computer interfaces: "Put yourself in the model's shoes... A good tool definition often includes example usage, edge cases, input format requirements, and clear boundaries." Demonstrated fix from their SWE-bench agent: "the model would make mistakes with tools using relative filepaths after the agent had moved out of the root directory. To fix this, we changed the tool to always require absolute filepaths" — error rate dropped after the change.
- **Evidence:** demonstrated — the absolute-filepath fix is a concrete first-hand tooling change from their own SWE-bench agent work.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), "Prompt engineering your tools" appendix.

### Simplicity and transparency as loop design principles
- **What they actually do/say:** Three closing principles: "Maintain simplicity in your agent's design." "Prioritize transparency by explicitly showing the agent's planning steps." "Carefully craft your agent-computer interface (ACI) through thorough tool documentation and testing."
- **Evidence:** recommended — stated principles.
- **Cited:** https://www.anthropic.com/engineering/building-effective-agents (retrieved 2026-08-04), summary section.

## Notes
- The workflow-vs-agent distinction is this post's load-bearing definition and is reused across all later Anthropic agent posts: predefined code paths = workflow; model-directed looping = agent.
- Concrete artifacts referenced: computer-use reference implementation (https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo) and the patterns cookbook (https://platform.claude.com/cookbook/patterns-agents-basic-workflows); production examples cited are the SWE-bench coding agent and customer-support agents.
- Warning baked into the taxonomy: don't reach for the agent loop when a fixed workflow (chain/route/parallelize) suffices — agents are the high-cost, compounding-error end of the spectrum.
