# Repo Agent Requests → self-driving coordination: approve as a goal, and the arch arms its own

## Why

Fleet task 86b62a10 (the Operator, 2026-10-05), observed live on the base feature
(`repo-agent-requests`, PR #138): when the Operator approves a request that needs MULTI-STEP
coordination — agent A `hub_upload`s, the arch `hub_transfer`s, agent B `hub_download`s and
proceeds — the approval drops ONE message into the Operator-facing arch chat. The arch does
step one, then goes idle and needs the human to poke it for every subsequent step. A
coordination job like that should self-drive, and the Operator-facing chat must stay a plain
chat for oversight.

## What the code says (verified)

- A **goal conversation** (openspec arch-goal-conversations) is exactly the self-driving shape:
  `ArchAgentService.StartGoal(text, repoRefs, taskIds, maxIterations, by, machine, mode)` opens
  a new conversation owning the named agents, arms a goal loop (the arch on a timer, re-sent
  the goal every poll, checking its agents itself, until `LOOP_DONE` or the cap) and posts the
  summary back to the Operator-facing conversation. The arch has `start_arch_goal`, the
  Operator `POST /api/arch/goals`. Its tool text says "never on your own initiative".
- An approved request is delivered through `SendToArch(ReservedId, message, actor request)`
  (openspec repo-agent-requests); `AgentRequestStore` keeps `ConversationId` and `DeliveredAt`.
- The arch's guidance is the role prompt the harness writes to its home `CLAUDE.md`
  (`RoleVersionMarker`, v14), re-written when the marker changes.

## What changes

1. **Approve → drive as goal.** `POST /api/arch/requests/{id}/approve` takes
   `{ drive: true, maxIterations? }`: the harness opens a goal conversation on the requesting
   agent with the request as its goal (`ComposeRequestGoal`: the agent, the title, the text,
   "coordinate whatever it takes — send_task, hub_transfer, read replies, then the next step —
   until fulfilled, and tell the agent the outcome"), armed by the Operator, bounded by the cap
   (default 20). The goal is started FIRST; when it cannot be (unmanaged agent, agent owned by
   another goal, gate closed) the request stays as it was and the Operator sees why. The row
   remembers `mode: goal`, `goalId`, the goal's conversation; the tab shows the goal's live
   state and polls. The Operator's approval IS the authorization for the bounded loop.
2. **The Operator-facing chat stays passive.** Approve → arch chat (one message) is unchanged
   and remains right for a decision or a one-step ask. No always-on loop is ever armed on
   `@arch`.
3. **The arch recognizes coordination.** Role prompt v15: a new "Requests from repo agents"
   section explains both arrivals (a `request` message; a goal opened for it), defines
   coordination (waiting on agents across turns: upload → transfer → download, one agent after
   another, a reply before the next step) and says: when such a job arrives as a `request`
   message, do NOT do step one and go idle — the approval authorizes the bounded loop, so
   `start_arch_goal` yourself with every agent involved, report the id, let that conversation
   carry it. The `start_arch_goal` tool text names the approved request as the second
   authorization; the relayed `request` message carries the same instruction in its footer.

## Out of scope

- Automatic detection of "needs follow-through" from the request text (the Operator chooses the
  button; the arch judges a `request` message by the rule above).
- Goals over board tasks for requests (a request names an agent, not a card).
