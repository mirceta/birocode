# Design — arch-conversations

## D1. The conversation key IS the instance key

Everything that was keyed by the reserved id `@arch` — the run slot
(`RunSessionService`), the loop slot (`LoopConfigStore`), the engine state, the audit
rows, the transcript session pin — is keyed by the conversation key instead:
`@arch` for the default, `@arch:<8 hex>` for the rest. `ArchAgentService.IsArchKey`
recognises the shape; `KeyOrDefault` maps null/foreign ids to the default. So the
engine, the controllers and the client change from `== ReservedId` to `IsArchKey` and
pass the key through — no second mechanism.

## D2. One record per conversation in arch.json

`ArchStateStore.Conversations`: `{Id, Name, SessionId, Watermark, StandingLoopMode,
StandingLoopCap, CreatedAt}`. The legacy top-level fields (`Watermark`, `LastSessionId`,
`StandingLoopMode/Cap`) are read once on load to seed the default record when no
`Conversations` list exists, and are mirrored from the default record on every save so
an older build still reads the default conversation. The scope, the fleet consents and
the driven quiet floor stay harness-wide.

## D3. Wake drafts and watermarks are per key

`ComposeWake(key)` reads past THAT conversation's watermark and parks the draft under
the key; `CommitWake(key, sessionId)` moves that watermark. Two armed conversations
therefore each receive every managed repo turn once — by design: they are two
operators' worth of attention on the same fleet. The `IArchWakeSource` interface takes
the key; `ArchLoop.Decide` passes `ctx.Instance.RepoId`.

## D4. The engine ticks every conversation that has a loop slot

`Tick` iterates `_arch.ConversationLoops()` (every loop instance whose key is an arch
key) and ticks `HomeInfoFor(key)` — the same synthetic repo view (shared home as cwd,
the conversation's name as display name). The driven-loop policy, the MCP config, the
disallowed tools, the session note-back and the standing-loop restore all key on
`repo.Id`.

## D5. Tools require SOME armed conversation

`ArmedOrRefusal` (the gate every arch send tool passes) accepts an active loop on any
conversation. The tool audit still names the conversation the send came from through
the run's repoId.

## D6. Arch tab: lanes, Loops lane, split

The loop cards (standing wake loop, driven loop) move out of the side column into a
**Loops** lane of the conversation they belong to; the side column and the Fleet lane
keep the fleet-wide cards (Managed agents, Fleet, Home repo), which is also all the
Status tab shows now (`view="cards"`). A **split** toggle (per device, `arch.split`)
turns the lane chips into toggles for up to three columns (`arch.splitLanes`); the chat
column keeps the composer; the side column hides while the split is on (the split IS
the side-by-side). `useArchStream` takes `repoId: conv` and a stream path that may
already carry a query (`?conv=` → `&after=`).

## D7. Management App: dynamic sibling tabs

The app loads `/api/arch/conversations` and builds its tab list as
`['arch', ...'arch:<id>' for each non-default, ...rest]`. The persisted order, hidden
set and weights learn new keys by slotting them after their default predecessor
(`readOrder(tabs)`), so a new conversation appears right after Arch without a reset. A
`＋` in the strip prompts for a name, POSTs, reloads the list and opens the tab. The
Arch page reports renames/removals through `onConversationChanged` so the labels
follow and a removed conversation's tab falls back to Arch.

## Alternatives considered

- A single conversation with named "threads" inside one transcript — rejected: one
  session cannot run two turns at once, and the loop slot is per session.
- A separate `ArchConversationService` — rejected: it would duplicate the arm/resume/
  restore ladder that already exists per key.
