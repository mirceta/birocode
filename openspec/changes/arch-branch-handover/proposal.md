# Proposal: arch-branch-handover — let the arch finish work on an Operator-claimed branch

## Why

The Operator works with a repo agent on their own branch (birocode on DESKTOP-POAPPP3 on
`feature/arch-conversations`, say). When that work is done they want the arch agent to
take it from there: merge main in, run the tests, push, open the PR, return to main. But
the harness marked every repo whose branch the arch did not assign as `claimed`: the
arch's `read_transcript` was refused, `dispatch_task` was refused, and `send_task` worked
only with the `operatorAsked` override — which the Operator had to trigger every single
time. The same rule bit the arch's own dispatched tasks: `dispatch_task` recorded no
branch, so as soon as the assignee created its feature branch the repo counted as
claimed and the arch could neither read the result nor follow up (seen 2026-09-06 on
spacex `feature/handles` and living room `feature/pin-conversation-lanes`). Fleet board
task `379f58b3eb85474daa8e2153eec24494`.

## What

1. **Branch hand-over.** A repo's branch can be handed to the arch, which records it in
   the arch home's assignments exactly as if the arch had asked for it. Triggers: the
   dock's **Hand to arch** button (and the Management App's Status card, local or via a
   peer), and the arch tool **`adopt_branch(repoId, branch, machine, operatorAsked)`**,
   honoured only with the Operator's ask (same gate and audit as `operatorAsked` on
   `send_task`). After hand-over the repo is not claimed on that branch: reads, sends and
   dispatch work normally. Per branch; **Take back** revokes from the same button.
2. **Claimed keyed on activity, not only provenance.** A repo is claimed when its branch
   is not the arch's AND a human was the last actor on it within the activity window
   (default 2 h, operator-set), or the Operator pinned it as theirs. Outside that window
   an unassigned branch is available again with `claimedReason: "unassigned-branch"`:
   reads allowed, sends allowed if the task text (or the send's `branch`) names the
   branch — else `state-branch`. `list_agents`, `git_state`, the peer describe, the fleet
   status and the dock show the effective state and its reason (`human-active` |
   `pinned` | `unassigned-branch`).
3. **`dispatch_task` records the branch.** An optional `branch` argument (mirroring
   `send_task`) is recorded under the task id at once; otherwise the branch watch on every
   wake records the branch a dispatched task's assignee created (local repos), so the repo
   is never claimed by its own task branch.
4. **`read_transcript` accepts `operatorAsked`** like `send_task` (audited as
   claimed-override, on the peer too).
5. Role prompt (arch home `CLAUDE.md`, v5), tool descriptions and this spec updated.
6. Tests: hand-over makes a claimed repo readable/sendable, revoke restores claimed, the
   window expiry, dispatch branch recording, adopt_branch refused without the ask, audit
   wording, the assignments file's round trip.

## Non-goals

No change to the autopilot gate, no auto-merge; the arch still never pushes, merges or
deploys without the Operator's explicit ask. Typing "arch: take over" in the repo agent's
own chat (the optional third trigger) is not implemented: the dock button and the arch
conversation cover the two surfaces the Operator is on.
