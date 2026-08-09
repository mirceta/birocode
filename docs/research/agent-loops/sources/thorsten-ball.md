# Thorsten Ball

**Author / credibility:** Author of *Writing an Interpreter in Go* and *Writing a Compiler in Go*; engineer at Sourcegraph building Amp, a commercial coding agent. Credible on agentic loops from the *builder's* side: his "How to Build an Agent" is the widely referenced from-scratch construction of a working code-editing agent loop, with complete runnable Go code and real transcripts. First-hand practice (he builds and ships agent loops professionally); the tutorial demonstrates the minimal inner loop that products like Amp and Claude Code elaborate on.

**Primary sources retrieved:**
- https://ampcode.com/notes/how-to-build-an-agent — retrieved 2026-08-04

## Techniques

### The minimal agent loop: "an LLM, a loop, and enough tokens"
- **What they actually do/say:** He builds a working code-editing agent in Go in roughly 190–300 lines ("315 lines" per his announcement), "most of which is boilerplate." Loop structure: prompt user → append to conversation → send conversation to Claude → if the response contains `content.Type == "tool_use"`, execute the requested tool locally, append the tool result to the conversation, and send it back — repeating until the model answers in plain text. The conversation array is the loop's entire state. His thesis: "It's an LLM, a loop, and enough tokens," and there is no secret sauce beyond that ("There is no moat," per his announcement of the post).
- **Evidence:** demonstrated — complete source code plus terminal transcripts of the agent running are in the post.
- **Cited:** https://ampcode.com/notes/how-to-build-an-agent retrieved 2026-08-04

### Three primitive tools are enough for a code-editing loop
- **What they actually do/say:** The agent gets exactly three tools: `read_file` (contents at a path), `list_files` (directory listing), and `edit_file` (string replacement of `old_str` with `new_str`). With only these, the transcripts show Claude autonomously creating `fizzbuzz.js`, editing it to change the run bound from 100 to 15 while updating comments, and writing a `congrats.js` with ROT13 decoding — verified by actual execution output shown in the post.
- **Evidence:** demonstrated — tool definitions and multi-step editing sessions shown verbatim.
- **Cited:** https://ampcode.com/notes/how-to-build-an-agent retrieved 2026-08-04

### Rely on the model's tool-use training; the harness just executes and echoes
- **What they actually do/say:** The loop works because current models are "trained and fine-tuned to use tools" and know their knowledge limits: "you tell the model what tools are available," and "when the model wants to execute the tool, it tells you, you execute the tool and send the response up." The harness's job is deliberately dumb — faithful execution and result-echoing — with all planning and sequencing left to the model.
- **Evidence:** demonstrated — this is the operating principle of the shown code, argued from its observed behavior.
- **Cited:** https://ampcode.com/notes/how-to-build-an-agent retrieved 2026-08-04

## Search trail
- "Thorsten Ball \"how to build an agent\" amp agentic loop" — surfaced the primary post (fetched) plus derivative ports (Python/Medium, voxmenthe/coding-agent) and podcast appearances (Changelog #648) — derivatives not used.
- "Thorsten Ball registerspill agents feedback loop \"let it run\" claude code" — search tool returned "unavailable" error (recorded as a failed access; retried below).
- "registerspill.thorstenball.com essay coding agents autonomous" — retry succeeded but surfaced no additional substantive first-hand loop essay from his newsletter, only his announcement of the build-an-agent post and unrelated arXiv papers. His newsletter (Register Spill) remains a candidate for a later refresh pass; this file rests on the one strong demonstrated source.
