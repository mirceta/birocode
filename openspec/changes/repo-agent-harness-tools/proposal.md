# Three more harness tools for every repo agent — and the Tools tab lists them

Board task `03e041f16bd6419690a415c6ed1b4e1e` (Operator, 2026-09-19).

## Why

Every repo agent's turn already carries the harness's own MCP server, `claude-web`
(openspec cross-repo-effort-legs: `my_effort`, `report_leg`). Three things a repo agent
still cannot do for itself, and has to be told or done for by a human every time:

1. **Know the harness.** Only the birocode agent knows what a harness feature is and how a
   repo uses it (the Understanding app, the Local tab, the loop markers…), because
   birocode *defines* it. Every other agent is re-taught from scratch, or remembers from a
   past session if it happens to.
2. **Queue its own prompts.** The dock's prompt stash is the queue loop's queue, but only a
   human can put prompts in it — so "here is one long instruction with many tasks, split
   it and work through it" needs a human to do the splitting.
3. **Arm its own loop.** Only the Operator (and, since arch-loop-tools, the arch) can arm a
   loop on an agent.

The Tools tab of the agent dock shows the Birokrat API server only; the harness's own
server is invisible there, so the Operator cannot see what a repo agent can call.

## What changes

Three tools on the existing `claude-web` server — same registration, same endpoint, same
bearer, same "identity comes from the URL the harness wrote" rule:

| tool | does | reuses |
|---|---|---|
| `harness_help` | With no arguments: the index of harness topics. With `topic`: that topic's text (a whole convention doc, or one section). With `query`: the best-matching topic/section for a question ("how do I update the understanding app"). Every answer names its source file and prefixes what it means **for this repo** (its own paths and Local-tab URL). | The convention docs in the harness's own checkout (`docs/*.md`), read **live** from the self repo the harness registers at startup; the same files embedded in the build as the fallback when that checkout is not on disk. No hand-written knowledge: the index is the docs' headings. |
| `stash_prompt` | Adds a prompt to the agent's **own** dock tab's stash (the queue). Returns the queue as it stands. `first` puts it at the head. | `DockRegistry.AddStash` / `ReorderStash` — the same store the dock and the queue loop use. The tab is the one this agent runs in (the run's session → tab), else the repo's dashboard/newest tab. |
| `arm_my_loop` | `action` = start (default) · update · stop · status. Start takes the Loop panel's parameters: kind (suggestion · recipe · goal · queue), mode, goal / recipe / prompt + sentinel, maxIterations, verifyEnabled, includeFooterClauses. The queue kind resolves the agent's own tab. | The arch's arming path (`ArchAgentService.StartLocalLoop` / `UpdateLocalLoop`), extracted into one shared `LoopArmer` so the arch and the repo agent arm the very same way; `ArchLoopTools` validation; `LoopConfigStore`; the autopilot gate (closed gate = refused, like the panel and the arch). Armed by **`agent`**, visible on the Loop panel. |

And the Tools tab: `GET /api/tools?repoId=` now also returns the harness server (name,
transport, URL, token minted) and its tool catalogue read from `tools/list` — the same
catalogue the agent sees, so it cannot drift — and the panel lists it above the Birokrat
section, one block per tool with its parameters, "always on, nothing to save".

## Out of scope

Tool calls from other machines' agents (the server is per harness, as before); a
`request_human` tool (human-delegation-watchers); editing or deleting stash items by the
agent (add only — the Operator curates); arming loops on *other* agents (the arch's job).
