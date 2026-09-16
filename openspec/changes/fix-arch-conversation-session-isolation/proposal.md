# Fix: every arch conversation keeps its own CLI session — the policeman fused with the Arch chat

## Why

After PR #100 the Operator started the policeman and the Operator-facing **Arch chat was
answered by the policeman**: the two conversations had become one transcript. Corroborating
evidence: the "policeman" sessions rolled over at ~628k tokens (cap 400k) — a freshly armed
policeman loop has a tiny transcript; only the Arch chat's whole history is that large.

Root cause (harness bug, present on main before the policeman but only reachable now):
`AutopilotService.TickRepo` resolves a driven loop's session as *the loop's pin, else the
newest transcript in the working directory, then lock it in*. That is correct for a repo
dock (one repo folder = one conversation). But **every arch conversation runs in the one
arch home**, so "the newest transcript in the folder" is whichever arch conversation spoke
last — the Operator's Arch chat. The policeman is the first conversation ever armed with a
driven loop *before* its first turn, so its first tick resumed the Arch chat's session and
`NoteArchSession` then recorded that session as the policeman's too. From then on both
conversations resumed the same session: Operator messages typed to the Arch were answered
by the policeman prompt's context, the policeman's verdicts landed in the Arch chat, and
every rollover the policeman did (clearing its session id) re-fused it on the next tick.

The existing sibling-conversation feature (openspec arch-conversations) never hit this only
because a sibling always gets its first session from an Operator turn (no session id →
fresh CLI session) before any loop is armed on it.

## What changes

1. **The engine rule.** For an arch key the tick resolves the session through
   `ArchAgentService.ResolveArchSessionId` only — the loop's pin, else the session the
   harness recorded for that conversation — and NEVER from the folder's newest transcript;
   with none it starts a fresh CLI session, exactly like a sibling's first Operator turn.
   `ArchAgentService.ResolvesSessionFromNewestTranscript(repoId)` names the rule.
2. **Ownership.** A CLI session is one-to-one with an arch conversation
   (`ArchStateStore.OwnerOfSession`). `NoteArchSession` refuses to bind a session another
   conversation owns (logged, the loop pin dropped) and `ResolveArchSessionId` drops a
   stale pin that names a sibling's session.
3. **Repair.** `RepairSharedSessions` runs on every engine tick: any session two
   conversations share is split — the Operator-facing conversation keeps it (else the
   oldest), the others are detached (state + loop pin) and start fresh. This heals the
   live store on the first tick after deploy: the Arch chat keeps its transcript (which,
   unavoidably, now contains the policeman's fused turns), the policeman starts clean.

## Impact

- `AutopilotService` (tick session derivation; repair on the engine tick),
  `ArchAgentService` (rule, ownership check, repair), `ArchStateStore`
  (`OwnerOfSession`, `SplitSharedSessions`).
- Tests: `ArchConversationSessionIsolationTests`.
- Spec: `arch-agent` — one session per conversation, no folder-newest resolution, repair.

## Non-goals

The Kanban card/badge UX redesign the Operator asked for in the same breath is a separate
change (to be dispatched); nothing here touches the Kanban.
