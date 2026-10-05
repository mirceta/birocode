# Design — repo-agent-requests-goal-drive

## D1 · Reuse the goal conversation, do not build a second loop

Self-driving coordination already exists: a goal conversation is the arch on a timer, owning
its agents, bounded by a cap, ending on `LOOP_DONE` with a verification turn and a summary to
the Operator-facing conversation. Approving a request as a goal is one call into
`StartGoal` with the request as the goal text and the requesting agent as the owned repo. No
new loop kind, no new conversation kind, no change to how goals end.

## D2 · Start the goal first, then decide

`ApproveAgentRequestAsGoal` calls `StartGoal` before touching the row. A refusal (the agent is
not in the arch scope, is already driven by another goal, the gate is closed) leaves a pending
request pending and returns the refusal with the way out ("put the agent in the arch scope, or
approve it as a message"). Only a started goal marks the row approved + delivered with
`mode: goal`, `goalId`, `conversationId`. `StartGoal` gained an overload handing back the goal
it started, so the id is read, never parsed out of a view.

## D3 · The requesting agent is the goal's scope

The goal drives the requesting agent (resolved from the row's machine + handle through the
same `ResolveAgentRef` the arch tools use). The arch may `send_task` other managed agents from
a goal conversation as any arch turn can; it is the requesting agent whose outcome defines
done, so that is the one the goal owns. The goal text says so: "Done = the requesting agent
has what it asked for (or a clear answer why not)".

## D4 · The Operator-facing chat stays a plain chat

Nothing here arms a loop on `@arch`. A message approval is still one `SendToArch`; a goal
approval opens its own conversation; the arch, when it self-arms off a `request` message,
opens its own conversation too and reports the id in `@arch`. The summary still comes back to
`@arch` through the existing goal-summary path.

## D5 · Guidance in three places, one rule

The rule — coordination = waiting on agents across turns; the approval authorizes a bounded
goal; one-step asks are answered in place — is stated in the role prompt (v15, the arch's
`CLAUDE.md`), in the `start_arch_goal` tool description (the second authorization), and in the
footer of the relayed `request` message (the moment it matters). The tab's hint says which
button is for which case.

## D6 · The tab reads the goal's live state

`GET /api/arch/requests` wraps a goal-driven row as `{ request, goal: { id, state,
conversation, name, iterations, cap } }` from the arch state and the loop store, so the card
shows "approved · goal running · driven by goal conversation <name> · n/cap polls" and later
"goal done | stopped | capped" without a second endpoint.
