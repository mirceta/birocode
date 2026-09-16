# Design — arch conversation session isolation

## D1. Where sessions come from, per key kind

| key | session for a driven loop's send |
|---|---|
| repo dock (`r-…`) | the loop's pin; if null, the newest transcript in the repo folder, locked in once (unchanged — one folder, one conversation) |
| arch (`@arch`, `@arch:<id>`) | `ResolveArchSessionId(key)`: the loop's pin (if it is this conversation's), else the session `arch.json` recorded for this conversation, else **null → fresh CLI session**. Never the folder's newest transcript. |

`TickRepo` branches on `ArchAgentService.ResolvesSessionFromNewestTranscript(repo.Id)`
(false for every arch key). The last-assistant read for the loop decision uses
`LastAssistantMessageIn(home, sessionId)` when a session is known and null otherwise, as
before.

## D2. Ownership is enforced at both ends

- `ArchStateStore.OwnerOfSession(sid)` = the one conversation whose `SessionId` is `sid`.
- `NoteArchSession(key, sid)`: if another conversation owns `sid`, log an error, drop this
  key's loop pin if it named `sid`, and do NOT record it — the conversation's next turn
  starts fresh instead of joining.
- `ResolveArchSessionId(key)`: a loop pin naming another conversation's session is dropped
  (logged) before falling through to the recorded session.

## D3. Repair of a store that already fused

`ArchStateStore.SplitSharedSessions()` groups conversations by session id; for each group
larger than one it keeps the default conversation if present (else the oldest by
`CreatedAt`) and clears the others; returns the cleared ids and saves once.
`ArchAgentService.RepairSharedSessions()` clears those ids' loop pins too and logs each
detachment. It runs first in the engine's arch tick, before `PolicemanTick`, so the very
first tick after deploy heals the live store: `@arch` keeps `sess-shared`, `@arch:policeman`
is detached; the policeman's next pass starts a new session (with its handover, whose text
says the previous session was cut — here by the repair, its turns remain readable in the
Arch chat's transcript).

## D4. What the Operator will see after deploy

- The Arch chat: its transcript is intact and still contains the fused policeman turns
  (they were written to that session; nothing can un-write them). New turns are the arch's
  only.
- The Policeman subtab: session #N starts small, its own; the sessions strip shows the old
  shared session as ended.

## D5. Tests

`ArchConversationSessionIsolationTests`: the rule per key kind; ownership lookup;
split keeps the default and detaches the policeman (persisted, idempotent); split keeps the
older sibling; distinct sessions untouched; a new reserved conversation has no session.
